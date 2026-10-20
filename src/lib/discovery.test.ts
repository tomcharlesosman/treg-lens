import assert from "node:assert/strict";
import test from "node:test";
import { AeoError } from "./aeo";
import {
  estimateDiscovery,
  normalizeKeywordIdeas,
  normalizePaaQuestions,
  runDiscovery,
  validateDiscoveryInput,
  type DiscoveryInput,
} from "./discovery";

const input: DiscoveryInput = {
  brand: "Treg",
  seeds: ["AI agent tools", "AI search visibility"],
  token: "test-token-not-for-output",
};
function catalogFixture(url: string): Response | null {
  if (!url.includes("/catalog/")) return null;
  if (url.endsWith("treg.google.keywords.ideas"))
    return Response.json({
      endpoint: {
        routed_children: [
          "anyapi.google.keywords.ideas",
          "dataforseo.google.keywords.ideas",
          "seranking.google.keywords.ideas",
          "serpapi.google.keywords.ideas",
        ],
      },
    });
  return Response.json({
    endpoint: {
      cost: {
        usd: url.endsWith("anyapi.google.keywords.ideas") ? 0.00099 : 0.0028,
      },
    },
  });
}

test("discovery validation bounds seeds and rejects duplicate seeds and credential injection", () => {
  assert.deepEqual(
    validateDiscoveryInput({
      ...input,
      seeds: [" AI tools ", "AI visibility"],
      estimateOnly: true,
    }).seeds,
    ["AI tools", "AI visibility"],
  );
  for (const seeds of [
    [],
    ["one"],
    ["one", "two", "three", "four"],
    ["one", "ONE"],
    ["a", "two"],
    ["a\nb", "two"],
    ["a\tb", "two"],
    ["a\u0000b", "two"],
    ["x".repeat(101), "two"],
  ])
    assert.throws(() => validateDiscoveryInput({ ...input, seeds }), AeoError);
  assert.throws(
    () => validateDiscoveryInput({ ...input, token: "unsafe\r\nheader" }),
    AeoError,
  );
  assert.throws(
    () => validateDiscoveryInput({ ...input, estimateOnly: "true" }),
    AeoError,
  );
});

test("routed keyword normalization preserves actual phrasing and actual metrics only", () => {
  const keywords = normalizeKeywordIdeas(
    {
      output: {
        keywords: [
          { value: "  Best AI tools " },
          { keyword: "best ai tools", volume: 9999 },
          { keyword: "Agent platforms", keyword_info: { search_volume: 320 } },
          {
            keyword_data: {
              keyword: "Agent data",
              keyword_info: { search_volume: "120" },
            },
          },
          "<b>AI</b> visibility",
          { keyword: "Invalid volume", volume: -1 },
        ],
      },
    },
    "AI tools",
  );
  assert.equal(keywords.length, 5);
  assert.equal(keywords[0].text, "Best AI tools");
  assert.equal(keywords[0].searchVolume, null);
  assert.equal(keywords[1].searchVolume, 320);
  assert.equal(keywords[2].searchVolume, 120);
  assert.equal(keywords[3].text, "AI visibility");
  assert.equal(keywords[4].searchVolume, null);
  assert.ok(
    keywords.every(
      (row) => row.kind === "keyword" && row.origin === "Keyword idea",
    ),
  );
  assert.equal(
    normalizeKeywordIdeas(
      {
        output: {
          keywords: Array.from({ length: 20 }, (_, i) => `Keyword ${i}`),
        },
      },
      "seed",
    ).length,
    8,
  );
  assert.equal(
    normalizeKeywordIdeas(
      { output: { data: { suggestions: [{ value: "Actual suggestion" }] } } },
      "seed",
    )[0].text,
    "Actual suggestion",
  );
});

test("PAA normalization uses returned question fields, never organic titles or inherited volume", () => {
  const keyword = normalizeKeywordIdeas(
    { keywords: [{ keyword: "AI tools", volume: 1200 }] },
    "seed",
  )[0];
  const questions = normalizePaaQuestions(
    {
      success: true,
      result: {
        peopleAlsoAsk: [
          { question: "What are AI tools?" },
          { question: "What are AI tools?" },
          { question: "Which agent tools are open source?" },
        ],
        organicResults: [{ title: "An organic title is not a question" }],
      },
    },
    keyword,
  );
  assert.equal(questions.length, 2);
  assert.equal(questions[0].keyword, "AI tools");
  assert.equal(questions[0].searchVolume, null);
  assert.equal(questions[0].origin, "People Also Ask");
  assert.equal(
    normalizePaaQuestions(
      {
        result: { organicResults: [{ title: "Do not invent this question?" }] },
      },
      keyword,
    ).length,
    0,
  );
});

test("free discovery estimate reads live catalogs and bounds fanout before paid calls", async () => {
  const calls: string[] = [];
  const estimate = await estimateDiscovery(input, async (url) => {
    calls.push(String(url));
    const fixture = catalogFixture(String(url));
    assert.ok(fixture, "Estimates must not call paid routes");
    return fixture;
  });
  assert.equal(calls.length, 3);
  assert.equal(estimate.maxCalls, 5);
  assert.equal(estimate.totalCostUsd, 0.01038);
  await assert.rejects(
    () =>
      estimateDiscovery(input, async (url) =>
        String(url).endsWith("treg.google.keywords.ideas")
          ? catalogFixture(String(url))!
          : Response.json({ endpoint: {} }),
      ),
    AeoError,
  );
});

test("discovery uses fixed routes, bounded US/en requests, and actual charge headers", async () => {
  const paid: string[] = [];
  const searches: string[] = [];
  const result = await runDiscovery(input, async (url, init) => {
    const path = String(url);
    const fixture = catalogFixture(path);
    if (fixture) return fixture;
    paid.push(path);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Treg-Token"), input.token);
    assert.ok(headers.get("Idempotency-Key"));
    const body = JSON.parse(String(init?.body));
    if (path.endsWith("treg.google.keywords.ideas")) {
      assert.equal(body.country, "us");
      assert.equal(body.language, "en");
      assert.equal(body.limit, 8);
      assert.equal(headers.get("X-Treg-Route-Waterfall"), "0");
      assert.equal(headers.get("X-Treg-Route-Max-Cost"), "0.00099");
      assert.equal(headers.get("X-Treg-Route-Prefer"), "anyapi");
      assert.match(headers.get("X-Treg-Route-Exclude")!, /dataforseo/);
      return Response.json(
        {
          output: {
            keywords: [
              { keyword: `${body.keyword} first` },
              { keyword: `${body.keyword} second` },
              { keyword: "Shared idea" },
            ],
          },
          _treg: { served_by: "anyapi.google.keywords.ideas" },
          cost: 999,
        },
        { headers: { "X-Treg-Cost-Micro": "990", "X-Treg-Call-Id": `fixture-${body.keyword}` } },
      );
    }
    assert.ok(path.endsWith("cloro.google.serp.organic"));
    assert.deepEqual(Object.keys(body).sort(), ["gl", "hl", "pages", "query"]);
    assert.equal(body.gl, "US");
    assert.equal(body.hl, "en");
    assert.equal(body.pages, 1);
    searches.push(body.query);
    return Response.json(
      {
        success: true,
        result: {
          peopleAlsoAsk: [
            { question: "Which AI tools should I use?" },
            { question: `How do I choose ${body.query}?` },
          ],
        },
      },
      { headers: { "X-Treg-Cost-Micro": "2000" } },
    );
  });
  assert.equal(paid.length, 5);
  assert.equal(searches.length, 3);
  assert.ok(searches[0].startsWith(input.seeds[0]));
  assert.ok(
    searches[1].startsWith(input.seeds[1]),
    "Provider ordering interleaves seeds",
  );
  assert.equal(result.callIds.length, 2);
  assert.ok(result.acceptedEstimate);
  assert.equal(result.keywordCount, 5);
  assert.equal(result.questionCount, 4);
  assert.equal(result.totalCostUsd, 0.00798);
  assert.equal(result.totalCostKnown, true);
  assert.equal(result.errors.length, 0);
  assert.ok(!JSON.stringify(result).includes(input.token!));
});

test("partial PAA failures keep real keyword ideas and suppress upstream secrets", async () => {
  const result = await runDiscovery(input, async (url) => {
    const path = String(url);
    const fixture = catalogFixture(path);
    if (fixture) return fixture;
    if (path.endsWith("treg.google.keywords.ideas"))
      return Response.json(
        { output: { keywords: ["Actual keyword idea"] } },
        { headers: { "X-Treg-Cost-Micro": "990" } },
      );
    return Response.json({ error: input.token }, { status: 503 });
  });
  assert.equal(result.keywordCount, 1);
  assert.equal(result.questionCount, 0);
  assert.equal(result.candidates[0].text, "Actual keyword idea");
  assert.equal(result.candidates[0].kind, "keyword");
  assert.equal(result.errors.length, 1);
  assert.equal(result.totalCostKnown, false);
  assert.ok(!JSON.stringify(result).includes(input.token!));
});

test("pending submissions are not retried or misreported as settled charges", async () => {
  let paidCalls = 0;
  const result = await runDiscovery(input, async (url) => {
    const fixture = catalogFixture(String(url));
    if (fixture) return fixture;
    paidCalls += 1;
    return Response.json(
      { pending: true },
      { status: 202, headers: { "X-Treg-Cost-Micro": "1000" } },
    );
  });
  assert.equal(paidCalls, 2);
  assert.equal(result.totalCostUsd, 0);
  assert.equal(result.totalCostKnown, false);
  assert.equal(result.reservedCostUsd, 0.002);
  assert.equal(result.errors.length, 2);
  assert.equal(result.candidates.length, 0);
});

test("a successful result without a charge header remains useful but billing is unknown", async () => {
  const result = await runDiscovery(input, async (url) => {
    const fixture = catalogFixture(String(url));
    if (fixture) return fixture;
    if (String(url).endsWith("treg.google.keywords.ideas"))
      return Response.json({ output: { keywords: ["An actual idea"] } });
    return Response.json({
      success: true,
      result: { peopleAlsoAsk: [{ question: "An actual question?" }] },
    });
  });
  assert.equal(result.questionCount, 1);
  assert.equal(result.totalCostKnown, false);
  assert.equal(result.totalCostUsd, 0);
});


test("discovery refuses stale accepted ceilings before a paid call", async () => {
  let paid = 0;
  await assert.rejects(() => runDiscovery({ ...input, maxCostUsd: 0.001 }, async (url) => {
    const fixture = catalogFixture(String(url));
    if (fixture) return fixture;
    paid += 1;
    return Response.json({});
  }), /accepted ceiling/);
  assert.equal(paid, 0);
  for (const maxCostUsd of [-1, 0.11, "0.01", Infinity]) assert.throws(() => validateDiscoveryInput({ ...input, maxCostUsd }), AeoError);
});


test("discovery bounds provider metadata before persisting a paid result", () => {
  const [candidate] = normalizeKeywordIdeas({ keywords: [{ keyword: "weather", volume: 12500000 }] }, "weather forecast", "<b>" + "provider".repeat(30) + "\n</b>");
  assert.equal(candidate.searchVolume, 12500000);
  assert.equal(candidate.provider.length, 100);
  assert.doesNotMatch(candidate.provider, /[<>\n]/);
});
