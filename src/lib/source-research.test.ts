import assert from "node:assert/strict";
import test from "node:test";
import { AeoError } from "./aeo";
import {
  assertPublicDns,
  estimateSource,
  parseMetrics,
  parsePage,
  readToolRequest,
  researchSource,
  validatePublicUrl,
  validateSourceInput,
  type SourceInput,
} from "./source-research";

const input: SourceInput = {
  url: "https://publication.com/best-tools",
  brand: "Treg",
  token: "test-only-secret",
};
const catalog = (url: string) => {
  if (url.endsWith("treg.web.url.metrics"))
    return {
      endpoint: {
        routed_children: [
          "moz.web.url.metrics",
          "seranking.web.url.metrics",
          "dataforseo.web.url.metrics",
        ],
      },
    };
  if (url.endsWith("treg.web.extract"))
    return {
      endpoint: {
        routed_children: [
          "exa.web.contents.get",
          "tinyfish.web.fetch",
          "firecrawl.web.scrape",
        ],
      },
    };
  return {
    endpoint: {
      cost: { usd: url.endsWith("moz.web.url.metrics") ? 0.006667 : 0.001 },
    },
  };
};

test("source URLs reject local/private IPs, credentials, unsafe ports and encoded path controls", () => {
  for (const url of [
    "http://localhost/a",
    "http://127.0.0.1/a",
    "http://2130706433/a",
    "http://0x7f000001/a",
    "http://10.2.3.4",
    "http://172.16.1.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "https://service.internal/a",
    "https://u:p@website.com",
    "ftp://website.com",
    "https://website.com:9000",
    "https://website.com/%0d%0a",
    "https://website.com\\@127.0.0.1",
  ]) {
    assert.throws(() => validatePublicUrl(url), AeoError, url);
  }
  assert.equal(
    validatePublicUrl("https://publication.com/article#section"),
    "https://publication.com/article",
  );
  assert.equal(
    validatePublicUrl("https://8.8.8.8/article"),
    "https://8.8.8.8/article",
  );
  assert.throws(() => validateSourceInput({ ...input, brand: "" }), AeoError);
  assert.throws(
    () => validateSourceInput({ ...input, token: "a\nb" }),
    AeoError,
  );
});

test("public DNS guard refuses hostnames resolving to private address space", async () => {
  const privateResolver = (async () => [
    { address: "127.0.0.1", family: 4 },
  ]) as unknown as Parameters<typeof assertPublicDns>[1];
  const mixedResolver = (async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]) as unknown as Parameters<typeof assertPublicDns>[1];
  const publicResolver = (async () => [
    { address: "8.8.8.8", family: 4 },
  ]) as unknown as Parameters<typeof assertPublicDns>[1];
  await assert.rejects(
    () => assertPublicDns(input.url, privateResolver),
    AeoError,
  );
  await assert.rejects(
    () => assertPublicDns(input.url, mixedResolver),
    AeoError,
  );
  await assertPublicDns(input.url, publicResolver);
});

test("metrics use actual Moz values and retain unknown data as null", () => {
  assert.deepEqual(
    parseMetrics({
      output: {
        metrics: {
          domain_authority: 85,
          page_authority: 31,
          spam_score: 0,
          root_domains_to_page: 124,
          external_pages_to_page: 5000,
        },
      },
    }),
    {
      domainAuthority: 85,
      pageAuthority: 31,
      spamScore: 0,
      referringDomains: 124,
      externalLinks: 5000,
      lastCrawled: null,
    },
  );
  assert.equal(
    parseMetrics({ raw: { results: [{ domain_authority: 50 }] } })
      .domainAuthority,
    50,
  );
  assert.equal(
    parseMetrics({
      output: { metrics: { domain_authority: "85", page_authority: 1001 } },
    }).domainAuthority,
    null,
  );
  assert.equal(parseMetrics(null).pageAuthority, null);
});

test("extraction retains evidence and returns only observed contact routes", () => {
  const page = parsePage(
    {
      output: {
        pages: [
          {
            title: "The best agent tools",
            author: "Jamie Writer",
            publishedDate: "2026-10-01",
            text: "# Agent tools\nTreg provides live data. Treg also offers search.\n[Contact the editor](/contact)\nWrite to editor@publication.com.\n[Author profile](https://publication.com/authors/jamie)\n[Unsafe contact](http://127.0.0.1/contact)",
          },
        ],
      },
      raw: { statuses: [{ source: "cached" }] },
    },
    input,
  );
  assert.equal(page.title, "The best agent tools");
  assert.equal(page.brandOccurrences, 2);
  assert.equal(page.brandMentioned, true);
  assert.equal(page.author, "Jamie Writer");
  assert.equal(page.freshness, "cached");
  assert.deepEqual(
    page.contactRoutes.map((route) => route.url).sort(),
    [
      "https://publication.com/authors/jamie",
      "https://publication.com/contact",
      "mailto:editor@publication.com",
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(page.contactRoutes),
    /127\.0|info@|jamie@/,
  );
});

test("missing content leaves brand presence unknown, with no invented contact or author", () => {
  const absent = parsePage({ output: { pages: [] } }, input);
  assert.equal(absent.brandMentioned, null);
  assert.equal(absent.brandOccurrences, null);
  assert.equal(absent.author, null);
  assert.deepEqual(absent.contactRoutes, []);
  const noMention = parsePage(
    {
      output: {
        pages: [{ text: "Notreg is a word. [Read more](https://treg.to)" }],
      },
    },
    input,
  );
  assert.equal(noMention.brandMentioned, false);
});

test("quote checks live provider prices and routed membership without a paid call", async () => {
  let calls = 0;
  const quote = await estimateSource(async (url) => {
    calls += 1;
    assert.match(String(url), /\/catalog\/endpoints\//);
    return Response.json(catalog(String(url)));
  });
  assert.equal(calls, 3);
  assert.equal(quote.totalCostUsd, 0.007667);
  assert.deepEqual(
    quote.steps.map((step) => step.provider),
    ["moz", "exa"],
  );
  await assert.rejects(
    () =>
      estimateSource(async () =>
        Response.json({ endpoint: { cost: { usd: null } } }),
      ),
    AeoError,
  );
});

test("research pins toolkit routes, excludes all other providers and records header costs", async () => {
  const result = await researchSource(input, async (url, init) => {
    const path = String(url);
    if (path.includes("/catalog/")) return Response.json(catalog(path));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Treg-Token"), input.token);
    assert.ok(headers.get("Idempotency-Key"));
    if (path.endsWith("treg.web.url.metrics")) {
      assert.equal(headers.get("X-Treg-Route-Waterfall"), "0");
      assert.equal(headers.get("X-Treg-Route-Prefer"), "moz");
      assert.match(headers.get("X-Treg-Route-Exclude") || "", /seranking/);
      assert.match(headers.get("X-Treg-Route-Exclude") || "", /dataforseo/);
      assert.equal(headers.get("X-Treg-Route-Max-Cost"), "0.006667");
      assert.deepEqual(JSON.parse(String(init?.body)), { target: input.url });
      return Response.json(
        { output: { metrics: { domain_authority: 60, page_authority: 25 } } },
        {
          headers: {
            "X-Treg-Cost-Micro": "6667",
            "X-Treg-Call-Id": "metrics-call",
          },
        },
      );
    }
    assert.equal(path, "https://treg.to/call/exa.web.contents.get");
    assert.equal(headers.get("X-Treg-Route-Prefer"), null);
    assert.equal(headers.get("X-Treg-Route-Max-Cost"), "0.001");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      urls: [input.url],
      text: { maxCharacters: 20_000 },
    });
    return Response.json(
      {
        results: [
          {
            text: "Treg is an agent toolkit.",
            title: "Agent tools",
            author: "Known Author",
          },
        ],
      },
      {
        headers: {
          "X-Treg-Cost-Micro": "1000",
          "X-Treg-Call-Id": "extract-call",
        },
      },
    );
  });
  assert.equal(result.totalCostUsd, 0.007667);
  assert.equal(result.costKnown, true);
  assert.equal(result.brandMentioned, true);
  assert.equal(result.title, "Agent tools");
  assert.equal(result.author, "Known Author");
  assert.equal(result.metrics.domainAuthority, 60);
  assert.deepEqual(result.callIds, ["metrics-call", "extract-call"]);
  assert.doesNotMatch(JSON.stringify(result), /test-only-secret/);
});

test("partial failures preserve page evidence and never claim an unknown charge is free", async () => {
  const result = await researchSource(input, async (url) => {
    const path = String(url);
    if (path.includes("/catalog/")) return Response.json(catalog(path));
    if (path.endsWith("metrics"))
      return Response.json(
        { detail: { balance: 100, secret: input.token } },
        { status: 402 },
      );
    return Response.json(
      { output: { pages: [{ text: "An article about tools." }] } },
      { headers: { "X-Treg-Cost-Micro": "1000" } },
    );
  });
  assert.equal(result.totalCostUsd, null);
  assert.equal(result.costKnown, false);
  assert.equal(result.knownCostUsd, 0.001);
  assert.equal(result.metrics.domainAuthority, null);
  assert.equal(result.brandMentioned, false);
  assert.equal(result.errors[0].step, "metrics");
  assert.doesNotMatch(JSON.stringify(result), /test-only-secret|balance/);
});

test("a trusted Treg preflight cost-cap refusal is known to be uncharged", async () => {
  const result = await researchSource(input, async (url) => {
    const path = String(url);
    if (path.includes("/catalog/")) return Response.json(catalog(path));
    if (path.endsWith("metrics"))
      return Response.json(
        { detail: { error: "route_max_cost" } },
        { status: 402, headers: { "X-Treg-Error": "1" } },
      );
    return Response.json(
      { results: [{ text: "Article text." }] },
      { headers: { "X-Treg-Cost-Micro": "1000" } },
    );
  });
  assert.equal(result.costKnown, true);
  assert.equal(result.totalCostUsd, 0.001);
  assert.equal(result.errors.length, 1);
});

test("pending source reservations remain unsettled while completed evidence and actual charges survive", async () => {
  const result = await researchSource(input, async (url) => {
    const path = String(url);
    if (path.includes("/catalog/")) return Response.json(catalog(path));
    if (path.endsWith("metrics"))
      return Response.json({ status: "pending", private: input.token }, {
        status: 202,
        headers: { "X-Treg-Cost-Micro": "6667", "X-Treg-Call-Id": "pending-metrics" },
      });
    return Response.json({ results: [{ text: "Treg is described in this completed page." }] }, {
      headers: { "X-Treg-Cost-Micro": "1000", "X-Treg-Call-Id": "completed-extract" },
    });
  });
  assert.equal(result.costKnown, false);
  assert.equal(result.totalCostUsd, null);
  assert.equal(result.knownCostUsd, 0.001);
  assert.equal(result.metrics.domainAuthority, null);
  assert.equal(result.brandMentioned, true);
  assert.deepEqual(result.callIds, ["pending-metrics", "completed-extract"]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /still processing.*not a settled charge/i);
  assert.doesNotMatch(JSON.stringify(result), /test-only-secret/);
});

test("pending source steps cannot become completed or free from a reservation header, including zero", async () => {
  for (const reservation of ["1000", "0"]) {
    const result = await researchSource(input, async (url) => {
      const path = String(url);
      if (path.includes("/catalog/")) return Response.json(catalog(path));
      return Response.json({ results: [{ text: "Treg is still being processed." }] }, {
        status: 202, headers: { "X-Treg-Cost-Micro": reservation },
      });
    });
    assert.equal(result.costKnown, false);
    assert.equal(result.totalCostUsd, null);
    assert.equal(result.knownCostUsd, 0);
    assert.equal(result.brandMentioned, null);
    assert.equal(result.excerpt, null);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.every((issue) => /still processing/i.test(issue.error)));
  }
});

test("shared tool reader respects actual Host behind internal URL rewrites and limits data", async () => {
  const data = await readToolRequest(
    new Request("http://localhost:3000/api/aeo/source", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
  assert.deepEqual(data, input);
  await assert.rejects(
    () =>
      readToolRequest(
        new Request("https://app.com/api/aeo/source", {
          method: "POST",
          headers: {
            origin: "https://evil.com",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      ),
    (error: unknown) => error instanceof AeoError && error.status === 403,
  );
  await assert.rejects(
    () =>
      readToolRequest(
        new Request("https://app.com/api/aeo/source", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: " ".repeat(16_385),
        }),
      ),
    (error: unknown) => error instanceof AeoError && error.status === 413,
  );
});
