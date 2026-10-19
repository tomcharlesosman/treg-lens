import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  AeoError,
  MAX_REQUEST_BYTES,
  assertSameOrigin,
  resolveCredentials,
} from "./aeo";

type Json = Record<string, unknown>;
type Fetcher = typeof fetch;
export type SourceInput = {
  url: string;
  brand: string;
  token?: string;
  estimateOnly?: boolean;
};
type Step = "metrics" | "extract";
export type SourceQuote = {
  kind: "estimate";
  currency: "USD";
  totalCostUsd: number;
  steps: Array<{
    step: Step;
    endpointId: string;
    provider: string;
    estimatedCostUsd: number;
  }>;
  note: string;
  pricedAt: string;
};
export type SourceResearch = {
  kind: "research";
  url: string;
  domain: string;
  brand: string;
  title: string | null;
  excerpt: string | null;
  contentCharacters: number;
  brandMentioned: boolean | null;
  brandOccurrences: number | null;
  brandExcerpts: string[];
  author: string | null;
  publishedAt: string | null;
  contactRoutes: Array<{
    label: string;
    url: string;
    kind: "page" | "email" | "profile";
  }>;
  metrics: {
    domainAuthority: number | null;
    pageAuthority: number | null;
    spamScore: number | null;
    referringDomains: number | null;
    externalLinks: number | null;
    lastCrawled: string | null;
  };
  provenance: {
    metricsProvider: string | null;
    contentProvider: string | null;
    contentFreshness: string | null;
  };
  totalCostUsd: number | null;
  knownCostUsd: number;
  costKnown: boolean;
  callIds: string[];
  errors: Array<{ step: Step; error: string }>;
  completedAt: string;
};

const BASE = "https://treg.to";
const PLANS: Record<
  Step,
  { id: string; providerId: string; provider: string; routed: boolean }
> = {
  metrics: {
    id: "treg.web.url.metrics",
    providerId: "moz.web.url.metrics",
    provider: "moz",
    routed: true,
  },
  // The native Exa tool exposes author/title metadata and an explicit one-page
  // text-only request, making both the desired fields and $0.001 price precise.
  extract: {
    id: "exa.web.contents.get",
    providerId: "exa.web.contents.get",
    provider: "exa",
    routed: false,
  },
};
const obj = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const round = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

function isPublicAddress(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, "");
  const version = isIP(address);
  if (version === 6) {
    // Limit to global-unicast literals; exclude special/documentation space.
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:db8|0|2|10|20):/i.test(address) &&
      !/^2002:/i.test(address)
    );
  }
  if (version !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function validatePublicUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/.test(value.trim())
  ) {
    throw new AeoError(
      "Choose a public source URL with at most 2,048 characters.",
    );
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AeoError("Choose a valid public source URL.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const ip = isIP(host.replace(/^\[|\]$/g, ""));
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    host === "localhost" ||
    (!host.includes(".") && !ip) ||
    /\.(localhost|local|internal|lan|home|test|invalid|example)$/i.test(host) ||
    (ip && !isPublicAddress(host))
  ) {
    throw new AeoError(
      "Source research requires a public HTTP(S) website without credentials or private addresses.",
    );
  }
  if (/%(?:00|0a|0d|5c)/i.test(url.pathname + url.search))
    throw new AeoError("This source URL contains an invalid path.");
  url.hash = "";
  return url.toString();
}

export async function assertPublicDns(
  url: string,
  resolver = lookup,
): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  try {
    const addresses = await resolver(host, { all: true });
    if (
      !addresses.length ||
      addresses.some((entry) => !isPublicAddress(entry.address))
    )
      throw new AeoError(
        "This source hostname does not resolve exclusively to public addresses.",
      );
  } catch (error) {
    if (error instanceof AeoError) throw error;
    throw new AeoError(
      "The source website could not be resolved. Check its URL.",
    );
  }
}

export function validateSourceInput(value: unknown): SourceInput {
  const data = obj(value);
  const url = validatePublicUrl(data.url);
  const brand = str(data.brand).trim();
  if (!brand || brand.length > 100)
    throw new AeoError("Brand must contain 1–100 characters.");
  if (
    data.token !== undefined &&
    (typeof data.token !== "string" ||
      data.token.length > 4096 ||
      /[\r\n]/.test(data.token))
  )
    throw new AeoError("The Treg token is not valid.");
  if (data.estimateOnly !== undefined && typeof data.estimateOnly !== "boolean")
    throw new AeoError("estimateOnly must be a boolean.");
  return {
    url,
    brand,
    ...(str(data.token).trim() ? { token: str(data.token).trim() } : {}),
    estimateOnly: data.estimateOnly === true,
  };
}

/** Shared same-origin, bounded JSON reader for the small toolkit endpoints. */
export async function readToolRequest(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AeoError("Send the request as JSON.", 415);
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES)
    throw new AeoError("Request is too large.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new AeoError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AeoError("Send valid JSON.");
  }
}

type PricedPlan = { quote: SourceQuote; exclusions: Record<Step, string> };
async function priceSource(fetcher: Fetcher): Promise<PricedPlan> {
  const exclusions = {} as Record<Step, string>;
  const steps = await Promise.all(
    (Object.keys(PLANS) as Step[]).map(async (step) => {
      const plan = PLANS[step];
      const responses = await Promise.all(
        (plan.routed ? [plan.id, plan.providerId] : [plan.providerId]).map(
          (id) =>
            fetcher(`${BASE}/catalog/endpoints/${id}`, {
              headers: { accept: "application/json" },
              signal: AbortSignal.timeout(12_000),
              cache: "no-store",
            }),
        ),
      );
      if (responses.some((response) => !response.ok))
        throw new AeoError(
          "Source research pricing is unavailable. No paid calls were made.",
          503,
        );
      const documents = await Promise.all(
        responses.map(async (response) =>
          obj(obj(await response.json()).endpoint),
        ),
      );
      const provider = documents[plan.routed ? 1 : 0];
      const children =
        plan.routed && Array.isArray(documents[0].routed_children)
          ? documents[0].routed_children.filter(
              (child): child is string => typeof child === "string",
            )
          : [];
      if (plan.routed && !children.includes(plan.providerId))
        throw new AeoError(
          "The source research route changed. No paid calls were made.",
          503,
        );
      const cost = obj(provider.cost).usd;
      if (
        typeof cost !== "number" ||
        !Number.isFinite(cost) ||
        cost <= 0 ||
        cost > 0.05
      )
        throw new AeoError(
          "A verified source research price is unavailable.",
          503,
        );
      exclusions[step] = [
        ...new Set(
          children
            .filter((child) => child !== plan.providerId)
            .map((child) => child.split(".")[0]),
        ),
      ].join(",");
      return {
        step,
        endpointId: plan.id,
        provider: plan.provider,
        estimatedCostUsd: cost,
      };
    }),
  );
  return {
    exclusions,
    quote: {
      kind: "estimate",
      currency: "USD",
      totalCostUsd: round(
        steps.reduce((sum, item) => sum + item.estimatedCostUsd, 0),
      ),
      steps,
      note: "One Moz authority lookup and one Exa page extraction through Treg. Exa receives exactly one URL and text only, including its title and author fields. No extra providers or pages are requested. Actual charges come from Treg's billing headers. Content may be cached and incomplete.",
      pricedAt: new Date().toISOString(),
    },
  };
}

export async function estimateSource(
  fetcher: Fetcher = fetch,
): Promise<SourceQuote> {
  return (await priceSource(fetcher)).quote;
}

function number(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}

export function parseMetrics(body: unknown): SourceResearch["metrics"] {
  const root = obj(body);
  const normalized = obj(obj(root.output).metrics);
  const raw = obj(root.raw);
  const direct = Array.isArray(root.results)
    ? obj(root.results[0])
    : Array.isArray(raw.results)
      ? obj(raw.results[0])
      : {};
  const metrics = Object.keys(normalized).length ? normalized : direct;
  return {
    domainAuthority: number(metrics.domain_authority, 100),
    pageAuthority: number(metrics.page_authority, 100),
    spamScore: number(metrics.spam_score, 100),
    referringDomains: number(metrics.root_domains_to_page),
    externalLinks: number(metrics.external_pages_to_page),
    lastCrawled: str(metrics.last_crawled) || null,
  };
}

function observedLink(raw: string, base: string): string | null {
  try {
    return validatePublicUrl(new URL(raw, base).toString());
  } catch {
    return null;
  }
}

export function parsePage(
  body: unknown,
  input: SourceInput,
): Pick<
  SourceResearch,
  | "title"
  | "excerpt"
  | "contentCharacters"
  | "brandMentioned"
  | "brandOccurrences"
  | "brandExcerpts"
  | "author"
  | "publishedAt"
  | "contactRoutes"
> & { freshness: string | null } {
  const root = obj(body);
  const output = obj(root.output);
  const raw = obj(root.raw);
  const pages = Array.isArray(output.pages)
    ? output.pages
    : Array.isArray(root.results)
      ? root.results
      : Array.isArray(raw.results)
        ? raw.results
        : [];
  const page =
    typeof pages[0] === "string" ? { text: pages[0] } : obj(pages[0]);
  const text = (
    str(page.text) ||
    str(page.markdown) ||
    str(page.content)
  ).slice(0, 100_000);
  const title =
    (str(page.title) || str(obj(page.metadata).title)).slice(0, 500) || null;
  const author =
    (str(page.author) || str(obj(page.metadata).author)).slice(0, 200) || null;
  const publishedAt =
    (
      str(page.publishedDate) ||
      str(page.published_at) ||
      str(obj(page.metadata).publishedTime)
    ).slice(0, 100) || null;
  const prose = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "");
  const escapedBrand = input.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...prose.matchAll(
      new RegExp(
        `(^|[^\\p{L}\\p{N}])(${escapedBrand})(?=$|[^\\p{L}\\p{N}])`,
        "giu",
      ),
    ),
  ];
  const brandExcerpts = matches.slice(0, 3).map((match) => {
    const index = (match.index ?? 0) + match[1].length;
    return prose
      .slice(
        Math.max(0, index - 110),
        Math.min(prose.length, index + input.brand.length + 180),
      )
      .trim();
  });
  const routes = new Map<string, SourceResearch["contactRoutes"][number]>();
  const consider = (rawUrl: string, label: string) => {
    if (rawUrl.startsWith("mailto:")) {
      const email = rawUrl.slice(7).split("?")[0];
      if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
        routes.set(`mailto:${email}`, {
          url: `mailto:${email}`,
          label: email,
          kind: "email",
        });
      return;
    }
    const url = observedLink(rawUrl, input.url);
    if (
      url &&
      /contact|advertis|editor|author|writer|pitch|submit|contribut|media.?kit/i.test(
        label + " " + new URL(url).pathname,
      )
    ) {
      routes.set(url, {
        url,
        label: label.slice(0, 150) || new URL(url).pathname,
        kind: /author|writer/i.test(label + new URL(url).pathname)
          ? "profile"
          : "page",
      });
    }
  };
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g))
    consider(match[2], match[1]);
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>\])"']+/g))
    consider(match[0].replace(/[.,;]+$/, ""), "");
  for (const match of text.matchAll(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  ))
    consider(`mailto:${match[0]}`, "");
  if (Array.isArray(page.links))
    for (const link of page.links)
      consider(
        str(obj(link).url) || str(link),
        str(obj(link).text) || str(obj(link).title),
      );
  const authorUrl = str(page.authorUrl) || str(page.author_url);
  if (authorUrl) consider(authorUrl, "Author profile");
  const statusRows = Array.isArray(raw.statuses)
    ? raw.statuses
    : Array.isArray(root.statuses)
      ? root.statuses
      : [];
  return {
    title,
    excerpt: prose.trim().slice(0, 1800) || null,
    contentCharacters: text.length,
    brandMentioned: text ? matches.length > 0 : null,
    brandOccurrences: text ? matches.length : null,
    brandExcerpts,
    author,
    publishedAt,
    contactRoutes: [...routes.values()].slice(0, 10),
    freshness: str(obj(statusRows[0]).source) || null,
  };
}

function safeError(status: number): string {
  if (status === 401 || status === 403)
    return "Treg could not authorize this lookup. Check your token and permissions.";
  if (status === 402)
    return "This lookup could not be funded or exceeded the catalog price cap. Check Treg billing or refresh the estimate.";
  if (status === 429)
    return "The provider is busy or its usage limit was reached. Try later.";
  return "This source lookup could not be completed. Other returned evidence is retained.";
}

export async function researchSource(
  input: SourceInput,
  fetcher: Fetcher = fetch,
): Promise<SourceResearch> {
  const credential = resolveCredentials(input);
  const priced = await priceSource(fetcher);
  const results = await Promise.all(
    (Object.keys(PLANS) as Step[]).map(async (step) => {
      const plan = PLANS[step];
      let costUsd: number | null = null;
      let callId: string | null = null;
      try {
        const price = priced.quote.steps.find((item) => item.step === step)!;
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
          "X-Treg-Token": credential.token,
          "X-Treg-Route-Max-Cost": String(price.estimatedCostUsd),
          "X-Treg-Meta": "feature=aeo-source",
          "Idempotency-Key": crypto.randomUUID(),
        };
        if (plan.routed) {
          headers["X-Treg-Route-Prefer"] = plan.provider;
          headers["X-Treg-Route-Exclude"] = priced.exclusions[step];
          headers["X-Treg-Route-Waterfall"] = "0";
        }
        if (credential.org) headers["X-Treg-Org"] = credential.org;
        const response = await fetcher(`${BASE}/call/${plan.id}`, {
          method: "POST",
          headers,
          body: JSON.stringify(
            step === "metrics"
              ? { target: input.url }
              : { urls: [input.url], text: { maxCharacters: 20_000 } },
          ),
          signal: AbortSignal.timeout(60_000),
          cache: "no-store",
        });
        const charge = response.headers.get("X-Treg-Cost-Micro");
        costUsd =
          charge && /^\d+$/.test(charge) ? Number(charge) / 1_000_000 : null;
        callId = response.headers.get("X-Treg-Call-Id");
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (response.status === 202) {
          // Treg's pending header is a reservation, not a settled charge.
          // Retain the call ID for reconciliation without treating an accepted
          // task as completed evidence or inviting an automatic paid retry.
          costUsd = null;
          throw new AeoError(
            "This source lookup is still processing in Treg. Its reservation is not a settled charge. Check Treg activity before retrying.",
            202,
          );
        }
        const refusal = obj(obj(body).detail);
        if (
          costUsd === null &&
          response.headers.get("X-Treg-Error") === "1" &&
          ["route_max_cost", "insufficient_balance"].includes(
            str(refusal.error),
          )
        )
          costUsd = 0;
        if (!response.ok)
          throw new AeoError(safeError(response.status), response.status);
        return { step, body, costUsd, callId, error: null };
      } catch (error) {
        return {
          step,
          body: null,
          costUsd,
          callId,
          error:
            error instanceof AeoError
              ? error.message
              : "The provider connection timed out or failed. Check Treg activity before retrying.",
        };
      }
    }),
  );
  const metricsResult = results.find((result) => result.step === "metrics")!;
  const pageResult = results.find((result) => result.step === "extract")!;
  const page = parsePage(pageResult.body, input);
  const { freshness, ...pageFields } = page;
  const errors = results
    .filter((result) => result.error)
    .map((result) => ({ step: result.step, error: result.error! }));
  if (!pageResult.error && !page.excerpt)
    errors.push({
      step: "extract",
      error:
        "The provider returned no readable page content. Brand presence and contact routes are unknown.",
    });
  const metrics = parseMetrics(metricsResult.body);
  if (
    !metricsResult.error &&
    metrics.domainAuthority === null &&
    metrics.pageAuthority === null
  )
    errors.push({
      step: "metrics",
      error: "Moz did not return page or domain authority for this URL.",
    });
  const costKnown = results.every((result) => result.costUsd !== null);
  const knownCostUsd = round(
    results.reduce((sum, result) => sum + (result.costUsd ?? 0), 0),
  );
  return {
    kind: "research",
    url: input.url,
    domain: new URL(input.url).hostname.replace(/^www\./, ""),
    brand: input.brand,
    ...pageFields,
    metrics,
    provenance: {
      metricsProvider: metricsResult.body ? "Moz" : null,
      contentProvider: pageResult.body ? "Exa" : null,
      contentFreshness: freshness,
    },
    totalCostUsd: costKnown ? knownCostUsd : null,
    knownCostUsd,
    costKnown,
    callIds: results.flatMap((result) =>
      result.callId ? [result.callId] : [],
    ),
    errors,
    completedAt: new Date().toISOString(),
  };
}
