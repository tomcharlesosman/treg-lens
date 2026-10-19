import assert from "node:assert/strict";
import test from "node:test";
import type { AnswerResult } from "./aeo";
import {
  brandStats,
  createDemoRuns,
  csvCell,
  mentionRate,
  normalizeDomain,
  resultsCsv,
  sourceStats,
  visibility,
} from "./workspace-data";
const answer = (overrides: Partial<AnswerResult> = {}): AnswerResult => ({
  id: "a",
  prompt: "Which platform?",
  engine: "chatgpt",
  answer: "1. Other\n2. Treg",
  citations: [
    { domain: "treg.to", url: "https://treg.to/aeo", title: "Toolkit" },
  ],
  mentionedBrands: ["Other", "Treg"],
  brandMentioned: true,
  position: 2,
  costUsd: 0.0028,
  completedAt: "2026-10-19T12:00:00Z",
  ...overrides,
});
test("visibility combines mentions, explicit recommendation position and exact own domain", () => {
  assert.equal(visibility([answer()], "https://www.treg.to"), 85);
  assert.equal(
    visibility(
      [
        answer({
          citations: [
            {
              url: "https://eviltreg.to",
              domain: "eviltreg.to",
              title: "Other",
            },
          ],
        }),
      ],
      "treg.to",
    ),
    65,
  );
  assert.equal(
    visibility(
      [
        answer(),
        answer({
          id: "b",
          brandMentioned: false,
          position: null,
          citations: [],
          mentionedBrands: ["Other"],
        }),
      ],
      "treg.to",
    ),
    42.5,
  );
  assert.equal(visibility([], "treg.to"), 0);
});
test("own competitor card preserves explicit rank and brand matching ignores case", () => {
  const stats = brandStats(
    [answer({ mentionedBrands: ["tReG", "OTHER"] })],
    ["Treg", "Other"],
  );
  assert.equal(stats.find((s) => s.brand === "Treg")?.position, 2);
  assert.equal(stats.find((s) => s.brand === "Other")?.mentions, 1);
  assert.equal(mentionRate([answer(), answer({ brandMentioned: false })]), 50);
});
test("source coverage counts answers once per domain while retaining citation count", () => {
  const rows = sourceStats([
    answer({
      citations: [
        { url: "https://www.treg.to/aeo", domain: "www.treg.to", title: "A" },
        { url: "https://treg.to/docs", domain: "treg.to", title: "B" },
      ],
    }),
    answer({ id: "b", citations: [] }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].citations, 2);
  assert.equal(rows[0].answerCount, 1);
  assert.equal(rows[0].share, 50);
  assert.equal(normalizeDomain("https://www.treg.to/aeo?q=a"), "treg.to");
});
test("CSV neutralizes spreadsheet formulas and safely quotes raw multiline answers", () => {
  assert.equal(csvCell('=IMPORTDATA("secret")'), '"\'=IMPORTDATA(""secret"")"');
  const csv = resultsCsv([
    answer({ prompt: "@SUM(1)", answer: 'Line "one"\nline two' }),
  ]);
  assert.ok(csv.includes('"\'@SUM(1)"'));
  assert.ok(csv.includes('"Line ""one""\nline two"'));
  assert.ok(csv.startsWith('"Prompt"'));
});
test("demo fixture is deterministic, isolated and covers four engines on actual dated samples", () => {
  const runs = createDemoRuns();
  assert.equal(runs.length, 28);
  assert.deepEqual(createDemoRuns(), runs);
  assert.equal(new Set(runs[0].results.map((r) => r.engine)).size, 4);
  assert.equal(runs[0].completedAt, "2026-09-22T00:00:00.000Z");
  assert.ok(
    runs.every((r) => r.id.startsWith("demo-") && r.totalCostUsd === 0),
  );
});
