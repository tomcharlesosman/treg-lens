import assert from "node:assert/strict";
import test from "node:test";
import type { AnswerResult, AuditInput } from "./aeo";
import { buildMeasurementScope, cleanMeasurementScope, comparableTrend, measureRun, measurementScopeKey, validateMeasurementScope } from "./measurement";
import { createPromptRecord } from "./prompt-library";
import type { SavedRun } from "./workspace-data";
const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Best toolkit?"], engines: ["chatgpt"] };
const answer = (overrides: Partial<AnswerResult> = {}): AnswerResult => ({ id: "a", prompt: input.prompts[0], engine: "chatgpt", answer: "Treg is mentioned.", citations: [{ url: "https://docs.treg.to/a", domain: "docs.treg.to", title: "Docs" }], mentionedBrands: ["Treg"], brandMentioned: true, position: 1, costUsd: 0, completedAt: "2026-10-20T12:00:00Z", provider: "cloro", sourceKind: "web-interface", ...overrides });
const run = (id: string, completedAt: string, overrides: Partial<SavedRun> = {}): SavedRun & { measurement: ReturnType<typeof buildMeasurementScope> } => ({ id, ...input, results: [answer()], errors: [], totalCostUsd: 0, completedAt, measurement: buildMeasurementScope(input), ...overrides });

test("scope captures only requested identities, classification, market and collection contract", () => {
  const record = { ...createPromptRecord(input.prompts[0], input), id: "stable-id", kind: "branded" as const, paused: true };
  const scope = buildMeasurementScope(input, [record, createPromptRecord("Not requested", input)]);
  assert.deepEqual(scope.prompts, [{ id: "stable-id", text: input.prompts[0], kind: "branded" }]);
  assert.equal(scope.collectors[0].provider, "cloro");
  assert.deepEqual(scope.market, { country: "US", language: "en" });
  assert.equal(validateMeasurementScope(scope), true);
  assert.equal(JSON.stringify(scope).includes("token"), false);
});
test("fair cohorts include identity, exact wording, brand, market and collector model, ignoring array order", () => {
  const scope = buildMeasurementScope({ ...input, prompts: ["A?", "B?"], engines: ["chatgpt", "perplexity"] });
  const key = measurementScopeKey(scope);
  assert.equal(measurementScopeKey({ ...scope, prompts: [...scope.prompts].reverse(), collectors: [...scope.collectors].reverse() }), key);
  const changed = [
    { ...scope, prompts: [{ ...scope.prompts[0], id: "changed" }, scope.prompts[1]] },
    { ...scope, prompts: [{ ...scope.prompts[0], text: "A rewritten?" }, scope.prompts[1]] },
    { ...scope, brand: { ...scope.brand, name: "Other brand" } },
    { ...scope, collectors: [{ ...scope.collectors[0], model: "new-model" }, scope.collectors[1]] },
    { ...scope, collectors: [{ ...scope.collectors[0], provider: "new-provider" }, scope.collectors[1]] },
  ];
  for (const other of changed) assert.notEqual(measurementScopeKey(other), key);
});
test("coverage counts unique successful requested pairs; failures, empty and unrequested answers are not absence", () => {
  const scopeInput = { ...input, prompts: ["Best toolkit?", "Other question?"] };
  const sample = { ...run("one", "2026-10-20T12:00:00Z"), measurement: buildMeasurementScope(scopeInput), results: [answer(), answer({ id: "duplicate" }), answer({ id: "empty", prompt: "Other question?", answer: " " }), answer({ id: "unrequested", prompt: "Unrequested?" })] };
  const measured = measureRun(sample);
  assert.equal(measured.requested, 2);
  assert.equal(measured.answered, 1);
  assert.equal(measured.coverage, 0.5);
  assert.equal(measured.mentionRate, 100);
  assert.equal(measured.citationRate, 100);
  assert.equal(measured.comparable, false);
  assert.equal(measureRun({ ...sample, results: [] }).mentionRate, null);
  assert.equal(measureRun({ ...sample, results: [answer({ provider: "other" })] }).answered, 0);
});
test("coverage comparison threshold is explicit at ninety percent", () => {
  const inputs = { ...input, prompts: ["p1", "p2", "p3", "p4", "p5"], engines: ["chatgpt", "gemini"] as AuditInput["engines"] };
  const scope = buildMeasurementScope(inputs);
  const results = inputs.prompts.flatMap((prompt) => inputs.engines.map((engine) => answer({ prompt, engine })));
  const sample = { ...run("one", "2026-10-20T12:00:00Z"), measurement: scope, results: results.slice(0, 9) };
  assert.equal(measureRun(sample).coverage, 0.9);
  assert.equal(measureRun(sample).comparable, true);
  assert.equal(measureRun({ ...sample, results: results.slice(0, 8) }).comparable, false);
});
test("trends use one latest finished run per UTC day and suppress changed-scope or low-coverage deltas", () => {
  const first = run("first", "2026-10-18T10:00:00Z", { results: [answer({ brandMentioned: false, citations: [] })] });
  const repeated = run("repeat", "2026-10-18T18:00:00Z");
  const latest = run("latest", "2026-10-20T12:00:00Z", { results: [answer({ brandMentioned: false, citations: [] })] });
  const trend = comparableTrend([latest, first, repeated], input);
  assert.equal(trend.points.length, 2);
  assert.equal(trend.points[0].run.id, "repeat");
  assert.deepEqual(trend.delta, { mentions: -100, citations: -100 });
  assert.equal(comparableTrend([first, { ...latest, results: [] }], input).delta, null);
  const changed = { ...latest, measurement: buildMeasurementScope({ ...input, prompts: ["Changed question?"] }) };
  const other = comparableTrend([first, changed], input);
  assert.equal(other.points.length, 1);
  assert.equal(other.excluded, 1);
  assert.equal(other.delta, null);
});
test("neutral and branded rates remain separate and legacy observations never claim a measured delta", () => {
  const scoped = { ...input, prompts: ["Best toolkit?", "Is Treg suitable?"] };
  const first = { ...run("one", "2026-10-18T12:00:00Z"), measurement: buildMeasurementScope(scoped), results: [answer({ brandMentioned: false }), answer({ id: "b", prompt: scoped.prompts[1] })] };
  assert.equal(measureRun(first, { kind: "neutral" }).mentionRate, 0);
  assert.equal(measureRun(first, { kind: "branded" }).mentionRate, 100);
  const { measurement: _ignored, ...legacy } = first;
  void _ignored;
  assert.equal(measureRun(legacy).recorded, false);
  assert.equal(comparableTrend([legacy, { ...legacy, id: "two", completedAt: "2026-10-20T12:00:00Z" }], input).delta, null);
});
test("scope import projection strips arbitrary fields and rejects malformed contracts", () => {
  const scope = buildMeasurementScope(input);
  assert.equal(validateMeasurementScope({ ...scope, prompts: [scope.prompts[0], scope.prompts[0]] }), false);
  assert.equal(validateMeasurementScope({ ...scope, prompts: [scope.prompts[0], { ...scope.prompts[0], id: "other-id" }] }), false);
  assert.equal(validateMeasurementScope({ ...scope, collectors: [{ ...scope.collectors[0], model: "" }] }), false);
  assert.equal(validateMeasurementScope({ ...scope, market: { country: "GB", language: "en" } }), false);
  assert.deepEqual(cleanMeasurementScope({ ...scope, token: "secret" } as typeof scope), scope);
});

test("competitor lines require configured historical identity and never turn unknown or changed identities into zeroes", async () => {
  const { competitorMeasurementIdentity, competitorMentionRate } = await import("./measurement");
  const current = measureRun({ ...run("current", "2026-10-20T12:00:00Z"), competitorDetails: [{ name: "Composio", domain: "composio.dev" }], results: [answer({ mentionedBrands: ["Treg", "Composio"] })] });
  const earlier = run("earlier", "2026-10-19T12:00:00Z");
  assert.equal(competitorMeasurementIdentity(current.run, "Composio"), JSON.stringify(["composio", "composio.dev"]));
  assert.equal(competitorMentionRate(current, current, "Composio"), 100);
  assert.equal(competitorMentionRate(measureRun({ ...earlier, competitors: [] }), current, "Composio"), null);
  assert.equal(competitorMentionRate(measureRun(earlier), current, "Composio"), null);
  assert.equal(competitorMentionRate(measureRun({ ...earlier, competitorDetails: [{ name: "Composio", domain: "old-domain.dev" }] }), current, "Composio"), null);
  assert.equal(competitorMentionRate(measureRun({ ...earlier, competitorDetails: [{ name: "Composio", domain: "www.composio.dev" }] }), current, "Composio"), 0);
  assert.equal(competitorMentionRate(measureRun({ ...earlier, competitorDetails: [{ name: "Composio New", domain: "composio.dev" }], competitors: ["Composio New"] }), current, "Composio"), null);
  assert.equal(competitorMentionRate(current, current, "New competitor"), null);
});

test("offset timestamps use actual completion time and UTC day boundaries for latest daily samples", () => {
  const previousUtcDay = run("previous-utc-day", "2026-10-20T00:30:00+02:00", { results: [answer({ brandMentioned: false, citations: [] })] });
  const earlierSameUtcDay = run("earlier-utc-day", "2026-10-20T06:00:00+02:00", { results: [answer({ brandMentioned: false, citations: [] })] });
  const latestActual = run("latest-actual", "2026-10-20T00:30:00-05:00", { results: [answer()] });
  const trend = comparableTrend([latestActual, previousUtcDay, earlierSameUtcDay], input);
  assert.equal(trend.latest?.run.id, "latest-actual");
  assert.deepEqual(trend.points.map((point) => point.run.id), ["previous-utc-day", "latest-actual"]);
  assert.equal(new Date(trend.points[0].run.completedAt).toISOString().slice(0, 10), "2026-10-19");
  assert.deepEqual(trend.delta, { mentions: 100, citations: 100 });
});

test("duplicate answers choose the latest actual completion instant rather than lexical offset text", () => {
  const sample = run("offset-answers", "2026-10-20T12:00:00Z", { results: [
    answer({ id: "lexically-later", completedAt: "2026-10-20T06:00:00+02:00", brandMentioned: false, citations: [] }),
    answer({ id: "actually-later", completedAt: "2026-10-20T00:30:00-05:00" }),
  ] });
  assert.equal(measureRun(sample).answers[0].id, "actually-later");
  assert.equal(measureRun(sample).mentionRate, 100);
});

test("engine and question-type filters select the latest requested run while preserving failed requested baselines", () => {
  const neutralInput = { ...input, engines: ["gemini"] as AuditInput["engines"] };
  const neutralGemini = run("older-requested-gemini", "2026-10-18T12:00:00Z", {
    engines: neutralInput.engines, measurement: buildMeasurementScope(neutralInput), results: [answer({ engine: "gemini" })],
  });
  const brandedInput = { ...input, prompts: ["Is Treg useful?"] };
  const newerChatGPT = run("newer-narrow-chatgpt", "2026-10-20T12:00:00Z", {
    prompts: brandedInput.prompts, measurement: buildMeasurementScope(brandedInput), results: [answer({ prompt: brandedInput.prompts[0] })],
  });
  const history = [neutralGemini, newerChatGPT];
  assert.equal(comparableTrend(history, input, { engine: "gemini" }).latest?.run.id, "older-requested-gemini");
  assert.equal(comparableTrend(history, input, { kind: "neutral" }).latest?.run.id, "older-requested-gemini");
  assert.equal(comparableTrend(history, input, { kind: "branded" }).latest?.run.id, "newer-narrow-chatgpt");
  assert.equal(comparableTrend(history, input, { engine: "google" }).latest, undefined);
  const failedGemini = { ...neutralGemini, id: "latest-failed-gemini", completedAt: "2026-10-21T12:00:00Z", results: [],
    errors: [{ prompt: input.prompts[0], engine: "gemini", error: "No answer returned" }] };
  const failed = comparableTrend([...history, failedGemini], input, { engine: "gemini", kind: "neutral" });
  assert.equal(failed.latest?.run.id, "latest-failed-gemini");
  assert.equal(failed.latest?.requested, 1);
  assert.equal(failed.latest?.answered, 0);
  assert.equal(failed.delta, null);
});
