/**
 * Real, allowlisted Treg AEO integration. Pricing comes from the live catalog;
 * settled cost comes exclusively from X-Treg-Cost-Micro, never provider JSON.
 * Verified against https://treg.to/aeo and https://treg.to/integrate.md.
 */
export type Engine = "chatgpt" | "perplexity" | "gemini" | "google";

export interface AnswerResult {
  id: string;
  prompt: string;
  engine: Engine;
  answer: string;
  citations: Array<{ url: string; title: string; domain: string }>;
  mentionedBrands: string[];
  brandMentioned: boolean;
  /** Numbered recommendation rank when present; otherwise first-mention order. */
  position: number | null;
  costUsd: number;
  completedAt: string;
  costKnown?: boolean;
  sourceKind?: "web-interface" | "model-api";
  provider?: string;
}

export interface AuditInput {
  brand: string;
  domain: string;
  competitors: string[];
  prompts: string[];
  engines: Engine[];
  token?: string;
  /** Optional caller-approved ceiling for the fresh catalog reservation estimate. */
  maxCostUsd?: number;
  market?: { country: "US"; language: "en" };
}

export interface AuditError {
  prompt: string;
  engine: Engine;
  error: string;
  costUsd?: number;
  costKnown?: boolean;
}

export interface AuditResponse {
  results: AnswerResult[];
  errors: AuditError[];
  totalCostUsd: number;
  totalCostKnown?: boolean;
  completedAt: string;
}

export interface CostEstimate {
  currency: "USD";
  totalCostUsd: number;
  callCount: number;
  byEngine: Array<{
    engine: Engine;
    endpointId: string;
    calls: number;
    costPerCallUsd: number;
    subtotalUsd: number;
  }>;
  note: string;
  pricedAt: string;
}

export class AeoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AeoError";
  }
}

export const ENGINES: readonly Engine[] = [
  "chatgpt",
  "perplexity",
  "gemini",
  "google",
];
const TREG_BASE = "https://treg.to";
export const MAX_REQUEST_BYTES = 16_384;
const MAX_PROMPTS = 8;
const MAX_PROMPT_LENGTH = 500; // The routed Perplexity provider's strict limit.
const MAX_RUN_COST_USD = 1;
// At most three waves of 12 calls + a 15s catalog lookup fit maxDuration=300.
const REQUEST_TIMEOUT_MS = 90_000;

const ENDPOINTS: Record<
  Engine,
  { id: string; priceId?: string; sourceKind: "web-interface" | "model-api" }
> = {
  chatgpt: {
    id: "cloro.ai-search.chatgpt.scrape",
    sourceKind: "web-interface",
  },
  gemini: { id: "cloro.ai-search.gemini.scrape", sourceKind: "web-interface" },
  google: { id: "cloro.google.serp.ai_mode", sourceKind: "web-interface" },
  // Cloro's consumer Perplexity sessions currently fail frequently. The toolkit's
  // routed endpoint translates inputs to the reliable Sonar API provider.
  perplexity: {
    id: "treg.ai-search.perplexity.answer",
    priceId: "dataforseo.x.ai-optimization-perplexity-llm-responses-live",
    sourceKind: "model-api",
  },
};

type JsonRecord = Record<string, unknown>;
type Fetcher = typeof fetch;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeDomain(value: string): string {
  try {
    const url = new URL(
      /^https?:\/\//i.test(value.trim())
        ? value.trim()
        : `https://${value.trim()}`,
    );
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".")
    )
      throw new Error();
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new AeoError("Enter a valid brand website, such as example.com.");
  }
}

export function validateAuditInput(value: unknown): AuditInput {
  const data = record(value);
  const brand = string(data.brand).trim();
  if (!brand || brand.length > 100)
    throw new AeoError("Brand must contain 1–100 characters.");
  const rawDomain = string(data.domain).trim();
  if (rawDomain.length > 300) throw new AeoError("Brand website is too long.");
  const domain = normalizeDomain(rawDomain);
  if (
    !Array.isArray(data.prompts) ||
    data.prompts.length < 1 ||
    data.prompts.length > MAX_PROMPTS
  ) {
    throw new AeoError(
      `Choose between 1 and ${MAX_PROMPTS} prompts per audit.`,
    );
  }
  const prompts = [
    ...new Set(
      data.prompts.map((prompt) => {
        if (
          typeof prompt !== "string" ||
          !prompt.trim() ||
          prompt.trim().length > MAX_PROMPT_LENGTH
        ) {
          throw new AeoError(
            `Each prompt must contain 1–${MAX_PROMPT_LENGTH} characters.`,
          );
        }
        return prompt.trim();
      }),
    ),
  ];
  if (
    !Array.isArray(data.engines) ||
    data.engines.length < 1 ||
    data.engines.length > 4 ||
    !data.engines.every((engine) => ENGINES.includes(engine as Engine))
  ) {
    throw new AeoError("Select at least one of the four supported AI engines.");
  }
  const engines = [...new Set(data.engines)] as Engine[];
  if (
    data.competitors !== undefined &&
    (!Array.isArray(data.competitors) || data.competitors.length > 8)
  ) {
    throw new AeoError("Add at most 8 competitors.");
  }
  const competitors = [
    ...new Set(
      ((data.competitors ?? []) as unknown[]).map((name) => {
        if (
          typeof name !== "string" ||
          !name.trim() ||
          name.trim().length > 100
        ) {
          throw new AeoError("Competitor names must contain 1–100 characters.");
        }
        return name.trim();
      }),
    ),
  ].filter((name) => name.toLowerCase() !== brand.toLowerCase());
  if (
    data.token !== undefined &&
    (typeof data.token !== "string" ||
      data.token.length > 4096 ||
      /[\r\n]/.test(data.token))
  ) {
    throw new AeoError("The Treg token is not valid.");
  }
  const token = string(data.token).trim();
  if (data.maxCostUsd !== undefined && (typeof data.maxCostUsd !== "number" ||
    !Number.isFinite(data.maxCostUsd) || data.maxCostUsd <= 0 || data.maxCostUsd > MAX_RUN_COST_USD))
    throw new AeoError("The audit estimate ceiling must be greater than $0 and at most $1.");
  if (data.market !== undefined) {
    const market = record(data.market);
    if (market.country !== "US" || market.language !== "en" || Object.keys(market).some((key) => key !== "country" && key !== "language"))
      throw new AeoError("Audit measurement currently supports United States / English only.");
  }
  return {
    brand,
    domain,
    competitors,
    prompts,
    engines,
    ...(token ? { token } : {}),
    ...(typeof data.maxCostUsd === "number" ? { maxCostUsd: data.maxCostUsd } : {}),
    ...(data.market !== undefined ? { market: { country: "US", language: "en" } as const } : {}),
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.TREG_TOKEN?.trim());
}

export function resolveCredentials(input: Pick<AuditInput, "token">): {
  token: string;
  org?: string;
} {
  const token = input.token || process.env.TREG_TOKEN?.trim();
  if (!token)
    throw new AeoError("Connect your Treg token to run a live audit.", 401);
  // A visitor-supplied token is already scoped to their own team. Never attach
  // the server operator's org slug to somebody else's credential.
  return {
    token,
    ...(!input.token && process.env.TREG_ORG
      ? { org: process.env.TREG_ORG }
      : {}),
  };
}

export async function estimateAudit(
  input: AuditInput,
  fetcher: Fetcher = fetch,
): Promise<CostEstimate> {
  const byEngine = await Promise.all(
    input.engines.map(async (engine) => {
      const endpoint = ENDPOINTS[engine];
      const response = await fetcher(
        `${TREG_BASE}/catalog/endpoints/${endpoint.priceId ?? endpoint.id}`,
        {
          signal: AbortSignal.timeout(15_000),
          headers: { accept: "application/json" },
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new AeoError(
          "Treg pricing is temporarily unavailable. No calls were made.",
          503,
        );
      const body = record(await response.json());
      const cost = record(record(body.endpoint).cost);
      const price = cost.usd;
      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        price > 0.1
      ) {
        throw new AeoError(
          "A verified price is unavailable for this engine. No calls were made.",
          503,
        );
      }
      return {
        engine,
        endpointId: endpoint.id,
        calls: input.prompts.length,
        costPerCallUsd: price,
        subtotalUsd: money(price * input.prompts.length),
      };
    }),
  );
  const totalCostUsd = money(
    byEngine.reduce((sum, item) => sum + item.subtotalUsd, 0),
  );
  if (totalCostUsd > MAX_RUN_COST_USD)
    throw new AeoError(
      "This audit exceeds the $1 safety limit. Reduce the number of prompts.",
    );
  return {
    currency: "USD",
    totalCostUsd,
    callCount: input.prompts.length * input.engines.length,
    byEngine,
    note: "Catalog reservation estimate; actual charges may vary with Perplexity response length and cached answers. Perplexity uses the Sonar model API; the other engines use their web interfaces. Locale: United States, English.",
    pricedAt: new Date().toISOString(),
  };
}

function safeCitation(
  value: unknown,
): { url: string; title: string; domain: string } | null {
  const source = record(value);
  const rawUrl =
    typeof value === "string"
      ? value
      : string(source.url) || string(source.link);
  try {
    const url = new URL(rawUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
    }
    const domain = url.hostname.replace(/^www\./, "");
    return {
      url: url.toString(),
      title: (string(source.title) || string(source.label) || domain).slice(
        0,
        400,
      ),
      domain,
    };
  } catch {
    return null;
  }
}

function visibleText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`]/g, "");
}

function mentionIndex(answer: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).exec(answer);
  return match ? match.index + match[1].length : -1;
}

function extractPayload(body: unknown): {
  payload: JsonRecord;
  answer: string;
  sources: unknown[];
  entities: string[];
} {
  const root = record(body);
  if (root.success === false)
    throw new AeoError(
      "The engine could not produce an answer. Try another engine or retry later.",
      502,
    );
  const output = record(root.output);
  const result = record(root.result);
  const payload = Object.keys(output).length
    ? output
    : Object.keys(result).length
      ? result
      : root;
  let answer =
    string(payload.markdown) ||
    string(payload.answer) ||
    string(payload.text) ||
    string(payload.answer_text);
  const sources: unknown[] = [];
  for (const key of ["citationPills", "citations", "sources"]) {
    if (Array.isArray(payload[key]))
      sources.push(
        ...(payload[key] as unknown[]).filter(
          (source) => !record(source).footnote,
        ),
      );
  }
  // Treg's routed contract is normalized, but retain a parser for its faithful
  // raw DataForSEO response to avoid silently losing a paid answer.
  const raw = record(root.raw);
  const dfs = Array.isArray(root.tasks) ? root : raw;
  if (!answer && Array.isArray(dfs.tasks)) {
    const task = record(dfs.tasks[0]);
    if (task.status_code !== 20000)
      throw new AeoError("Perplexity could not complete this prompt.", 502);
    const taskResult = Array.isArray(task.result) ? record(task.result[0]) : {};
    const sections = (
      Array.isArray(taskResult.items) ? taskResult.items : []
    ).flatMap((item) => {
      const parts = record(item).sections;
      return Array.isArray(parts) ? parts : [];
    });
    answer = sections
      .map((section) => string(record(section).text))
      .filter(Boolean)
      .join("\n\n");
    for (const section of sections) {
      const annotations = record(section).annotations;
      if (Array.isArray(annotations)) sources.push(...annotations);
    }
  }
  if (!answer.trim())
    throw new AeoError(
      "The engine returned no answer. This prompt is excluded from visibility scores.",
      502,
    );
  const entities = (
    Array.isArray(payload.entities) ? payload.entities : []
  ).flatMap((entity) => {
    const item = record(entity);
    return /^(software|brand|company|organization|product)$/i.test(
      string(item.type),
    ) && string(item.name)
      ? [string(item.name)]
      : [];
  });
  return { payload, answer: answer.slice(0, 100_000), sources, entities };
}

export function normalizeAnswer(
  body: unknown,
  input: AuditInput,
  prompt: string,
  engine: Engine,
  costUsd: number,
  callId?: string,
): AnswerResult {
  const { answer, sources, entities } = extractPayload(body);
  const citations = [
    ...new Map(
      sources
        .map(safeCitation)
        .filter((citation) => citation !== null)
        .map((citation) => [citation.url, citation]),
    ).values(),
  ];
  const prose = visibleText(answer);
  const dictionary = [
    ...new Map(
      [input.brand, ...input.competitors, ...entities].map((name) => [
        name.toLowerCase(),
        name,
      ]),
    ).values(),
  ];
  const mentions = dictionary
    .map((name) => ({ name, index: mentionIndex(prose, name) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  const ownIndex = mentions.findIndex(
    (item) => item.name.toLowerCase() === input.brand.toLowerCase(),
  );
  let position = ownIndex >= 0 ? ownIndex + 1 : null;
  // Preserve an engine's explicit recommendation rank where one is present.
  for (const line of prose.split("\n")) {
    const numbered = /^\s*(?:#{1,6}\s*)?(\d{1,2})[.)]\s+(.+)/.exec(line);
    if (
      numbered &&
      Number(numbered[1]) > 0 &&
      mentionIndex(numbered[2], input.brand) >= 0
    ) {
      position = Number(numbered[1]);
      break;
    }
  }
  const endpoint = ENDPOINTS[engine];
  return {
    id: callId || crypto.randomUUID(),
    prompt,
    engine,
    answer,
    citations,
    mentionedBrands: mentions.map((item) => item.name),
    brandMentioned: ownIndex >= 0,
    position,
    costUsd,
    completedAt: new Date().toISOString(),
    sourceKind: endpoint.sourceKind,
    provider: engine === "perplexity" ? "dataforseo" : "cloro",
  };
}

function providerBody(prompt: string, engine: Engine): JsonRecord {
  if (engine === "google")
    return { prompt, gl: "US", hl: "en", include: { markdown: true } };
  if (engine === "perplexity") return { prompt, country: "US" };
  return { prompt, country: "US", include: { markdown: true } };
}

function providerError(status: number, body: unknown): string {
  const detail = record(record(body).detail);
  if (detail.error === "route_max_cost")
    return "Treg pricing changed or the response would exceed the quoted ceiling. Nothing was charged; get a fresh estimate.";
  if (status === 401 || status === 403)
    return "Treg could not authorize this request. Check your token and team permissions.";
  if (status === 402)
    return "Treg could not fund this request. Check your team's billing in Treg.";
  if (status === 429)
    return "This engine is busy or its usage limit was reached. Retry later.";
  if (status >= 500)
    return "This engine is temporarily unavailable. Other successful answers are retained.";
  return "This engine could not process the prompt. Check your Treg token's team configuration or try another engine.";
}

export async function runAudit(
  input: AuditInput,
  fetcher: Fetcher = fetch,
  execution?: { estimate: CostEstimate; idempotencyPrefix: string },
): Promise<AuditResponse> {
  const credentials = resolveCredentials(input);
  // Refresh prices immediately before execution and refuse to run if unavailable.
  // Internal workers pass the exact catalog quote they reserved, so pricing
  // cannot change between reserving a budget and setting each provider cap.
  const estimate = execution?.estimate ?? await estimateAudit(input, fetcher);
  if (input.maxCostUsd !== undefined && estimate.totalCostUsd > input.maxCostUsd)
    throw new AeoError("The audit estimate increased beyond your approval. No paid calls were made. Review a fresh estimate before starting.", 409);
  const tasks = input.prompts.flatMap((prompt) =>
    input.engines.map((engine) => ({ prompt, engine })),
  );
  const results: AnswerResult[] = [];
  const errors: AuditError[] = [];
  let totalCostUsd = 0;
  let totalCostKnown = true;
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const { prompt, engine } = tasks[next++];
      let chargedUsd = 0;
      let costKnown = false;
      try {
        const price = estimate.byEngine.find((item) => item.engine === engine)!;
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
          "X-Treg-Token": credentials.token,
          "X-Treg-Route-Max-Cost": String(price.costPerCallUsd),
          "X-Treg-Meta": "feature=aeo-audit",
          "Idempotency-Key": execution
            ? `${execution.idempotencyPrefix}:${input.prompts.indexOf(prompt)}:${engine}`
            : crypto.randomUUID(),
        };
        if (credentials.org) headers["X-Treg-Org"] = credentials.org;
        if (engine === "perplexity") headers["X-Treg-Route-Exclude"] = "cloro";
        const response = await fetcher(
          `${TREG_BASE}/call/${ENDPOINTS[engine].id}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(providerBody(prompt, engine)),
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );
        const rawCost = response.headers.get("X-Treg-Cost-Micro");
        // On an async submission this header reserves a ceiling, rather than
        // settling a charge. Never release a worker's budget against that value.
        const pending = response.status === 202;
        costKnown = !pending && rawCost !== null && /^\d+$/.test(rawCost);
        chargedUsd = costKnown ? Number(rawCost) / 1_000_000 : 0;
        totalCostUsd = money(totalCostUsd + chargedUsd);
        const body = await response.json().catch(() => ({}));
        if (pending)
          throw new AeoError(
            "This engine is still processing the original request. Its charge is unsettled. Check Treg activity before retrying; no new request was submitted automatically.",
            202,
          );
        if (!response.ok)
          throw new AeoError(
            providerError(response.status, body),
            response.status,
          );
        results.push({
          ...normalizeAnswer(
            body,
            input,
            prompt,
            engine,
            chargedUsd,
            response.headers.get("X-Treg-Call-Id") || undefined,
          ),
          costKnown,
        });
      } catch (error) {
        // Never forward arbitrary exception messages or upstream error bodies;
        // either can carry credentials, balances, or private account metadata.
        const message =
          error instanceof AeoError
            ? error.message
            : error instanceof Error && /timeout|abort/i.test(error.name)
              ? "The engine timed out. Check Treg activity before retrying; the original request may still complete."
              : "The engine connection failed. Check Treg activity before retrying.";
        errors.push({
          prompt,
          engine,
          error: message,
          costKnown,
          ...(chargedUsd ? { costUsd: chargedUsd } : {}),
        });
      }
      if (!costKnown) totalCostKnown = false;
    }
  }
  await Promise.all(Array.from({ length: Math.min(12, tasks.length) }, worker));
  return {
    results,
    errors,
    totalCostUsd: money(totalCostUsd),
    totalCostKnown,
    completedAt: new Date().toISOString(),
  };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    // Next may rewrite request.url to its internal listener hostname. The Host
    // header is the actual host addressed by the browser, including its port.
    const actualHost = request.headers.get("host") || new URL(request.url).host;
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.host === actualHost &&
      parsed.origin === origin
    )
      return;
  } catch {
    /* Refuse malformed Origin headers below. */
  }
  throw new AeoError("Cross-origin requests are not allowed.", 403);
}

export async function readAuditRequest(request: Request): Promise<AuditInput> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AeoError("Send the request as JSON.", 415);
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES)
    throw new AeoError("Audit request is too large.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new AeoError("Audit request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(joined);
  try {
    return validateAuditInput(JSON.parse(text));
  } catch (error) {
    if (error instanceof AeoError) throw error;
    throw new AeoError("Send a valid JSON audit request.");
  }
}

export function aeoErrorResponse(error: unknown): Response {
  return Response.json(
    {
      error:
        error instanceof AeoError
          ? error.message
          : "The AEO service is temporarily unavailable. No new audit was started.",
    },
    {
      status: error instanceof AeoError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
