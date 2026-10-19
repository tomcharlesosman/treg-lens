import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { request as httpsRequest } from "node:https";

const PRIMARY = "treg-e2e-api-primary";
const SECONDARY = "treg-e2e-api-secondary";
const audit = {
  brand: "Treg",
  domain: "treg.to",
  competitors: ["Composio"],
  prompts: ["Which AI visibility toolkit should I choose?"],
  engines: ["chatgpt", "perplexity", "gemini", "google"],
};
const discovery = { brand: "Treg", seeds: ["AI visibility", "API toolkit"] };
const source = { brand: "Treg", url: "https://example.com/research" };

function uniqueIp() {
  return `e2e-api-${crypto.randomUUID()}`;
}
async function post(
  request: APIRequestContext,
  path: string,
  data: unknown,
  headers: Record<string, string> = {},
) {
  return request.post(path, { data, headers: { "x-forwarded-for": uniqueIp(), ...headers } });
}
async function json(response: APIResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response.json();
}
async function login(request: APIRequestContext, token = PRIMARY) {
  const response = await post(request, "/api/auth/session", { token });
  const body = await json(response);
  expect(body).toMatchObject({ authenticated: true, workspaceId: expect.stringMatching(/^treg_[a-f\d]{24}$/) });
  // Explicitly carry this Secure production cookie in HTTP-only API tests.
  // Browser specs independently test the browser's cookie policy and logout.
  const cookie = response.headers()["set-cookie"].split(";")[0];
  return { response, body, cookie };
}
async function error(response: APIResponse, status: number, message?: RegExp) {
  const body = await json(response, status);
  expect(typeof body.error).toBe("string");
  if (message) expect(body.error).toMatch(message);
  expect(JSON.stringify(body)).not.toMatch(/PRIVATE-UPSTREAM-DETAIL|operator-sentinel/);
  return body;
}

test.describe("HTTP sessions and authorization", () => {
  test("anonymous status and paid endpoints cannot inherit the operator credential", async ({ request }) => {
    expect(await json(await request.get("/api/auth/session"))).toEqual({ authenticated: false, workspaceId: null });
    expect(await json(await request.get("/api/aeo/status"))).toEqual({ configured: false });
    for (const [path, input] of [
      ["/api/aeo/run", audit],
      ["/api/aeo/discover", discovery],
      ["/api/aeo/source", source],
    ] as const) await error(await post(request, path, input), 401, /Sign in/);
  });

  test("a valid zero-balance key creates a private encrypted session and signs out", async ({ request }) => {
    const { response, body, cookie } = await login(request);
    const setCookie = response.headers()["set-cookie"];
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=43200/i);
    expect(setCookie).not.toContain(PRIMARY);
    expect(JSON.stringify(body)).not.toContain(PRIMARY);
    expect(await json(await request.get("/api/auth/session", { headers: { cookie } }))).toEqual(body);
    expect(await json(await request.get("/api/aeo/status", { headers: { cookie } }))).toEqual({ configured: true });
    expect((await json(await post(request, "/api/aeo/run", { ...audit, engines: ["chatgpt"] }, { cookie }))).results).toHaveLength(1);
    const logout = await request.delete("/api/auth/session", { headers: { cookie } });
    expect(await json(logout)).toEqual({ authenticated: false, workspaceId: null });
    expect(logout.headers()["set-cookie"]).toMatch(/Max-Age=0/i);
  });

  test("workspace namespaces are stable per key and isolated between keys", async ({ request }) => {
    const first = await login(request, PRIMARY);
    const same = await login(request, PRIMARY);
    const other = await login(request, SECONDARY);
    expect(first.body.workspaceId).toBe(same.body.workspaceId);
    expect(first.body.workspaceId).not.toBe(other.body.workspaceId);
  });

  for (const [token, status, message] of [
    ["treg-e2e-invalid", 401, /invalid|revoked/i],
    ["treg-e2e-unavailable", 503, /temporarily unavailable/i],
    ["treg-e2e-malformed", 503, /unreadable/i],
    ["treg-e2e-unexpected", 503, /unexpected/i],
    ["treg-e2e-team", 400, /team-scoped/i],
    ["", 400, /valid Treg team API key/i],
    ["key with spaces", 400, /spaces or line breaks/i],
    ["treg-e2e-\nline", 400, /spaces or line breaks/i],
    ["x".repeat(2049), 400, /valid Treg team API key/i],
    [42, 400, /valid Treg team API key/i],
  ] as const) {
    test(`rejects ${typeof token === "string" ? (token.length > 40 ? "oversized key" : JSON.stringify(token)) : "non-string key"}`, async ({ request }) => {
      await error(await post(request, "/api/auth/session", { token }), status, message);
    });
  }

  test("revoked credentials invalidate an already issued session before paid work", async ({ request }) => {
    const { cookie } = await login(request, "treg-e2e-revoked-after-login");
    expect(await json(await request.get("/api/auth/session", { headers: { cookie } }))).toEqual({ authenticated: false, workspaceId: null });
    await error(await post(request, "/api/aeo/run", audit, { cookie }), 401, /Sign in/);
  });

  test("tampered session cookies fail closed", async ({ request }) => {
    const { cookie } = await login(request);
    const tampered = `${cookie.slice(0, -12)}tamperedvalue`;
    expect(await json(await request.get("/api/auth/session", { headers: { cookie: tampered } }))).toEqual({ authenticated: false, workspaceId: null });
    await error(await post(request, "/api/aeo/run", audit, { cookie: tampered }), 401);
  });

  test("an invalid explicit key never falls back to a valid session", async ({ request }) => {
    const { cookie } = await login(request);
    for (const [path, input] of [["/api/aeo/run", audit], ["/api/aeo/discover", discovery], ["/api/aeo/source", source]] as const)
      await error(await post(request, path, { ...input, token: "treg-e2e-invalid" }, { cookie }), 401);
  });

  test("twenty failed sign-ins are allowed and the next attempt is throttled", async ({ request }) => {
    const ip = uniqueIp();
    for (let count = 0; count < 20; count++)
      await error(await post(request, "/api/auth/session", { token: "treg-e2e-invalid" }, { "x-forwarded-for": ip }), 401);
    await error(await post(request, "/api/auth/session", { token: PRIMARY }, { "x-forwarded-for": ip }), 429, /Too many/);
  });
});

test.describe("HTTP boundaries", () => {
  for (const [path, data] of [
    ["/api/auth/session", { token: PRIMARY }],
    ["/api/aeo/run", audit],
    ["/api/aeo/estimate", audit],
    ["/api/aeo/discover", { ...discovery, estimateOnly: true }],
    ["/api/aeo/source", { ...source, estimateOnly: true }],
  ] as const) {
    test(`${path} rejects cross-origin, non-JSON, malformed and oversized requests`, async ({ request }) => {
      await error(await post(request, path, data, { origin: "https://attacker.example" }), 403, /Cross-origin/);
      await error(await request.post(path, { data: "{}", headers: { "content-type": "text/plain" } }), 415, /JSON/);
      // Buffers preserve malformed bytes; Playwright JSON-encodes string data
      // when the content type is application/json.
      await error(await request.post(path, { data: Buffer.from("{broken"), headers: { "content-type": "application/json" } }), 400, /JSON/);
      await error(await request.post(path, { data: Buffer.from(JSON.stringify({ padding: "x".repeat(17000) })), headers: { "content-type": "application/json" } }), 413, /large/);
      const options = await request.fetch(path, { method: "OPTIONS" });
      expect(options.status()).toBe(204);
      expect(options.headers().allow).toContain("POST");
      expect((await request.fetch(path, { method: "PUT", data: {} })).status()).toBe(405);
    });
  }
  test("logout refuses cross-origin requests", async ({ request }) => {
    await error(await request.delete("/api/auth/session", { headers: { origin: "https://attacker.example" } }), 403, /Cross-origin/);
  });
  test("same-origin browser headers are accepted", async ({ request, baseURL }) => {
    await json(await post(request, "/api/aeo/estimate", audit, { origin: new URL(baseURL!).origin }));
  });
  test("chunked transfer cannot bypass the request byte limit", async ({ baseURL }) => {
    const result = await new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
      const connection = httpsRequest(new URL("/api/aeo/estimate", baseURL), {
        rejectUnauthorized: false,
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": uniqueIp() },
      }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, text }));
        response.on("error", reject);
      });
      connection.on("error", reject);
      connection.write('{"padding":"');
      connection.write("x".repeat(9000));
      connection.write("x".repeat(9000));
      connection.end('"}');
    });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.text).error).toMatch(/large/);
  });
});

test.describe("audit execution and accounting", () => {
  test("free estimate covers every engine with catalog prices and deduplicates selections", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/estimate", { ...audit, prompts: ["same", "same"], engines: ["chatgpt", "chatgpt", "perplexity"] }));
    expect(body).toMatchObject({ currency: "USD", callCount: 2, totalCostUsd: 0.004 });
    expect(body.byEngine).toHaveLength(2);
    expect(body.byEngine.every((row: { costPerCallUsd: number }) => row.costPerCallUsd === 0.002)).toBe(true);
    expect(body.note).toMatch(/Sonar/);
  });

  test("all four provider formats produce scored, sanitized citations and exact charges", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/run", { ...audit, token: PRIMARY }));
    expect(body.errors).toEqual([]);
    expect(body.results).toHaveLength(4);
    expect(body.totalCostUsd).toBe(0.008);
    expect(body.totalCostKnown).toBe(true);
    expect(new Set(body.results.map((row: { engine: string }) => row.engine))).toEqual(new Set(audit.engines));
    for (const row of body.results) {
      expect(row).toMatchObject({ brandMentioned: true, position: 1, costUsd: 0.002, costKnown: true, id: expect.stringMatching(/^fixture-call-/) });
      expect(row.mentionedBrands).toEqual(["Treg", "Composio"]);
      expect(row.citations.map((citation: { url: string }) => citation.url)).toEqual(["https://example.com/research", "https://treg.to/docs"]);
      expect(row.answer).toContain("AI visibility toolkit comparison");
      expect(row.provider).toBe(row.engine === "perplexity" ? "dataforseo" : "cloro");
      expect(row.sourceKind).toBe(row.engine === "perplexity" ? "model-api" : "web-interface");
    }
    expect(JSON.stringify(body)).not.toContain(PRIMARY);
  });

  test("partial upstream failure preserves successful answers and redacts provider details", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/run", { ...audit, prompts: ["Compare tools [partial]"], token: PRIMARY }));
    expect(body.results).toHaveLength(3);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({ engine: "gemini", costKnown: true, error: expect.stringMatching(/temporarily unavailable/) });
    expect(body.totalCostUsd).toBe(0.006);
    expect(body.totalCostKnown).toBe(true);
    expect(JSON.stringify(body)).not.toContain("PRIVATE-UPSTREAM-DETAIL");
  });

  for (const [marker, message] of [["failure", /temporarily unavailable/], ["billing", /fund/]] as const) {
    test(`all-engine ${marker} is returned as retained structured errors`, async ({ request }) => {
      const body = await json(await post(request, "/api/aeo/run", { ...audit, prompts: [`Compare tools [${marker}]`], token: PRIMARY }));
      expect(body.results).toEqual([]);
      expect(body.errors).toHaveLength(4);
      expect(body.errors.every((row: { error: string }) => message.test(row.error))).toBe(true);
      expect(body.totalCostUsd).toBe(0);
      expect(body.totalCostKnown).toBe(true);
      expect(JSON.stringify(body)).not.toContain("PRIVATE-UPSTREAM-DETAIL");
    });
  }
  test("missing billing headers retain answers but explicitly mark total cost unknown", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/run", { ...audit, prompts: ["Compare [unknown-cost]"], token: PRIMARY }));
    expect(body.results).toHaveLength(4);
    expect(body.results.every((row: { costKnown: boolean }) => row.costKnown === false)).toBe(true);
    expect(body.totalCostKnown).toBe(false);
  });

  for (const [name, override, message] of [
    ["empty brand", { brand: "" }, /Brand/],
    ["long brand", { brand: "x".repeat(101) }, /Brand/],
    ["invalid domain", { domain: "localhost" }, /website/],
    ["credentialed domain", { domain: "https://user:pass@example.com" }, /website/],
    ["missing prompts", { prompts: [] }, /prompts/],
    ["too many prompts", { prompts: Array(9).fill("test") }, /prompts/],
    ["oversized prompt", { prompts: ["x".repeat(501)] }, /prompt/],
    ["non-string prompt", { prompts: [42] }, /prompt/],
    ["missing engine", { engines: [] }, /engine/],
    ["unsupported engine", { engines: ["claude"] }, /engine/],
    ["too many competitors", { competitors: Array(9).fill("other") }, /competitor/],
    ["blank competitor", { competitors: [""] }, /Competitor/],
    ["malformed token", { token: "line\nbreak" }, /token/],
  ] as const) {
    test(`rejects ${name} before spending`, async ({ request }) => {
      await error(await post(request, "/api/aeo/estimate", { ...audit, ...override }), 400, message);
    });
  }
  test("rapid duplicate audit is throttled", async ({ request }) => {
    const headers = { "x-forwarded-for": uniqueIp() };
    await json(await post(request, "/api/aeo/run", { ...audit, engines: ["chatgpt"], token: PRIMARY }, headers));
    await error(await post(request, "/api/aeo/run", { ...audit, engines: ["chatgpt"], token: PRIMARY }, headers), 429, /just started/);
  });
});

test.describe("discovery execution", () => {
  test("free discovery estimate is conservative and requires no credential", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/discover", { ...discovery, estimateOnly: true }));
    expect(body).toMatchObject({ currency: "USD", maxCalls: 5, totalCostUsd: 0.008 });
    expect(body.breakdown.map((row: { label: string }) => row.label)).toEqual(["Keyword ideas", "People Also Ask"]);
  });
  test("keyword ideas and People Also Ask are deduplicated with provider volumes", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/discover", { ...discovery, token: PRIMARY }));
    expect(body).toMatchObject({ keywordCount: 6, questionCount: 4, totalCostUsd: 0.008, totalCostKnown: true, reservedCostUsd: 0, errors: [], locale: { country: "US", language: "en" } });
    expect(body.candidates).toHaveLength(10);
    expect(new Set(body.candidates.map((row: { text: string }) => row.text)).size).toBe(10);
    expect(body.candidates.find((row: { kind: string }) => row.kind === "keyword")).toMatchObject({ origin: "Keyword idea", provider: "anyapi", searchVolume: 1200 });
    expect(body.candidates[0]).toMatchObject({ kind: "question", origin: "People Also Ask", provider: "cloro", searchVolume: null });
  });
  test("failed keyword seed preserves the other seed and its questions", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/discover", { ...discovery, seeds: ["AI visibility [partial]", "API toolkit"], token: PRIMARY }));
    expect(body.keywordCount).toBe(3);
    expect(body.questionCount).toBe(4);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({ stage: "keywords", seed: "AI visibility [partial]" });
    expect(body.totalCostUsd).toBe(0.007);
    expect(JSON.stringify(body)).not.toContain("PRIVATE-UPSTREAM-DETAIL");
  });
  test("pending requests report reservations and retain zero settled spend", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/discover", { ...discovery, seeds: ["AI [pending]", "API [pending]"], token: PRIMARY }));
    expect(body).toMatchObject({ candidates: [], totalCostUsd: 0, reservedCostUsd: 0.002, totalCostKnown: false });
    expect(body.errors).toHaveLength(2);
    expect(body.errors[0].error).toMatch(/pending/);
  });
  test("discovery recognizes unknown billing totals", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/discover", { ...discovery, seeds: ["AI [unknown-cost]", "API toolkit"], token: PRIMARY }));
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.totalCostKnown).toBe(false);
  });
  for (const [name, override] of [
    ["one seed", { seeds: ["one"] }],
    ["four seeds", { seeds: ["one", "two", "three", "four"] }],
    ["duplicate seeds", { seeds: ["one", "ONE"] }],
    ["short seed", { seeds: ["a", "two"] }],
    ["multiline seed", { seeds: ["one\ntwo", "three"] }],
    ["oversized seed", { seeds: ["x".repeat(101), "two"] }],
    ["invalid estimate flag", { estimateOnly: "yes" }],
    ["invalid brand", { brand: 42 }],
  ] as const) {
    test(`rejects ${name}`, async ({ request }) => {
      await error(await post(request, "/api/aeo/discover", { ...discovery, ...override }), 400);
    });
  }
  test("rapid duplicate discovery is throttled", async ({ request }) => {
    const headers = { "x-forwarded-for": uniqueIp() };
    await json(await post(request, "/api/aeo/discover", { ...discovery, token: PRIMARY }, headers));
    await error(await post(request, "/api/aeo/discover", { ...discovery, token: PRIMARY }, headers), 429, /just started/);
  });
});

test.describe("citation source research", () => {
  test("free source quote pins one Moz and one text-only Exa call", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, estimateOnly: true }));
    expect(body).toMatchObject({ kind: "estimate", totalCostUsd: 0.004, currency: "USD" });
    expect(body.steps).toEqual([
      { step: "metrics", endpointId: "treg.web.url.metrics", provider: "moz", estimatedCostUsd: 0.003 },
      { step: "extract", endpointId: "exa.web.contents.get", provider: "exa", estimatedCostUsd: 0.001 },
    ]);
  });
  test("source research returns authority, content, brand evidence and observed contact routes", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, token: PRIMARY }));
    expect(body).toMatchObject({
      kind: "research", url: source.url, domain: "example.com", brand: "Treg",
      title: "AI toolkit research", author: "Alex Researcher", publishedAt: "2026-10-15",
      brandMentioned: true, brandOccurrences: 2, totalCostUsd: 0.004, knownCostUsd: 0.004, costKnown: true,
      provenance: { metricsProvider: "Moz", contentProvider: "Exa", contentFreshness: "cached" },
      metrics: { domainAuthority: 72, pageAuthority: 61, spamScore: 2, referringDomains: 128, externalLinks: 340, lastCrawled: "2026-10-18T12:00:00Z" },
      errors: [],
    });
    expect(body.contentCharacters).toBeGreaterThan(100);
    expect(body.brandExcerpts).toHaveLength(2);
    expect(body.callIds).toHaveLength(2);
    expect(body.contactRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "email", url: "mailto:editor@example.com" }),
      expect.objectContaining({ kind: "page", url: "https://example.com/contact" }),
      expect.objectContaining({ kind: "profile", url: "https://example.com/authors/alex" }),
    ]));
  });
  test("partial source failure retains content and exposes unknown authority", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, url: "https://example.com/partial", token: PRIMARY }));
    expect(body.title).toBe("AI toolkit research");
    expect(body.brandMentioned).toBe(true);
    expect(body.metrics.domainAuthority).toBeNull();
    expect(body.provenance).toMatchObject({ metricsProvider: null, contentProvider: "Exa" });
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].step).toBe("metrics");
    expect(body.totalCostUsd).toBe(0.001);
    expect(JSON.stringify(body)).not.toContain("PRIVATE-UPSTREAM-DETAIL");
  });
  test("unfunded source lookup reports both failures with known zero cost", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, url: "https://example.com/billing", token: PRIMARY }));
    expect(body.errors).toHaveLength(2);
    expect(body.errors.every((row: { error: string }) => /fund/.test(row.error))).toBe(true);
    expect(body.totalCostUsd).toBe(0);
    expect(body.costKnown).toBe(true);
    expect(body.brandMentioned).toBeNull();
    expect(body.contactRoutes).toEqual([]);
  });
  test("unknown billing remains distinct from free source research", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, url: "https://example.com/unknown-cost", token: PRIMARY }));
    expect(body.title).toBe("AI toolkit research");
    expect(body.totalCostUsd).toBeNull();
    expect(body.costKnown).toBe(false);
    expect(body.knownCostUsd).toBe(0);
  });
  test("empty source extraction reports brand presence as unknown", async ({ request }) => {
    const body = await json(await post(request, "/api/aeo/source", { ...source, url: "https://example.com/empty", token: PRIMARY }));
    expect(body.brandMentioned).toBeNull();
    expect(body.brandOccurrences).toBeNull();
    expect(body.excerpt).toBeNull();
    expect(body.errors).toEqual([expect.objectContaining({ step: "extract", error: expect.stringMatching(/no readable page content/) })]);
  });
  for (const url of [
    "http://localhost/research", "http://127.0.0.1/research", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://service.internal/", "https://example.com:8080/", "https://user:pass@example.com/", "file:///etc/passwd", "javascript:alert(1)", "https://example.com/%0d%0aheaders", "https://example.com/has space",
  ]) {
    test(`rejects unsafe source ${url}`, async ({ request }) => {
      await error(await post(request, "/api/aeo/source", { ...source, url, estimateOnly: true }), 400);
    });
  }
  test("a public-looking name resolving privately is refused before research", async ({ request }) => {
    await error(await post(request, "/api/aeo/source", { ...source, url: "https://private-dns.example.com/research", token: PRIMARY }), 400, /public addresses/);
  });
  test("source brand and estimate flag are validated", async ({ request }) => {
    await error(await post(request, "/api/aeo/source", { ...source, brand: "" }), 400, /Brand/);
    await error(await post(request, "/api/aeo/source", { ...source, estimateOnly: "true" }), 400, /boolean/);
  });
  test("rapid duplicate source request is throttled", async ({ request }) => {
    const headers = { "x-forwarded-for": uniqueIp() };
    await json(await post(request, "/api/aeo/source", { ...source, token: PRIMARY }, headers));
    await error(await post(request, "/api/aeo/source", { ...source, token: PRIMARY }, headers), 429, /just started/);
  });
});
