import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const endpoint = "/api/aeo/onboard";
const website = "https://example.com/onboarding";
const token = "treg-e2e-onboarding-api";
const quoteCeiling = 0.005;

async function post(
  request: APIRequestContext,
  data: unknown,
  headers: Record<string, string> = {},
) {
  return request.post(endpoint, {
    data,
    headers: { "x-forwarded-for": `e2e-onboarding-${crypto.randomUUID()}`, ...headers },
  });
}

async function json(response: APIResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(JSON.stringify(body)).not.toMatch(/PRIVATE-UPSTREAM-DETAIL|operator-key-must-not-be-used|treg-e2e-/);
  return body;
}

async function error(response: APIResponse, status: number, message?: RegExp) {
  const body = await json(response, status);
  expect(typeof body.error).toBe("string");
  if (message) expect(body.error).toMatch(message);
  return body;
}

test.describe("URL onboarding research API", () => {
  test("free estimate uses one catalog-priced research call without a key", async ({ request }) => {
    const body = await json(await post(request, { url: website, estimateOnly: true }));
    expect(body).toMatchObject({ kind: "estimate", currency: "USD", totalCostUsd: quoteCeiling });
    // A receipt comes only from a paid call; quoting cannot produce one.
    expect(body).not.toHaveProperty("callIds");
    expect(body).not.toHaveProperty("brand");
    expect(body).not.toHaveProperty("questions");
  });

  test("paid research cannot inherit the operator credential", async ({ request }) => {
    await error(await post(request, { url: website, maxCostUsd: quoteCeiling }), 401, /Sign in/i);
  });

  test("an invalid explicit key never falls back to a valid session", async ({ request }) => {
    const login = await request.post("/api/auth/session", { data: { token } });
    expect(login.status()).toBe(200);
    await error(await post(request, { url: website, maxCostUsd: quoteCeiling, token: "treg-e2e-invalid" }), 401);
  });

  test("returns a reviewable profile, competitor reasons, buyer questions and source evidence", async ({ request }) => {
    const body = await json(await post(request, { url: website, token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({
      kind: "research",
      url: website,
      domain: "example.com",
      brand: "Acme Analytics",
      description: "Acme Analytics helps product teams understand customer behavior and improve retention.",
      totalCostUsd: quoteCeiling,
      knownCostUsd: quoteCeiling,
      costKnown: true,
      errors: [],
    });
    expect(body.competitors).toEqual([
      { name: "Northstar", domain: "northstar.example.com", reason: "Product analytics and retention reporting for SaaS teams." },
      { name: "SignalDesk", domain: "signaldesk.example.com", reason: "Customer behavior analytics for growing product teams." },
      { name: "MetricFlow", domain: "metricflow.example.com", reason: "Analytics dashboards and user journey insights." },
    ]);
    expect(body.questions).toHaveLength(6);
    expect(body.questions[0]).toBe("Which product analytics tools are best for a growing SaaS team?");
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0]).toMatchObject({ url: website, title: "Acme Analytics" });
    expect(body.callIds).toEqual([expect.stringMatching(/^fixture-call-/)]);
    expect(Number.isNaN(Date.parse(body.completedAt))).toBe(false);
  });

  test("research does not silently save a workspace or start the first audit", async ({ request }) => {
    const key = `treg-e2e-onboarding-unsaved-${crypto.randomUUID()}`;
    expect((await request.post("/api/auth/session", { data: { token: key } })).ok()).toBe(true);
    const before = await (await request.get("/api/workspace")).json();
    await json(await post(request, { url: website, maxCostUsd: quoteCeiling }));
    const after = await (await request.get("/api/workspace")).json();
    expect(after).toEqual(before);
    expect(after.snapshot).toBeNull();
  });

  test("normalizes a bare public domain and strips tracking fragments", async ({ request }) => {
    const body = await json(await post(request, { url: "example.com/onboarding#section", token, maxCostUsd: quoteCeiling }));
    expect(body.url).toBe(website);
    expect(body.domain).toBe("example.com");
    expect(body.input).toEqual({ url: website, market: { country: "US", language: "en" } });
  });

  test("buyer context and the supported market produce editable metadata without claiming observed demand", async ({ request }) => {
    const input = {
      url: "https://example.com/rich-context",
      audience: "Independent SaaS founders choosing their first analytics tool.",
      market: { country: "US", language: "en" },
    };
    await json(await post(request, { ...input, estimateOnly: true }));
    const body = await json(await post(request, { ...input, token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({ audience: input.audience, market: input.market });
    expect(body.input).toEqual(input);
    expect(body.buyerQuestions).toHaveLength(6);
    expect(body.buyerQuestions[0]).toMatchObject({
      text: body.questions[0], intent: "category", provenance: "generated",
      reason: "Identify alternatives before a purchase decision.",
    });
    expect(body.buyerQuestions[1]).toMatchObject({ intent: "comparison", provenance: "generated" });
    expect(body.buyerQuestions.map((question: { text: string }) => question.text)).toEqual(body.questions);
    expect(body.buyerQuestions.every((question: { provenance: string }) => question.provenance === "generated")).toBe(true);
    expect(body.competitors[0]).toMatchObject({
      name: "Northstar", sourceUrl: "https://northstar.example.com/product",
    });
  });

  for (const [name, extension] of [
    ["unsupported country", { market: { country: "GB", language: "en" } }],
    ["unsupported language", { market: { country: "US", language: "fr" } }],
    ["incomplete market", { market: { country: "US" } }],
    ["malformed market", { market: "US English" }],
    ["non-text buyer context", { audience: { role: "founder" } }],
    ["oversized buyer context", { audience: "x".repeat(601) }],
  ] as const) {
    test(`rejects ${name} for both an estimate and paid research`, async ({ request }) => {
      await error(await post(request, { url: website, ...extension, estimateOnly: true }), 400);
      await error(await post(request, { url: website, ...extension, token, maxCostUsd: quoteCeiling }), 400);
    });
  }

  test("a name-only suggestion remains available for correction without an invented website or verification", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/name-only", token, maxCostUsd: quoteCeiling }));
    expect(body.competitors[0]).toMatchObject({ name: "Northstar", reason: expect.stringMatching(/needs review/) });
    expect(body.competitors[0]).not.toHaveProperty("domain");
    expect(body.competitors[0]).not.toHaveProperty("sourceUrl");
    expect(body.competitors).toHaveLength(3);
  });

  test("competitor evidence must be a safe returned citation on that competitor's website", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/unsafe-evidence", token, maxCostUsd: quoteCeiling }));
    expect(body.competitors[0].sourceUrl).toBe("https://northstar.example.com/product");
    expect(body.competitors[1]).not.toHaveProperty("sourceUrl");
    expect(body.competitors[2]).not.toHaveProperty("sourceUrl");
    expect(body.sources).toHaveLength(3);
    expect(JSON.stringify(body)).not.toMatch(/javascript:|127\.0\.0\.1|user:password/);
  });

  test("partial research retains its paid receipt and known profile without inventing missing suggestions", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/partial", token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({
      brand: "Acme Analytics", competitors: [], questions: [], buyerQuestions: [],
      knownCostUsd: quoteCeiling, totalCostUsd: quoteCeiling, costKnown: true,
    });
    expect(body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ error: expect.stringMatching(/suggestions are missing/i) })]));
    expect(body.callIds).toHaveLength(1);
  });

  test("suggestions without citations carry an explicit unverified warning", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/unverified", token, maxCostUsd: quoteCeiling }));
    expect(body.sources).toEqual([]);
    expect(body.competitors).toHaveLength(3);
    expect(body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ error: expect.stringMatching(/unverified/i) })]));
    expect(body.competitors.every((competitor: { sourceUrl?: string }) => !competitor.sourceUrl)).toBe(true);
  });

  test("missing and insufficient accepted price ceilings fail before submission", async ({ request }) => {
    await error(await post(request, { url: website, token }), 400, /cost|estimate|price|ceiling/i);
    await error(await post(request, { url: website, token, maxCostUsd: quoteCeiling / 2 }), 409, /cost|price|estimate/i);
  });

  for (const [name, override] of [
    ["empty URL", { url: "" }],
    ["non-string URL", { url: 42 }],
    ["local URL", { url: "http://localhost" }],
    ["private IP", { url: "http://127.0.0.1/" }],
    ["private IPv6", { url: "http://[::1]/" }],
    ["credentials", { url: "https://user:pass@example.com" }],
    ["unsafe protocol", { url: "javascript:alert(1)" }],
    ["non-HTTP scheme", { url: "file:///etc/passwd" }],
    ["nonstandard port", { url: "https://example.com:444/" }],
    ["oversized URL", { url: `https://example.com/${"x".repeat(2050)}` }],
    ["invalid estimate flag", { estimateOnly: "true" }],
    ["invalid ceiling", { maxCostUsd: "0.005" }],
    ["negative ceiling", { maxCostUsd: -1 }],
    ["malformed key", { token: "key\nwith-newline" }],
  ] as const) {
    test(`rejects ${name} before research`, async ({ request }) => {
      const input: Record<string, unknown> = { url: website, estimateOnly: true };
      Object.assign(input, override);
      await error(await post(request, input), 400);
    });
  }

  test("a hostname resolving to private addresses is rejected before provider submission", async ({ request }) => {
    await error(await post(request, { url: "https://private-dns.example.com/", token, maxCostUsd: quoteCeiling }), 400, /public addresses/i);
  });

  test("rejects cross-origin, non-JSON, malformed and oversized requests", async ({ request }) => {
    const input = { url: website, estimateOnly: true };
    await error(await post(request, input, { origin: "https://attacker.example" }), 403, /Cross-origin/);
    await error(await request.post(endpoint, { data: "{}", headers: { "content-type": "text/plain" } }), 415, /JSON/);
    await error(await request.post(endpoint, { data: Buffer.from("{broken"), headers: { "content-type": "application/json" } }), 400, /JSON/);
    await error(await request.post(endpoint, { data: Buffer.from(JSON.stringify({ padding: "x".repeat(17000) })), headers: { "content-type": "application/json" } }), 413, /large/);
    expect((await request.fetch(endpoint, { method: "OPTIONS" })).status()).toBe(204);
    expect((await request.fetch(endpoint, { method: "PUT", data: {} })).status()).toBe(405);
  });

  for (const [path, message] of [["failure", /could not be completed/i], ["billing", /fund|balance/i]] as const) {
    test(`a submitted ${path} retains a safe receipt without invented suggestions`, async ({ request }) => {
      const body = await json(await post(request, { url: `https://example.com/${path}`, token, maxCostUsd: quoteCeiling }));
      expect(body).toMatchObject({ kind: "research", competitors: [], questions: [], costKnown: true, knownCostUsd: 0, totalCostUsd: 0 });
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].error).toMatch(message);
      expect(body.callIds).toEqual([expect.stringMatching(/^fixture-call-/)]);
    });
  }

  test("pending research remains inspectable with unknown settled billing and no invented profile", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/pending", token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({ kind: "research", competitors: [], questions: [], costKnown: false, totalCostUsd: null });
    expect(body.errors[0].error).toMatch(/pending|processing/i);
    expect(body.callIds).toHaveLength(1);
  });

  test("missing billing headers retain valid suggestions but explicitly mark spend unknown", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/unknown-cost", token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({ brand: "Acme Analytics", costKnown: false, totalCostUsd: null });
    expect(body.questions).toHaveLength(6);
    expect(body.callIds).toHaveLength(1);
  });

  test("a paid malformed answer preserves its receipt and charge rather than fabricating a profile", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/malformed", token, maxCostUsd: quoteCeiling }));
    expect(body).toMatchObject({ kind: "research", competitors: [], questions: [], totalCostUsd: quoteCeiling, costKnown: true });
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.callIds).toHaveLength(1);
  });

  test("deduplicates suggestions and removes unsafe source links", async ({ request }) => {
    const body = await json(await post(request, { url: "https://example.com/unsafe", token, maxCostUsd: quoteCeiling }));
    expect(body.competitors).toHaveLength(3);
    expect(body.questions).toHaveLength(6);
    expect(body.sources).toHaveLength(2);
    expect(JSON.stringify(body.sources)).not.toContain("javascript:");
  });

  test("rapid duplicate research is rejected instead of submitting another paid request", async ({ request }) => {
    const headers = { "x-forwarded-for": `e2e-onboarding-duplicate-${crypto.randomUUID()}` };
    const input = { url: website, token, maxCostUsd: quoteCeiling };
    await json(await post(request, input, headers));
    await error(await post(request, input, headers), 429, /just started|wait/i);
  });
});
