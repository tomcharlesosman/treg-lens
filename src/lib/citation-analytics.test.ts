import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { AnswerResult } from "./aeo";
import { citationAnalytics, citationOwnership } from "./citation-analytics";
import type { SavedRun } from "./workspace-data";

const citation = (url: string, title = "Saved page") => ({ url, title, domain: "untrusted-provider-label.com" });
const answer = (patch: Partial<AnswerResult> = {}): AnswerResult => ({
  id: "answer-1", prompt: "Which supplier fits?", engine: "chatgpt", answer: "Acme and Contoso fit different buyers.",
  citations: [citation("https://contoso.com/guide"), citation("https://contoso.com/pricing")],
  mentionedBrands: ["Acme", "Contoso"], brandMentioned: true, position: 1, costUsd: 0.002,
  completedAt: "2026-10-20T12:00:00Z", ...patch,
});
const run = (patch: Partial<SavedRun> = {}): SavedRun => ({
  id: "run-1", brand: "Acme", domain: "acme.com", competitors: ["Contoso"],
  competitorDetails: [{ name: "Contoso", domain: "contoso.com" }],
  prompts: ["Which supplier fits?"], engines: ["chatgpt"], results: [answer()], errors: [],
  totalCostUsd: 0.002, completedAt: "2026-10-20T12:00:00Z", ...patch,
});

test("multiple pages remain separate while repeated links and page fragments count once per answer", () => {
  const evidence = citationAnalytics([run({ results: [answer({ citations: [citation("https://contoso.com/guide"), citation("https://contoso.com/guide#one"), citation("https://contoso.com/pricing")] }), answer({ id: "answer-2", prompt: "Which supplier is affordable?", citations: [citation("https://contoso.com/pricing")] })] })]);
  assert.equal(evidence.answered, 2);
  assert.equal(evidence.pages.length, 2);
  assert.equal(evidence.pages.find((page) => page.url.endsWith("/guide"))?.answerCount, 1);
  assert.equal(evidence.domains[0].answerCount, 2);
  assert.equal(evidence.domains[0].coverage, 100);
  assert.equal(evidence.domains[0].promptCount, 2);
  assert.deepEqual(evidence.domains[0].engineCounts, { chatgpt: 2 });
  assert.equal(evidence.domains[0].domain, "contoso.com");
});

test("ownership uses safe hostname boundaries, supports subdomains and ignores upstream domain labels", () => {
  assert.equal(citationOwnership("https://docs.acme.com/a", run()).ownership, "owned");
  assert.equal(citationOwnership("https://news.contoso.com/a", run()).ownership, "competitor");
  assert.equal(citationOwnership("https://notcontoso.com/a", run()).ownership, "other");
  assert.equal(citationOwnership("https://contoso.com.evil.org/a", run()).ownership, "other");
  const evidence = citationAnalytics([run({ results: [answer({ citations: [citation("https://independent.com/research")] })] })]);
  assert.equal(evidence.pages[0].domain, "independent.com");
  assert.deepEqual(evidence.pages[0].ownerships, ["other"]);
  assert.equal(evidence.brands.find((brand) => brand.name === "Contoso")!.cited, 0);
});

test("legacy competitor domains stay unknown and never inherit a current identity", () => {
  const legacy = run({ competitorDetails: undefined });
  assert.equal(citationOwnership("https://contoso.com/guide", legacy).ownership, "unknown");
  assert.equal(citationOwnership("https://acme.com/guide", legacy).ownership, "owned");
  assert.equal(citationOwnership("https://independent.com/research", run({ competitors: [] })).ownership, "other");
  assert.equal(citationOwnership("https://independent.com/research", run({ competitors: undefined })).ownership, "unknown");
  const evidence = citationAnalytics([legacy, run({ id: "run-2" })]);
  const contoso = evidence.brands.filter((brand) => brand.name === "Contoso");
  assert.equal(contoso.length, 2);
  assert.equal(contoso.find((brand) => brand.domain === null)!.citationRate, null);
  assert.equal(contoso.find((brand) => brand.domain === "contoso.com")!.citationRate, 100);
  assert.deepEqual(new Set(evidence.pages[0].ownerships), new Set(["unknown", "competitor"]));
});

test("mentions and citations are independent and each competitor citation counts once per answered check", () => {
  const evidence = citationAnalytics([run({ results: [
    answer({ mentionedBrands: ["Acme"], citations: [citation("https://contoso.com/guide"), citation("https://contoso.com/pricing")] }),
    answer({ id: "answer-2", prompt: "Who should I choose?", engine: "gemini", brandMentioned: false, mentionedBrands: ["Contoso"], citations: [citation("https://acme.com/about")] }),
  ] })]);
  assert.deepEqual(evidence.brands.map(({ name, mentioned, cited, answered }) => ({ name, mentioned, cited, answered })), [
    { name: "Acme", mentioned: 1, cited: 1, answered: 2 },
    { name: "Contoso", mentioned: 1, cited: 1, answered: 2 },
  ]);
  assert.equal(evidence.brands[1].citationRate, 50);
});

test("blank and repeated answer cells do not inflate the denominator; errors are not absence", () => {
  const source = answer();
  const evidence = citationAnalytics([run({
    engines: ["chatgpt", "gemini", "google"],
    results: [source, { ...source, id: "a-duplicate" }, answer({ id: "blank", engine: "gemini", answer: "  " })],
    errors: [{ prompt: source.prompt, engine: "google", error: "Interrupted" }],
  })]);
  assert.equal(evidence.answered, 1);
  assert.equal(evidence.emptyAnswers, 1);
  assert.equal(evidence.domains[0].answerCount, 1);
  assert.equal(evidence.brands[1].citationRate, 100);
  assert.equal(evidence.domains[0].evidence[0].answer, source);
});

test("ownership filters keep the total answered denominator and exact original answer evidence", () => {
  const own = answer({ citations: [citation("https://acme.com/about"), citation("https://contoso.com/guide")] });
  const evidence = citationAnalytics([run({ results: [own, answer({ id: "other", prompt: "What matters most?", engine: "google", citations: [] })] })], "owned");
  assert.equal(evidence.pages.length, 1);
  assert.equal(evidence.pages[0].coverage, 50);
  assert.equal(evidence.pages[0].evidence[0].answer, own);
  assert.equal(evidence.pages[0].evidence[0].runId, "run-1");
  assert.equal(evidence.brands.length, 2);
});

test("unsafe links cannot enter navigation or research, and query-distinct pages remain distinct", () => {
  const evidence = citationAnalytics([run({ results: [answer({ citations: [
    citation("javascript:alert(1)"), citation("https://user:secret@contoso.com/guide"),
    citation("https://127.0.0.1/private"), citation("https://contoso.com/guide?v=1"), citation("https://contoso.com/guide?v=2"),
  ] })] })]);
  assert.equal(evidence.unsafeCitations, 3);
  assert.equal(evidence.pages.length, 2);
  assert.equal(evidence.domains[0].answerCount, 1);
  assert.equal(JSON.stringify(evidence.pages).includes("user:secret"), true, "original evidence remains intact even though unsafe links cannot become actions");
});

test("configured competitor identity snapshots remain unchanged after later website edits", () => {
  const evidence = citationAnalytics([run(), run({ id: "run-2", competitorDetails: [{ name: "Contoso", domain: "new-contoso.com" }] })]);
  assert.equal(evidence.pages[0].evidence[0].ownership, "competitor");
  assert.equal(evidence.pages[0].evidence[1].ownership, "other");
  assert.equal(evidence.brands.find((brand) => brand.domain === "contoso.com")!.cited, 1);
  assert.equal(evidence.brands.find((brand) => brand.domain === "new-contoso.com")!.cited, 0);
});

test("duplicate answer cells select the latest actual instant across timezone offsets", () => {
  const evidence = citationAnalytics([run({ results: [
    answer({ id: "earlier", completedAt: "2026-10-20T01:30:00+03:00", citations: [citation("https://contoso.com/earlier")] }),
    answer({ id: "later", completedAt: "2026-10-19T23:45:00Z", citations: [citation("https://contoso.com/later")] }),
  ] })]);
  assert.equal(evidence.answered, 1);
  assert.equal(evidence.pages[0].url, "https://contoso.com/later");
  assert.equal(evidence.pages[0].evidence[0].answer.id, "later");
});
