import assert from "node:assert/strict";
import test from "node:test";
import {
  AeoError,
  aeoErrorResponse,
  estimateAudit,
  normalizeAnswer,
  readAuditRequest,
  runAudit,
  validateAuditInput,
  type AuditInput,
} from "./aeo";

const input: AuditInput = {
  brand: "Firecrawl",
  domain: "firecrawl.dev",
  competitors: ["Crawl4AI", "Scrapy"],
  prompts: ["Best open-source web crawlers for an LLM pipeline?"],
  engines: ["chatgpt", "gemini"],
  token: "a-test-credential-never-returned",
};

test("input validation normalizes a website and bounds the full paid fan-out", () => {
  const result = validateAuditInput({
    ...input,
    domain: "https://www.firecrawl.dev/docs",
    prompts: [" hello ", "hello"],
    engines: ["chatgpt", "chatgpt"],
  });
  assert.equal(result.domain, "firecrawl.dev");
  assert.deepEqual(result.prompts, ["hello"]);
  assert.deepEqual(result.engines, ["chatgpt"]);
  assert.throws(
    () =>
      validateAuditInput({
        ...input,
        prompts: Array.from({ length: 9 }, (_, i) => String(i)),
      }),
    AeoError,
  );
  assert.throws(
    () => validateAuditInput({ ...input, prompts: ["x".repeat(501)] }),
    AeoError,
  );
  assert.throws(
    () =>
      validateAuditInput({ ...input, engines: ["https://attacker.example"] }),
    AeoError,
  );
  assert.throws(
    () => validateAuditInput({ ...input, token: "bad\r\nheader" }),
    AeoError,
  );
});

test("Cloro results preserve explicit rank, deduplicate citations, and exclude entity footnotes", () => {
  const result = normalizeAnswer(
    {
      success: true,
      result: {
        markdown:
          "## 1. Crawl4AI\nA crawler.\n## 2. **Firecrawl**\n[Docs](https://firecrawl.dev/docs?utm_source=chatgpt)\n## 3. Scrapy",
        sources: [
          {
            url: "https://firecrawl.dev/docs?utm_source=chatgpt",
            label: "Docs",
          },
          { url: "https://firecrawl.dev/docs", label: "Docs" },
          { url: "https://example.com/entity-image", footnote: true },
          { url: "javascript:alert(1)" },
        ],
        entities: [
          { type: "software", name: "Firecrawl" },
          { type: "person", name: "Jane" },
        ],
      },
    },
    input,
    input.prompts[0],
    "chatgpt",
    0.0028,
    "verified-call-id",
  );
  assert.equal(result.position, 2);
  assert.equal(result.brandMentioned, true);
  assert.equal(result.id, "verified-call-id");
  assert.deepEqual(result.mentionedBrands, ["Crawl4AI", "Firecrawl", "Scrapy"]);
  assert.deepEqual(result.citations, [
    {
      url: "https://firecrawl.dev/docs",
      title: "Docs",
      domain: "firecrawl.dev",
    },
  ]);
  assert.equal(result.sourceKind, "web-interface");
});

test("a brand appearing only inside a citation destination is not a prose mention", () => {
  const result = normalizeAnswer(
    {
      success: true,
      result: {
        markdown: "Try Notionally and [documentation](https://firecrawl.dev).",
      },
    },
    { ...input, brand: "Notion", competitors: [] },
    "test",
    "gemini",
    0,
  );
  assert.equal(result.brandMentioned, false);
  assert.equal(result.position, null);
  assert.deepEqual(result.mentionedBrands, []);
});

test("routed Perplexity output preserves model API provenance and sources", () => {
  const result = normalizeAnswer(
    {
      output: {
        answer: "Try Firecrawl for ingestion.",
        sources: [{ url: "https://firecrawl.dev", title: "Firecrawl" }],
      },
    },
    input,
    "test",
    "perplexity",
    0.005861,
  );
  assert.equal(result.brandMentioned, true);
  assert.equal(result.sourceKind, "model-api");
  assert.equal(result.provider, "dataforseo");
  assert.equal(result.citations[0].domain, "firecrawl.dev");
});

test("DataForSEO raw output is recovered from sections and annotations", () => {
  const result = normalizeAnswer(
    {
      raw: {
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    sections: [
                      {
                        text: "Firecrawl is an option.",
                        annotations: [
                          { url: "https://firecrawl.dev/", title: "Home" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    input,
    "test",
    "perplexity",
    0.006,
  );
  assert.equal(result.answer, "Firecrawl is an option.");
  assert.equal(result.citations[0].title, "Home");
  assert.throws(
    () => normalizeAnswer({ success: false }, input, "test", "google", 0),
    AeoError,
  );
  assert.throws(
    () =>
      normalizeAnswer({ result: { sources: [] } }, input, "test", "google", 0),
    AeoError,
  );
});

test("estimate uses live catalog pricing and refuses missing verified prices", async () => {
  const estimate = await estimateAudit(input, async (url) => {
    assert.match(String(url), /^https:\/\/treg\.to\/catalog\/endpoints\//);
    return Response.json({ endpoint: { cost: { usd: 0.0036 } } });
  });
  assert.equal(estimate.totalCostUsd, 0.0072);
  assert.equal(estimate.callCount, 2);
  await assert.rejects(
    () => estimateAudit(input, async () => Response.json({ endpoint: {} })),
    AeoError,
  );
});

test("a durable worker executes its reserved quote with stable per-call idempotency keys", async () => {
  const quote = await estimateAudit(input, async () => Response.json({ endpoint: { cost: { usd: 0.0036 } } }));
  const keys: string[] = [];
  const answer = await runAudit(input, async (url, init) => {
    assert.ok(String(url).includes("/call/"), "The worker must not refresh pricing after reserving a different quote");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Treg-Route-Max-Cost"), "0.0036");
    keys.push(headers.get("Idempotency-Key")!);
    return Response.json({ result: { markdown: "Firecrawl is an option." } }, { headers: { "X-Treg-Cost-Micro": "3000" } });
  }, { estimate: quote, idempotencyPrefix: "durable-job-one" });
  assert.deepEqual(keys.sort(), ["durable-job-one:0:chatgpt", "durable-job-one:0:gemini"]);
  assert.equal(answer.results.length, 2);
  assert.equal(answer.totalCostUsd, 0.006);
});

test("a fresh audit estimate above the caller's approval makes zero paid calls", async () => {
  let paid = 0;
  await assert.rejects(() => runAudit({ ...input, maxCostUsd: 0.005 }, async (url) => {
    if (String(url).includes("/call/")) paid++;
    return Response.json({ endpoint: { cost: { usd: 0.004 } } });
  }), /estimate increased beyond your approval/);
  assert.equal(paid, 0);
  assert.equal(validateAuditInput({ ...input, maxCostUsd: 0.005 }).maxCostUsd, 0.005);
  assert.throws(() => validateAuditInput({ ...input, maxCostUsd: -1 }), /ceiling/);
  assert.throws(() => validateAuditInput({ ...input, market: { country: "GB", language: "en" } }), /United States/);
});

test("asynchronous audit submissions retain unknown billing instead of treating reservations as charges", async () => {
  const response = await runAudit({ ...input, engines: ["chatgpt"] }, async (url) => {
    if (String(url).includes("/catalog/")) return Response.json({ endpoint: { cost: { usd: 0.004 } } });
    return Response.json({ status: "pending" }, { status: 202, headers: { "X-Treg-Cost-Micro": "1000", "X-Treg-Call-Id": "pending-submission-one" } });
  });
  assert.equal(response.totalCostKnown, false);
  assert.equal(response.totalCostUsd, 0);
  assert.equal(response.results.length, 0);
  assert.equal(response.errors[0].costKnown, false);
  assert.match(response.errors[0].error, /still processing.*unsettled.*before retrying/);
});

test("paid calls use fixed routes, quote caps, real header charges, and partial failures", async () => {
  const calls: string[] = [];
  const response = await runAudit(input, async (url, init) => {
    const path = String(url);
    calls.push(path);
    if (path.includes("/catalog/"))
      return Response.json({ endpoint: { cost: { usd: 0.0036 } } });
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Treg-Token"), input.token);
    assert.equal(headers.get("X-Treg-Route-Max-Cost"), "0.0036");
    assert.ok(headers.get("Idempotency-Key"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      prompt: input.prompts[0],
      country: "US",
      include: { markdown: true },
    });
    if (path.endsWith("gemini.scrape"))
      return Response.json(
        {
          detail: {
            error: "insufficient_balance",
            balance: 52,
            secret: input.token,
          },
        },
        { status: 402 },
      );
    return Response.json(
      {
        success: true,
        result: { markdown: "Firecrawl is a crawler.", cost: 900 },
      },
      {
        headers: { "X-Treg-Cost-Micro": "2800", "X-Treg-Call-Id": "paid-call" },
      },
    );
  });
  assert.equal(calls.filter((url) => url.includes("/call/")).length, 2);
  assert.equal(response.results.length, 1);
  assert.equal(response.errors.length, 1);
  assert.equal(response.totalCostUsd, 0.0028);
  assert.equal(response.results[0].costUsd, 0.0028);
  assert.doesNotMatch(
    JSON.stringify(response),
    /a-test-credential|insufficient_balance|"balance"|900/,
  );
});

test("Perplexity uses routed translation, excludes unavailable consumer sessions, and caps cost", async () => {
  await runAudit({ ...input, engines: ["perplexity"] }, async (url, init) => {
    if (String(url).includes("/catalog/")) {
      assert.ok(
        String(url).endsWith(
          "dataforseo.x.ai-optimization-perplexity-llm-responses-live",
        ),
      );
      return Response.json({ endpoint: { cost: { usd: 0.005861 } } });
    }
    assert.ok(String(url).endsWith("treg.ai-search.perplexity.answer"));
    assert.equal(
      new Headers(init?.headers).get("X-Treg-Route-Exclude"),
      "cloro",
    );
    assert.equal(
      new Headers(init?.headers).get("X-Treg-Route-Max-Cost"),
      "0.005861",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      prompt: input.prompts[0],
      country: "US",
    });
    return Response.json({ output: { answer: "Firecrawl." } });
  });
});

test("charged malformed answers remain in total cost and failed metrics are excluded", async () => {
  const response = await runAudit(
    { ...input, engines: ["chatgpt"] },
    async (url) => {
      if (String(url).includes("/catalog/"))
        return Response.json({ endpoint: { cost: { usd: 0.0036 } } });
      return Response.json(
        { success: true, result: {} },
        { headers: { "X-Treg-Cost-Micro": "2800" } },
      );
    },
  );
  assert.equal(response.results.length, 0);
  assert.equal(response.errors[0].costUsd, 0.0028);
  assert.equal(response.totalCostUsd, 0.0028);
});

test("missing billing headers remain unknown rather than claimed free", async () => {
  const response = await runAudit(
    { ...input, engines: ["chatgpt"] },
    async (url) => {
      if (String(url).includes("/catalog/"))
        return Response.json({ endpoint: { cost: { usd: 0.0036 } } });
      return Response.json({
        success: true,
        result: { text: "Firecrawl is a crawler." },
      });
    },
  );
  assert.equal(response.results[0].costUsd, 0);
  assert.equal(response.results[0].costKnown, false);
  assert.equal(response.totalCostKnown, false);
});

test("a proxy's internal URL may differ from the actual browser Host", async () => {
  const result = await readAuditRequest(
    new Request("http://localhost:3000/api/aeo/run", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(result.brand, input.brand);
  await assert.rejects(
    () =>
      readAuditRequest(
        new Request("http://localhost:3000/api/aeo/run", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin: "https://attacker.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
      ),
    (error: unknown) => error instanceof AeoError && error.status === 403,
  );
});

test("request handling blocks cross-origin and streamed oversized input", async () => {
  await assert.rejects(
    () =>
      readAuditRequest(
        new Request("https://app.example/api/aeo/run", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
      ),
    (error: unknown) => error instanceof AeoError && error.status === 403,
  );
  await assert.rejects(
    () =>
      readAuditRequest(
        new Request("https://app.example/api/aeo/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: " ".repeat(16_385),
        }),
      ),
    (error: unknown) => error instanceof AeoError && error.status === 413,
  );
  const response = aeoErrorResponse(new Error(`private ${input.token}`));
  assert.doesNotMatch(await response.text(), /private|a-test-credential/);
});
