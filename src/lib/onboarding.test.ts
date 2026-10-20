import assert from "node:assert/strict";
import test from "node:test";
import { AeoError } from "./aeo";
import {
  estimateOnboarding,
  normalizeOnboardingResearch,
  normalizeOnboardingUrl,
  researchOnboarding,
  validateOnboardingInput,
  type OnboardingInput,
} from "./onboarding";

const input: OnboardingInput = {
  url: "https://example.com/product",
  token: "synthetic-private-onboarding-key",
  maxCostUsd: 0.005,
};
const catalog = (usd = 0.005) => ({
  endpoint: {
    id: "exa.web.answer",
    cost: { usd, type: "per_call", currency: "USD", unit: "call" },
  },
});
const response = () => ({
  answer: {
    brand: "Acme",
    description: "Analytics for small teams.",
    competitors: [
      {
        name: "Northstar",
        domain: "northstar.com",
        reason: "Analytics for the same buyer.",
      },
    ],
    questions: ["Which analytics tools suit a small team?"],
  },
  citations: [{ url: "https://example.com/product", title: "Acme Analytics" }],
});
const headers = {
  "X-Treg-Cost-Micro": "5000",
  "X-Treg-Call-Id": "test-onboarding-call",
};
function provider(fetchPaid: typeof fetch): typeof fetch {
  return (url, init) =>
    String(url).includes("/catalog/")
      ? Promise.resolve(Response.json(catalog()))
      : fetchPaid(url, init);
}

test("onboarding normalizes pasted domains, strips tracking, preserves website path", () => {
  assert.equal(
    normalizeOnboardingUrl("  www.example.com/product?email=private#top "),
    "https://www.example.com/product",
  );
  assert.equal(normalizeOnboardingUrl("http://example.com"), "http://example.com/");
  assert.deepEqual(validateOnboardingInput({ url: "example.com", estimateOnly: true }), {
    url: "https://example.com/",
    estimateOnly: true,
  });
  assert.equal(validateOnboardingInput({ ...input, token: " key " }).token, "key");
});

test("onboarding rejects unsafe URLs, invalid tokens and unapproved paid requests", () => {
  for (const url of [
    "",
    123,
    "localhost",
    "https://intranet.local",
    "https://192.168.1.1",
    "http://2130706433",
    "http://[::1]",
    "https://user:secret@example.com",
    "ftp://example.com",
    "https://example.com:9000",
    "https://example.com/a%0dheader",
    "https://example.com/has space",
    `https://example.com/${"x".repeat(2048)}`,
  ])
    assert.throws(() => validateOnboardingInput({ ...input, url }), AeoError);
  for (const extra of [
    { token: "bad\r\nheader" },
    { token: 123 },
    { token: "x".repeat(4097) },
    { estimateOnly: "true" },
    { maxCostUsd: undefined },
    { maxCostUsd: null },
    { maxCostUsd: "0.005" },
    { maxCostUsd: 0 },
    { maxCostUsd: -1 },
    { maxCostUsd: 0.051 },
    { maxCostUsd: Infinity },
  ])
    assert.throws(() => validateOnboardingInput({ ...input, ...extra }), AeoError);
});

test("free onboarding estimate reads only the fixed allowlisted catalog without credentials", async () => {
  const calls: string[] = [];
  const quote = await estimateOnboarding(async (url, init) => {
    calls.push(String(url));
    assert.equal(new Headers(init?.headers).get("X-Treg-Token"), null);
    return Response.json(catalog());
  });
  assert.deepEqual(calls, ["https://treg.to/catalog/endpoints/exa.web.answer"]);
  assert.equal(quote.kind, "estimate");
  assert.equal(quote.totalCostUsd, 0.005);
  assert.match(quote.note, /generated ideas/);
});

test("onboarding refuses missing, variable, excessive, or mismatched catalog pricing", async () => {
  for (const cost of [
    {},
    { ...catalog().endpoint.cost, usd: undefined },
    { ...catalog().endpoint.cost, usd: 0 },
    { ...catalog().endpoint.cost, usd: 0.051 },
    { ...catalog().endpoint.cost, usd: "0.005" },
    { ...catalog().endpoint.cost, type: "per_token" },
    { ...catalog().endpoint.cost, currency: "credit" },
    { ...catalog().endpoint.cost, unit: "token" },
    { ...catalog().endpoint.cost, settle: "usage" },
    { ...catalog().endpoint.cost, table: [] },
  ])
    await assert.rejects(
      estimateOnboarding(async () => Response.json({ endpoint: { id: "exa.web.answer", cost } })),
      AeoError,
    );
  await assert.rejects(
    estimateOnboarding(async () => Response.json({ endpoint: { ...catalog().endpoint, id: "other" } })),
    AeoError,
  );
  await assert.rejects(
    estimateOnboarding(async () => new Response("Unavailable", { status: 503 })),
    AeoError,
  );
  await assert.rejects(
    estimateOnboarding(async () => { throw new Error("private upstream message"); }),
    (error: unknown) => error instanceof AeoError && !error.message.includes("private"),
  );
});

test("onboarding preserves accepted ceiling and requires caller credentials before paid work", async () => {
  let paid = 0;
  const fetcher = provider(async () => {
    paid++;
    return Response.json(response(), { headers });
  });
  await assert.rejects(
    researchOnboarding({ ...input, maxCostUsd: 0.004 }, fetcher),
    (error: unknown) => error instanceof AeoError && error.status === 409,
  );
  await assert.rejects(researchOnboarding({ ...input, token: undefined }, fetcher), AeoError);
  await assert.rejects(researchOnboarding({ ...input, maxCostUsd: undefined }, fetcher), AeoError);
  assert.equal(paid, 0);
});

test("onboarding submits one bounded structured request and reports only settled Treg costs", async () => {
  let calls = 0;
  const result = await researchOnboarding(input, provider(async (url, init) => {
    calls++;
    assert.equal(String(url), "https://treg.to/call/exa.web.answer");
    assert.equal(init?.method, "POST");
    const outboundHeaders = new Headers(init?.headers);
    assert.equal(outboundHeaders.get("X-Treg-Token"), input.token);
    assert.equal(outboundHeaders.get("X-Treg-Org"), null);
    assert.equal(outboundHeaders.get("X-Treg-Route-Max-Cost"), "0.005");
    assert.equal(outboundHeaders.get("X-Treg-Route-Waterfall"), "0");
    assert.ok(outboundHeaders.get("Idempotency-Key"));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.text, false);
    assert.equal(body.stream, false);
    assert.equal(body.outputSchema.type, "object");
    assert.equal(body.outputSchema.properties.competitors.maxItems, 5);
    assert.equal(body.outputSchema.properties.questions.maxItems, 8);
    assert.ok(body.query.includes(JSON.stringify(input.url)));
    assert.match(body.query, /untrusted evidence/);
    assert.match(body.query, /not actual search-volume/);
    assert.ok(!JSON.stringify(body).includes(input.token!));
    return Response.json({ ...response(), costDollars: { total: 999 } }, { headers });
  }));
  assert.equal(calls, 1);
  assert.equal(result.brand, "Acme");
  assert.equal(result.totalCostUsd, 0.005);
  assert.equal(result.knownCostUsd, 0.005);
  assert.equal(result.costKnown, true);
  assert.deepEqual(result.callIds, ["test-onboarding-call"]);
  assert.deepEqual(result.errors, []);
});

test("onboarding sanitizes suggestions, removes own brand, bounds and deduplicates fields and source links", () => {
  const result = normalizeOnboardingResearch({
    answer: {
      brand: "<b>Acme</b>",
      description: "A\t business\n description",
      competitors: [
        { name: "Acme", domain: "other.com" },
        { name: "Own domain", domain: "www.example.com" },
        { name: "Northstar", domain: "northstar.com" },
        { name: "NORTHSTAR", domain: "other.com" },
        { name: "Same competitor domain", domain: "northstar.com/path" },
        { name: "Other", domain: "http://127.0.0.1", reason: `<b>${input.token}</b>` },
        ...Array.from({ length: 15 }, (_, i) => ({ name: `Competitor ${i}` })),
      ],
      questions: ["Which tool?", "which tool?", "<b>What is best?</b>", ...Array.from({ length: 12 }, (_, i) => `Question ${i}?`)],
    },
    citations: [
      { title: "<b>Business</b>", url: "https://example.com/#top" },
      { url: "https://example.com/" },
      { url: "javascript:alert(1)" },
      { url: "http://localhost/private" },
      { url: "http://127.0.0.1" },
      { url: "https://user:password@example.com" },
      { url: `https://example.com/${input.token}` },
      { title: "Specific source", url: "https://example.com/article?id=123" },
    ],
  }, input);
  assert.equal(result.brand, "Acme");
  assert.equal(result.description, "A business description");
  assert.equal(result.competitors.length, 5);
  assert.deepEqual(result.competitors[0], { name: "Northstar", domain: "northstar.com" });
  assert.equal(result.competitors[1].domain, undefined);
  assert.equal(result.competitors[1].reason, "[redacted]");
  assert.equal(result.questions.length, 8);
  assert.deepEqual(result.questions.slice(0, 2), ["Which tool?", "What is best?"]);
  assert.deepEqual(result.sources, [
    { title: "Business", url: "https://example.com/" },
    { title: "Specific source", url: "https://example.com/article?id=123" },
  ]);
  assert.ok(!JSON.stringify(result).includes(input.token!));
});

test("onboarding accepts object or JSON structured answers but never invents fields from prose", () => {
  const direct = response();
  assert.equal(normalizeOnboardingResearch({ ...direct, answer: JSON.stringify(direct.answer) }, input).brand, "Acme");
  assert.equal(normalizeOnboardingResearch({ raw: direct }, input).brand, "Acme");
  for (const answer of ["A prose answer", "```json\n{}\n```", null, [], 123]) {
    const result = normalizeOnboardingResearch({ answer }, input);
    assert.equal(result.brand, "");
    assert.deepEqual(result.questions, []);
    assert.deepEqual(result.competitors, []);
  }
});

test("onboarding keeps malformed and incomplete provider results inspectable with settled receipts", async () => {
  const result = await researchOnboarding(input, provider(async () =>
    Response.json({ answer: "Unknown", citations: [] }, { headers }),
  ));
  assert.equal(result.brand, "");
  assert.deepEqual(result.questions, []);
  assert.equal(result.totalCostUsd, 0.005);
  assert.equal(result.errors.length, 3);
  assert.deepEqual(result.callIds, ["test-onboarding-call"]);
});

test("onboarding never treats absent, invalid or pending billing as zero or retries paid requests", async () => {
  for (const cost of [undefined, "", "-1", "NaN", "1.5", "999999999999999999999"]) {
    let calls = 0;
    const result = await researchOnboarding(input, provider(async () => {
      calls++;
      return Response.json(response(), {
        headers: cost === undefined ? {} : { "X-Treg-Cost-Micro": cost },
      });
    }));
    assert.equal(calls, 1);
    assert.equal(result.totalCostUsd, null);
    assert.equal(result.costKnown, false);
    assert.equal(result.knownCostUsd, 0);
  }
  const pending = await researchOnboarding(input, provider(async () =>
    Response.json(response(), { status: 202, headers }),
  ));
  assert.equal(pending.totalCostUsd, null);
  assert.equal(pending.brand, "");
  assert.match(pending.errors[0].error, /still processing/);
  assert.deepEqual(pending.callIds, ["test-onboarding-call"]);
});

test("onboarding preserves failed call receipts and redacts upstream error bodies", async () => {
  let calls = 0;
  const result = await researchOnboarding(input, provider(async () => {
    calls++;
    return Response.json({ error: input.token }, { status: 502, headers });
  }));
  assert.equal(calls, 1);
  assert.equal(result.totalCostUsd, 0.005);
  assert.equal(result.brand, "");
  assert.equal(result.errors.length, 1);
  assert.ok(!JSON.stringify(result).includes(input.token!));
  const disconnected = await researchOnboarding(input, provider(async () => {
    throw new Error(input.token);
  }));
  assert.equal(disconnected.totalCostUsd, null);
  assert.match(disconnected.errors[0].error, /Check Treg activity/);
  assert.ok(!JSON.stringify(disconnected).includes(input.token!));
});

test("only explicit Treg funding/cap refusal proves zero, and oversized/unreadable replies retain billing", async () => {
  for (const refusal of ["insufficient_balance", "route_max_cost"]) {
    const result = await researchOnboarding(input, provider(async () =>
      Response.json({ detail: { error: refusal } }, {
        status: 402, headers: { "X-Treg-Error": "1" },
      }),
    ));
    assert.equal(result.totalCostUsd, 0);
    assert.equal(result.costKnown, true);
  }
  const unknown = await researchOnboarding(input, provider(async () =>
    Response.json({ detail: { error: "insufficient_balance" } }, { status: 402 }),
  ));
  assert.equal(unknown.costKnown, false);
  for (const body of ["not JSON", JSON.stringify({ answer: "x".repeat(513 * 1024) })]) {
    const result = await researchOnboarding(input, provider(async () =>
      new Response(body, { headers }),
    ));
    assert.equal(result.totalCostUsd, 0.005);
    assert.equal(result.errors.length, 1);
    assert.equal(result.brand, "");
  }
});

test("unexpected over-ceiling charges are visible without altering reported cost or submitting more work", async () => {
  const result = await researchOnboarding(input, provider(async () =>
    Response.json(response(), { headers: { ...headers, "X-Treg-Cost-Micro": "6000" } }),
  ));
  assert.equal(result.totalCostUsd, 0.006);
  assert.equal(result.brand, "Acme");
  assert.match(result.errors[0].error, /above the approved ceiling/);
});

test("reviewed audience informs research without pretending other measurement markets are supported", async () => {
  for (const extra of [
    { audience: 5 }, { audience: "x".repeat(601) }, { market: null },
    { market: { country: "GB", language: "en" } }, { market: { country: "US", language: "fr" } },
    { market: { country: "US" } }, { market: { country: "US", language: "en", token: "hidden" } },
  ]) {
    let called = false;
    assert.throws(() => validateOnboardingInput({ ...input, ...extra }), AeoError);
    await assert.rejects(researchOnboarding({ ...input, ...extra } as OnboardingInput, async () => {
      called = true; throw new Error("must not call");
    }), AeoError);
    assert.equal(called, false);
  }
  const audience = "Independent shop owners buying their first analytics tool.";
  const result = await researchOnboarding({ ...input, audience, market: { country: "US", language: "en" } },
    provider(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(body.query, /Independent shop owners/);
      assert.match(body.query, /United States, English/);
      assert.equal(body.country, undefined);
      assert.equal(body.language, undefined);
      return Response.json({ ...response(), answer: { ...response().answer, audience: "Wrong inferred audience" } }, { headers });
    }));
  assert.equal(result.audience, audience);
  assert.deepEqual(result.market, { country: "US", language: "en" });
  assert.deepEqual(result.input, { url: input.url, audience, market: { country: "US", language: "en" } });
  assert.doesNotMatch(JSON.stringify(result.input), /token|synthetic-private/);
});

test("competitor evidence requires a safe observed citation on the competitor's own domain", () => {
  const normalized = normalizeOnboardingResearch({
    answer: {
      ...response().answer,
      competitors: [
        { name: "Verified", domain: "northstar.com", sourceUrl: "https://docs.northstar.com/product", reason: "Relevant offering" },
        { name: "Uncited", domain: "other.com", sourceUrl: "https://other.com/missing" },
        { name: "Mismatched", domain: "rival.com", sourceUrl: "https://directory.com/rival" },
        { name: "Unsafe", domain: "safe.com", sourceUrl: "https://user:secret@safe.com/" },
        { name: "Name only", sourceUrl: "https://name.com/" },
      ],
    },
    citations: [
      { url: "https://docs.northstar.com/product", title: "Product" },
      { url: "https://directory.com/rival", title: "Directory" },
      { url: "https://user:secret@safe.com/", title: "Secret" },
      { url: "http://127.0.0.1/", title: "Private" },
      { url: "javascript:alert(1)", title: "Script" },
    ],
  }, input);
  assert.equal(normalized.competitors[0].sourceUrl, "https://docs.northstar.com/product");
  for (const competitor of normalized.competitors.slice(1)) assert.equal(competitor.sourceUrl, undefined);
  assert.equal(normalized.competitors[1].domain, "other.com");
  assert.equal(normalized.competitors[4].domain, undefined);
  assert.equal(normalized.sources.length, 2);
  assert.doesNotMatch(JSON.stringify(normalized), /secret|127\.0\.0\.1|javascript:/);
});

test("question metadata stays generated and matches canonical legacy question strings", () => {
  const result = normalizeOnboardingResearch({
    ...response(),
    answer: {
      ...response().answer,
      questions: ["Which tools fit a small team?", "Which alternative is best?", "How much does it cost?"],
      buyerQuestions: [
        { text: "which tools fit a small team?", intent: "category", provenance: "discovered", reason: "Find the category" },
        { text: "Which alternative is best?", intent: "comparison" },
        { text: "How much does it cost?", intent: "invented", reason: input.token },
        { text: "Unrequested question?", intent: "branded" },
      ],
    },
  }, input);
  assert.deepEqual(result.buyerQuestions, [
    { text: result.questions[0], intent: "category", provenance: "generated", reason: "Find the category" },
    { text: result.questions[1], intent: "comparison", provenance: "generated" },
    { text: result.questions[2], intent: "other", provenance: "generated", reason: "[redacted]" },
  ]);
  const legacy = normalizeOnboardingResearch(response(), input);
  assert.deepEqual(legacy.buyerQuestions, [{ text: legacy.questions[0], intent: "other", provenance: "generated" }]);
});
