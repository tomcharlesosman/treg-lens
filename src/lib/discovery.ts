import { AeoError, resolveCredentials } from "./aeo";

/** Contracts verified with Treg catalog_get on 2026-10-19. */
const BASE = "https://treg.to";
const IDEAS_ROUTE = "treg.google.keywords.ideas";
const IDEAS_PROVIDER = "anyapi.google.keywords.ideas";
// The normalized organic route drops People Also Ask. Cloro explicitly returns
// peopleAlsoAsk, so this stage intentionally uses its documented native field.
const PAA_ENDPOINT = "cloro.google.serp.organic";
const MAX_KEYWORDS_PER_SEED = 8;
const MAX_PAA_LOOKUPS = 3;
type JsonRecord = Record<string, unknown>;
type Fetcher = typeof fetch;

export interface DiscoveryInput {
  seeds: string[];
  brand: string;
  domain?: string;
  token?: string;
  estimateOnly?: boolean;
  maxCostUsd?: number;
}
export interface DiscoveryCandidate {
  id: string;
  text: string;
  kind: "question" | "keyword";
  origin: "People Also Ask" | "Keyword idea";
  seed: string;
  keyword: string;
  searchVolume: number | null;
  provider: string;
}
export interface DiscoveryEstimate {
  currency: "USD";
  totalCostUsd: number;
  maxCalls: number;
  breakdown: Array<{
    label: string;
    endpointId: string;
    calls: number;
    costPerCallUsd: number;
    subtotalUsd: number;
  }>;
  note: string;
  pricedAt: string;
}
export interface DiscoveryResult {
  acceptedEstimate?: DiscoveryEstimate;
  candidates: DiscoveryCandidate[];
  keywordCount: number;
  questionCount: number;
  totalCostUsd: number;
  totalCostKnown: boolean;
  reservedCostUsd: number;
  errors: Array<{
    stage: "keywords" | "questions";
    seed: string;
    error: string;
  }>;
  completedAt: string;
  callIds: string[];
  locale: { country: "US"; language: "en" };
}
const object = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const money = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
function plainText(value: unknown) {
  return string(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function volume(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function validateDiscoveryInput(value: unknown): DiscoveryInput {
  const input = object(value);
  if (
    !Array.isArray(input.seeds) ||
    input.seeds.length < 2 ||
    input.seeds.length > 3
  )
    throw new AeoError("Add 2 or 3 seed keywords.");
  const seeds: string[] = [];
  for (const seed of input.seeds) {
    if (
      typeof seed !== "string" ||
      seed.trim().length < 2 ||
      seed.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(seed)
    )
      throw new AeoError(
        "Each seed must contain 2–100 characters on one line.",
      );
    if (!seeds.some((item) => item.toLowerCase() === seed.trim().toLowerCase()))
      seeds.push(seed.trim());
  }
  if (seeds.length < 2)
    throw new AeoError("Use at least 2 different seed keywords.");
  if (
    input.brand !== undefined &&
    (typeof input.brand !== "string" || input.brand.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(input.brand))
  )
    throw new AeoError("Brand name must contain at most 100 characters.");
  if (input.domain !== undefined && (typeof input.domain !== "string" || input.domain.length > 253 || /[\u0000-\u001f\u007f]/.test(input.domain)))
    throw new AeoError("Send a valid project domain.");
  if (
    input.token !== undefined &&
    (typeof input.token !== "string" ||
      input.token.length > 4096 ||
      /[\r\n]/.test(input.token))
  )
    throw new AeoError("The Treg token is not valid.");
  if (
    input.estimateOnly !== undefined &&
    typeof input.estimateOnly !== "boolean"
  )
    throw new AeoError("estimateOnly must be a boolean.");
  if (input.maxCostUsd !== undefined &&
    (typeof input.maxCostUsd !== "number" || !Number.isFinite(input.maxCostUsd) || input.maxCostUsd < 0 || input.maxCostUsd > 0.1))
    throw new AeoError("Accept a valid discovery ceiling up to $0.10.");
  return {
    seeds,
    brand: string(input.brand).trim(),
    ...(typeof input.domain === "string" ? { domain: input.domain.trim() } : {}),
    ...(string(input.token).trim()
      ? { token: string(input.token).trim() }
      : {}),
    estimateOnly: input.estimateOnly === true,
    ...(typeof input.maxCostUsd === "number" ? { maxCostUsd: input.maxCostUsd } : {}),
  };
}

async function catalog(endpointId: string, fetcher: Fetcher) {
  const response = await fetcher(`${BASE}/catalog/endpoints/${endpointId}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new AeoError(
      "Treg pricing is temporarily unavailable. No discovery calls were made.",
      503,
    );
  return object(await response.json());
}
function catalogPrice(data: JsonRecord) {
  const price = object(object(data.endpoint).cost).usd;
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 0.05
  )
    throw new AeoError(
      "A verified discovery price is unavailable. No calls were made.",
      503,
    );
  return price;
}
async function quote(input: DiscoveryInput, fetcher: Fetcher) {
  const [route, ideas, paa] = await Promise.all([
    catalog(IDEAS_ROUTE, fetcher),
    catalog(IDEAS_PROVIDER, fetcher),
    catalog(PAA_ENDPOINT, fetcher),
  ]);
  const children = object(route.endpoint).routed_children;
  if (!Array.isArray(children) || !children.includes(IDEAS_PROVIDER))
    throw new AeoError(
      "The verified keyword route has changed. No calls were made.",
      503,
    );
  const excludeProviders = [
    ...new Set(
      children
        .filter((child): child is string => typeof child === "string")
        .map((child) => child.split(".")[0])
        .filter(
          (provider) => provider !== "anyapi" && /^[a-z0-9-]+$/.test(provider),
        ),
    ),
  ];
  const seedPrice = catalogPrice(ideas);
  const paaPrice = catalogPrice(paa);
  const breakdown = [
    {
      label: "Keyword ideas",
      endpointId: IDEAS_ROUTE,
      calls: input.seeds.length,
      costPerCallUsd: seedPrice,
      subtotalUsd: money(seedPrice * input.seeds.length),
    },
    {
      label: "People Also Ask",
      endpointId: PAA_ENDPOINT,
      calls: MAX_PAA_LOOKUPS,
      costPerCallUsd: paaPrice,
      subtotalUsd: money(paaPrice * MAX_PAA_LOOKUPS),
    },
  ];
  const totalCostUsd = money(
    breakdown.reduce((sum, item) => sum + item.subtotalUsd, 0),
  );
  if (totalCostUsd > 0.1)
    throw new AeoError(
      "Discovery exceeds the $0.10 limit. No calls were made.",
    );
  const estimate: DiscoveryEstimate = {
    currency: "USD",
    totalCostUsd,
    maxCalls: input.seeds.length + MAX_PAA_LOOKUPS,
    breakdown,
    note: "Conservative live catalog estimate: one keyword call per seed, then up to 3 People Also Ask lookups. Plain SERPs can cost less. US · English. Search volumes appear only when supplied by the provider.",
    pricedAt: new Date().toISOString(),
  };
  return { estimate, excludeProviders };
}
export async function estimateDiscovery(
  input: DiscoveryInput,
  fetcher: Fetcher = fetch,
): Promise<DiscoveryEstimate> {
  return (await quote(input, fetcher)).estimate;
}

export function normalizeKeywordIdeas(
  body: unknown,
  seed: string,
  provider = "anyapi",
): DiscoveryCandidate[] {
  const root = object(body);
  const output = object(root.output);
  const outputData = object(output.data);
  const raw = object(root.raw);
  const rows = [
    output.keywords,
    outputData.suggestions,
    root.keywords,
    root.suggestions,
    object(root.data).suggestions,
    object(object(raw.output).data).suggestions,
  ].find(Array.isArray) as unknown[] | undefined;
  const seen = new Set<string>();
  return (rows ?? []).flatMap((row): DiscoveryCandidate[] => {
    const item = object(row);
    const keywordData = object(item.keyword_data);
    const text = plainText(
      typeof row === "string"
        ? row
        : (item.keyword ?? item.value ?? item.text ?? keywordData.keyword),
    );
    if (
      !text ||
      text.length > 500 ||
      seen.has(text.toLowerCase()) ||
      seen.size >= MAX_KEYWORDS_PER_SEED
    )
      return [];
    seen.add(text.toLowerCase());
    return [
      {
        id: crypto.randomUUID(),
        text,
        kind: "keyword",
        origin: "Keyword idea",
        seed,
        keyword: text,
        searchVolume: volume(
          item.search_volume ??
            item.volume ??
            object(item.keyword_info).search_volume ??
            object(keywordData.keyword_info).search_volume,
        ),
        provider: plainText(provider).slice(0, 100) || "anyapi",
      },
    ];
  });
}

export function normalizePaaQuestions(
  body: unknown,
  keyword: DiscoveryCandidate,
): DiscoveryCandidate[] {
  const root = object(body);
  const result = object(root.result);
  const rawResult = object(object(root.raw).result);
  const rows = [
    result.peopleAlsoAsk,
    root.peopleAlsoAsk,
    rawResult.peopleAlsoAsk,
    object(root.output).peopleAlsoAsk,
  ].find(Array.isArray) as unknown[] | undefined;
  const seen = new Set<string>();
  return (rows ?? []).flatMap((row): DiscoveryCandidate[] => {
    const text = plainText(
      typeof row === "string" ? row : object(row).question,
    );
    if (
      !text ||
      text.length > 500 ||
      seen.has(text.toLowerCase()) ||
      seen.size >= 10
    )
      return [];
    seen.add(text.toLowerCase());
    return [
      {
        id: crypto.randomUUID(),
        text,
        kind: "question",
        origin: "People Also Ask",
        seed: keyword.seed,
        keyword: keyword.text,
        searchVolume: null,
        provider: "cloro",
      },
    ];
  });
}

function safeError(status: number) {
  if (status === 401 || status === 403)
    return "Treg could not authorize discovery. Check your token and team permissions.";
  if (status === 402)
    return "Treg could not fund this request or its quoted price limit was reached. Check billing and refresh the estimate.";
  if (status === 429) return "The discovery provider is busy. Try again later.";
  return "The discovery provider is temporarily unavailable. Successful results are retained.";
}

export async function runDiscovery(
  input: DiscoveryInput,
  fetcher: Fetcher = fetch,
): Promise<DiscoveryResult> {
  const credentials = resolveCredentials(input);
  const { estimate, excludeProviders } = await quote(input, fetcher);
  if (input.maxCostUsd !== undefined && estimate.totalCostUsd > input.maxCostUsd + 0.0000001)
    throw new AeoError("Discovery pricing changed above your accepted ceiling. Refresh the estimate; no paid calls were made.", 409);
  const errors: DiscoveryResult["errors"] = [];
  const callIds: string[] = [];
  let totalCostUsd = 0;
  let totalCostKnown = true;
  let reservedCostUsd = 0;
  async function call(
    endpointId: string,
    body: JsonRecord,
    stage: "keywords" | "questions",
    seed: string,
  ): Promise<unknown | null> {
    let receivedResponse = false;
    try {
      const price = estimate.breakdown.find(
        (item) => item.endpointId === endpointId,
      )!.costPerCallUsd;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        accept: "application/json",
        "X-Treg-Token": credentials.token,
        "X-Treg-Route-Max-Cost": String(price),
        "X-Treg-Meta": "feature=aeo-discovery",
        "Idempotency-Key": crypto.randomUUID(),
      };
      if (credentials.org) headers["X-Treg-Org"] = credentials.org;
      if (endpointId === IDEAS_ROUTE) {
        headers["X-Treg-Route-Prefer"] = "anyapi";
        headers["X-Treg-Route-Waterfall"] = "0";
        if (excludeProviders.length)
          headers["X-Treg-Route-Exclude"] = excludeProviders.join(",");
      }
      const response = await fetcher(`${BASE}/call/${endpointId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });
      receivedResponse = true;
      const callId = response.headers.get("X-Treg-Call-Id");
      if (callId && callId.length <= 200 && !/[\u0000-\u001f\u007f]/.test(callId) && !callId.includes(credentials.token)) callIds.push(callId);
      const micro = response.headers.get("X-Treg-Cost-Micro");
      const validCharge =
        micro !== null &&
        /^\d+$/.test(micro) &&
        Number.isSafeInteger(Number(micro));
      if (!validCharge) totalCostKnown = false;
      const charge = validCharge ? Number(micro) / 1_000_000 : 0;
      if (response.status === 202) {
        totalCostKnown = false;
        reservedCostUsd = money(reservedCostUsd + charge);
        throw new AeoError(
          "A discovery request is pending in Treg. Check activity before retrying; no duplicate was started.",
        );
      }
      totalCostUsd = money(totalCostUsd + charge);
      if (!response.ok) throw new AeoError(safeError(response.status));
      const result = await response.json();
      if (object(result).success === false)
        throw new AeoError(
          "The provider returned no usable result. Other successful results are retained.",
        );
      return result;
    } catch (error) {
      if (!receivedResponse) totalCostKnown = false;
      errors.push({
        stage,
        seed,
        error:
          error instanceof AeoError
            ? error.message
            : "The connection did not finish. Check Treg activity before retrying; successful results are retained.",
      });
      return null;
    }
  }
  const keywordGroups = await Promise.all(
    input.seeds.map(async (seed) => {
      const body = await call(
        IDEAS_ROUTE,
        {
          keyword: seed,
          country: "us",
          language: "en",
          limit: MAX_KEYWORDS_PER_SEED,
        },
        "keywords",
        seed,
      );
      return body
        ? normalizeKeywordIdeas(
            body,
            seed,
            string(object(object(body)._treg).served_by).split(".")[0] ||
              "anyapi",
          )
        : [];
    }),
  );
  const seenKeywords = new Set<string>();
  const keywords = keywordGroups.flat().filter((item) => {
    if (seenKeywords.has(item.text.toLowerCase())) return false;
    seenKeywords.add(item.text.toLowerCase());
    return true;
  });
  // Actual volume wins when present; otherwise preserve Google's suggestion order.
  // Interleave seeds so a single broad category does not consume all 3 SERPs.
  const ordered = keywords.some((item) => item.searchVolume !== null)
    ? [...keywords].sort(
        (a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1),
      )
    : Array.from({ length: MAX_KEYWORDS_PER_SEED }, (_, index) =>
        keywordGroups.map((group) => group[index]).filter(Boolean),
      )
        .flat()
        .filter(
          (item, index, items) =>
            items.findIndex(
              (other) => other.text.toLowerCase() === item.text.toLowerCase(),
            ) === index,
        );
  const questionGroups = await Promise.all(
    ordered.slice(0, MAX_PAA_LOOKUPS).map(async (keyword) => {
      const body = await call(
        PAA_ENDPOINT,
        { query: keyword.text, gl: "US", hl: "en", pages: 1 },
        "questions",
        keyword.text,
      );
      return body ? normalizePaaQuestions(body, keyword) : [];
    }),
  );
  const seenQuestions = new Set<string>();
  const questions = questionGroups.flat().filter((item) => {
    if (seenQuestions.has(item.text.toLowerCase())) return false;
    seenQuestions.add(item.text.toLowerCase());
    return true;
  });
  return {
    acceptedEstimate: estimate,
    candidates: [...questions, ...keywords],
    keywordCount: keywords.length,
    questionCount: questions.length,
    totalCostUsd: money(totalCostUsd),
    totalCostKnown,
    reservedCostUsd,
    errors,
    completedAt: new Date().toISOString(),
    callIds: [...new Set(callIds)],
    locale: { country: "US", language: "en" },
  };
}
