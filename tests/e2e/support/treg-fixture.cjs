/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preload must be CommonJS. */
/*
 * Test-server preload. The application retains its real, fixed Treg origin;
 * only the process executing E2E tests replaces that origin's network fetch.
 * Every Treg path is handled or refused here. This suite cannot spend credits.
 */
const { syncBuiltinESMExports } = require("node:module");
const dns = require("node:dns/promises");
const nativeFetch = globalThis.fetch;
const nativeLookup = dns.lookup;
const validations = new Map();

dns.lookup = async function lookup(hostname, options) {
  if (hostname === "example.com" || hostname.endsWith(".example.com")) {
    const address = hostname === "private-dns.example.com"
      ? "10.0.0.1"
      : "93.184.216.34";
    return options?.all ? [{ address, family: 4 }] : { address, family: 4 };
  }
  return nativeLookup.apply(this, arguments);
};
syncBuiltinESMExports();

const prices = {
  "cloro.ai-search.chatgpt.scrape": 0.002,
  "cloro.ai-search.gemini.scrape": 0.002,
  "cloro.google.serp.ai_mode": 0.002,
  "dataforseo.x.ai-optimization-perplexity-llm-responses-live": 0.002,
  "treg.google.keywords.ideas": 0.001,
  "anyapi.google.keywords.ideas": 0.001,
  "cloro.google.serp.organic": 0.002,
  "treg.web.url.metrics": 0.003,
  "moz.web.url.metrics": 0.003,
  "exa.web.contents.get": 0.001,
  "exa.web.answer": 0.005,
};
const callPaths = new Set([
  "cloro.ai-search.chatgpt.scrape",
  "cloro.ai-search.gemini.scrape",
  "cloro.google.serp.ai_mode",
  "treg.ai-search.perplexity.answer",
  "treg.google.keywords.ideas",
  "cloro.google.serp.organic",
  "treg.web.url.metrics",
  "exa.web.contents.get",
  "exa.web.answer",
]);
let callCount = 0;
function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
function billed(body, micro = 2000, status = 200, unknown = false) {
  return response(body, status, {
    "X-Treg-Call-Id": `fixture-call-${++callCount}`,
    ...(!unknown ? { "X-Treg-Cost-Micro": String(micro) } : {}),
  });
}
function errorBody(error = "provider_failure") {
  // Real handlers must never expose private upstream bodies to a browser.
  return { detail: { error, private_account: "PRIVATE-UPSTREAM-DETAIL" } };
}
function validKey(token) {
  return token.startsWith("treg-e2e-") && token !== "treg-e2e-invalid";
}
const citations = [
  { url: "https://example.com/research?utm_source=fixture", title: "AI toolkit research" },
  { url: "https://example.com/research", title: "Duplicated citation" },
  { url: "https://treg.to/docs", title: "Treg documentation" },
  { url: "javascript:alert(1)", title: "Unsafe source" },
  { url: "https://example.com/footnote", footnote: true },
];
const answer = "# AI visibility toolkit comparison\n\n1. **Treg** connects AI answers, search data, and source research through one API.\n2. **Composio** offers integrations for agent workflows.\n\nSee [AI toolkit research](https://example.com/research) and [Treg documentation](https://treg.to/docs).";

globalThis.fetch = async function fixtureFetch(input, init) {
  const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const url = new URL(rawUrl);
  if (url.origin !== "https://treg.to") return nativeFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const token = headers.get("X-Treg-Token") || "";
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const access = "/catalog/endpoints/cloro.ai-search.chatgpt.scrape/access";
  if (url.pathname === access && method === "GET") {
    if (!validKey(token)) return response(errorBody("invalid_key"), 401);
    if (token === "treg-e2e-unavailable") return response(errorBody(), 503);
    if (token === "treg-e2e-malformed") return new Response("not JSON", { status: 200 });
    if (token === "treg-e2e-unexpected") return response({ balance_usd: 0 });
    if (token === "treg-e2e-team") return response(errorBody("team_required"), 422);
    const count = (validations.get(token) || 0) + 1;
    validations.set(token, count);
    if (token === "treg-e2e-revoked-after-login" && count > 1)
      return response(errorBody("revoked_key"), 401);
    if (token.startsWith("treg-e2e-worker-revoked-") && count > 2)
      return response(errorBody("revoked_key"), 401);
    return response({ tier: "team", balance_usd: 0 });
  }
  const catalogId = url.pathname.match(/^\/catalog\/endpoints\/([^/]+)$/)?.[1];
  if (catalogId && method === "GET" && Object.hasOwn(prices, catalogId)) {
    const routed = catalogId === "treg.google.keywords.ideas"
      ? ["anyapi.google.keywords.ideas", "dataforseo.google.keywords.ideas"]
      : catalogId === "treg.web.url.metrics"
        ? ["moz.web.url.metrics", "dataforseo.web.url.metrics"]
        : undefined;
    return response({ endpoint: { id: catalogId, cost: { usd: prices[catalogId], ...(catalogId === "exa.web.answer" ? { type: "per_call", currency: "USD", unit: "call" } : {}) }, ...(routed ? { routed_children: routed } : {}) } });
  }
  const id = url.pathname.match(/^\/call\/([^/]+)$/)?.[1];
  if (!id || !callPaths.has(id) || method !== "POST")
    throw new Error(`E2E fixture refused an unknown Treg request: ${method} ${url.pathname}`);
  if (!validKey(token)) return response(errorBody("invalid_key"), 401);
  if (!headers.get("Idempotency-Key") || !headers.get("X-Treg-Route-Max-Cost") || headers.has("X-Treg-Org"))
    throw new Error("E2E fixture refused missing spend guards or an operator organization");
  const expectedPrice = prices[id] ?? 0.002;
  if (Number(headers.get("X-Treg-Route-Max-Cost")) !== expectedPrice)
    throw new Error("E2E fixture refused an incorrect catalog price ceiling");
  const body = JSON.parse(init?.body ?? "{}");
  const marker = String(body.prompt ?? body.keyword ?? body.query ?? body.target ?? body.urls?.[0] ?? "");
  const unknown = /\[unknown-cost\]|\/unknown-cost/.test(marker);
  const failure = /\[failure\]|\/failure/.test(marker);
  const billing = /\[billing\]|\/billing/.test(marker);
  const partial = /\[partial\]|\/partial/.test(marker);
  if (id === "exa.web.answer") {
    if (body.text !== false || body.stream !== false || body.outputSchema?.type !== "object" || !marker.startsWith("Research the business at this exact website: "))
      throw new Error("E2E fixture refused an incorrect structured onboarding research contract");
    if (billing) return billed(errorBody("insufficient_balance"), 0, 402);
    if (failure) return billed(errorBody(), 0, 503);
    if (marker.includes("/pending")) return billed({ status: "pending" }, 1000, 202);
    if (marker.includes("/malformed")) return billed({ answer: "This is not a structured business profile." }, 5000);
    const profile = {
      brand: "Acme Analytics",
      description: "Acme Analytics helps product teams understand customer behavior and improve retention.",
      competitors: [
        { name: "Northstar", domain: "northstar.example.com", reason: "Product analytics and retention reporting for SaaS teams." },
        { name: "SignalDesk", domain: "signaldesk.example.com", reason: "Customer behavior analytics for growing product teams." },
        { name: "MetricFlow", domain: "metricflow.example.com", reason: "Analytics dashboards and user journey insights." },
      ],
      questions: [
        "Which product analytics tools are best for a growing SaaS team?",
        "How does Acme Analytics compare with Northstar?",
        "What should a small product team look for in analytics software?",
        "Which tools help identify why customers stop using a product?",
        "How can I measure product retention without a data team?",
        "Which product analytics software is easiest to implement?",
      ],
    };
    if (marker.includes("/unsafe")) {
      profile.competitors.push({ name: "Northstar", domain: "javascript:alert(1)", reason: "Duplicate suggestion." });
      profile.questions.push(profile.questions[0]);
    }
    return billed({
      answer: profile,
      citations: [
        { url: "https://example.com/onboarding", title: "Acme Analytics" },
        { url: "https://example.com/analytics-comparison", title: "Product analytics comparison" },
        ...(marker.includes("/unsafe") ? [{ url: "javascript:alert(1)", title: "Unsafe source" }, { url: "https://example.com/onboarding", title: "Duplicate" }] : []),
      ],
    }, 5000, 200, unknown);
  }
  if (billing) return billed(errorBody("insufficient_balance"), 0, 402);
  if (failure || (partial && (id.includes("gemini") || id === "treg.web.url.metrics" || id === "treg.google.keywords.ideas")))
    return billed(errorBody(), 0, 503);
  if (/\[pending\]/.test(marker)) return billed({ status: "pending" }, 1000, 202);
  if (id === "treg.google.keywords.ideas") {
    if (headers.get("X-Treg-Route-Prefer") !== "anyapi" || headers.get("X-Treg-Route-Waterfall") !== "0" || headers.get("X-Treg-Route-Exclude") !== "dataforseo")
      throw new Error("E2E fixture refused unpinned keyword provider");
    if (body.country !== "us" || body.language !== "en" || body.limit !== 8)
      throw new Error("E2E fixture refused an incorrect keyword request contract");
    return billed({ output: { keywords: [
      { keyword: `${marker} comparison`, search_volume: 1200 },
      { keyword: `${marker} pricing`, search_volume: 800 },
      { keyword: `${marker} tools`, search_volume: 400 },
      { keyword: `${marker} tools`, search_volume: 400 },
    ] }, _treg: { served_by: "anyapi.google.keywords.ideas" } }, 1000, 200, unknown);
  }
  if (id === "cloro.google.serp.organic") {
    if (body.gl !== "US" || body.hl !== "en" || body.pages !== 1)
      throw new Error("E2E fixture refused an incorrect People Also Ask contract");
    return billed({ result: { peopleAlsoAsk: [
      { question: `What is the best ${marker}?` },
      { question: "How does Treg compare with Composio?" },
      { question: "How does Treg compare with Composio?" },
    ] } }, 2000, 200, unknown);
  }
  if (id === "treg.web.url.metrics") {
    if (headers.get("X-Treg-Route-Prefer") !== "moz" || headers.get("X-Treg-Route-Waterfall") !== "0" || headers.get("X-Treg-Route-Exclude") !== "dataforseo")
      throw new Error("E2E fixture refused unpinned authority provider");
    return billed({ output: { metrics: {
      domain_authority: 72, page_authority: 61, spam_score: 2,
      root_domains_to_page: 128, external_pages_to_page: 340,
      last_crawled: "2026-10-18T12:00:00Z",
    } } }, 3000, 200, unknown);
  }
  if (id === "exa.web.contents.get") {
    if (!Array.isArray(body.urls) || body.urls.length !== 1 || body.text?.maxCharacters !== 20000)
      throw new Error("E2E fixture refused an unbounded page extraction");
    const empty = marker.includes("/empty");
    return billed({ results: [{
      url: marker, title: "AI toolkit research", author: "Alex Researcher",
      authorUrl: "https://example.com/authors/alex", publishedDate: "2026-10-15",
      text: empty ? "" : "Treg provides one API for AI visibility research. Treg connects answer monitoring with source intelligence. Compare with Composio. [Contact editors](https://example.com/contact) or write editor@example.com. [Author profile](https://example.com/authors/alex).",
    }], statuses: [{ source: "cached" }] }, 1000, 200, unknown);
  }
  if (id === "treg.ai-search.perplexity.answer") {
    if (headers.get("X-Treg-Route-Exclude") !== "cloro")
      throw new Error("E2E fixture refused an unpinned Perplexity provider");
    if (body.country !== "US") throw new Error("E2E fixture refused an incorrect Perplexity locale");
    return billed({ tasks: [{ status_code: 20000, result: [{ items: [{ sections: [{ text: answer, annotations: citations.filter((item) => !item.footnote) }] }] }] }] }, 2000, 200, unknown);
  }
  if (id === "cloro.google.serp.ai_mode") {
    if (body.gl !== "US" || body.hl !== "en" || body.include?.markdown !== true)
      throw new Error("E2E fixture refused an incorrect Google AI Mode contract");
  } else if (body.country !== "US" || body.include?.markdown !== true) {
    throw new Error("E2E fixture refused an incorrect web-answer locale or format");
  }
  if (id.includes("gemini")) return billed({ result: { answer, sources: citations } }, 2000, 200, unknown);
  if (id === "cloro.google.serp.ai_mode") return billed({ answer_text: answer, citations }, 2000, 200, unknown);
  return billed({ output: { markdown: answer, citationPills: citations, entities: [{ name: "Treg", type: "brand" }, { name: "Composio", type: "company" }] } }, 2000, 200, unknown);
};
