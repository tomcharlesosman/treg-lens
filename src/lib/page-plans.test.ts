import assert from "node:assert/strict";
import test from "node:test";
import type { AnswerResult, AuditInput } from "./aeo";
import { buildMeasurementScope } from "./measurement";
import { buildPagePlanFollowup, compareEvidenceRuns, comparePagePlanRuns, createPagePlan, MAX_PAGE_PLANS, pagePlanMatchesProject, pagePlanOpportunities, parsePagePlans } from "./page-plans";
import type { SavedRun } from "./workspace-data";
import { sanitizeWorkspaceSnapshot } from "./workspace-validation";

const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Best toolkit?"], engines: ["chatgpt"] };
const answer = (overrides: Partial<AnswerResult> = {}): AnswerResult => ({ id: "a", prompt: "Best toolkit?", engine: "chatgpt", answer: "Composio is suitable.", citations: [], mentionedBrands: ["Composio"], brandMentioned: false, position: null, costUsd: 0.02, costKnown: true, completedAt: "2026-10-20T12:00:00Z", provider: "cloro", sourceKind: "web-interface", ...overrides });
const run = (id = "baseline", completedAt = "2026-10-20T12:00:00Z", overrides: Partial<SavedRun> = {}): SavedRun => ({ id, ...input, results: [answer()], errors: [], totalCostUsd: 0.02, totalCostKnown: true, completedAt, measurement: buildMeasurementScope(input), competitorDetails: [{ name: "Composio", domain: "composio.dev" }], ...overrides });
const plan = () => createPagePlan({ id: "plan-one", opportunity: pagePlanOpportunities([run()], input)[0], now: "2026-10-20T13:00:00Z" });

test("opportunities separate actual competitor gaps from brand absence and website citations", () => {
  const observed = run();
  const actual = pagePlanOpportunities([observed], input)[0];
  assert.equal(actual.absent, 1); assert.equal(actual.competitorMentions, 1); assert.equal(actual.competitorCitations, 0);
  assert.match(actual.reason, /configured competitor/);
  const noCompetitor = pagePlanOpportunities([{ ...observed, results: [answer({ mentionedBrands: ["Unconfigured"] })] }], input)[0];
  assert.equal(noCompetitor.competitorMentions, 0); assert.match(noCompetitor.reason, /does not establish a content gap/);
  const domain = pagePlanOpportunities([{ ...observed, results: [answer({ mentionedBrands: [], citations: [{ url: "https://docs.composio.dev/a", domain: "docs.composio.dev", title: "Docs" }] })] }], input)[0];
  assert.equal(domain.competitorMentions, 0); assert.equal(domain.competitorCitations, 1);
  assert.equal(pagePlanOpportunities([{ ...observed, competitorDetails: [], results: domain.answers }], input)[0].competitorCitations, 0);
});

test("opportunities use the latest requested evidence and never pool repeated or blank checks", () => {
  const previous = run();
  const latest = run("latest", "2026-10-21T12:00:00Z", { results: [answer({ id: "empty", answer: " " })] });
  const opportunity = pagePlanOpportunities([previous, latest, run("other", undefined, { brand: "Other" })], input)[0];
  assert.equal(opportunity.runId, "latest"); assert.equal(opportunity.answered, 0); assert.equal(opportunity.absent, 0); assert.equal(opportunity.coverage, 0);
  assert.match(opportunity.reason, /missing answers are not brand absence/);
  const duplicates = pagePlanOpportunities([{ ...previous, results: [answer(), answer({ id: "newer", brandMentioned: true, completedAt: "2026-10-20T13:00:00Z" })] }], input)[0];
  assert.equal(duplicates.answered, 1); assert.equal(duplicates.absent, 0);
});

test("plans retain exact baseline identity and evidence-specific editable brief", () => {
  const value = plan();
  assert.equal(value.baselineRunId, "baseline"); assert.equal(value.question.text, "Best toolkit?");
  assert.equal(value.baselineMeasurement?.prompts[0].id, value.question.id);
  assert.match(value.brief, /audit baseline/); assert.match(value.brief, /Composio|configured competitor/);
  assert.deepEqual(parsePagePlans([value]), [value]);
  assert.equal(pagePlanMatchesProject(value, { brand: "treg", domain: "www.treg.to" }), true);
  assert.equal(pagePlanMatchesProject(value, { brand: "Treg", domain: "other.dev" }), false);
});

test("same-scope follow-ups compare separate saved audits including UTC offset dates", () => {
  const before = run();
  const after = run("followup", "2026-10-21T00:30:00-05:00", { results: [answer({ brandMentioned: true, citations: [{ url: "https://docs.treg.to/a", domain: "docs.treg.to", title: "Docs" }] })] });
  const comparison = compareEvidenceRuns(before, after);
  assert.equal(comparison.comparable, true); assert.deepEqual(comparison.delta, { mentions: 100, citations: 100 });
  assert.equal(compareEvidenceRuns(before, before).delta, null);
  assert.equal(compareEvidenceRuns(after, before).delta, null);
});

test("comparison suppresses changed scope, missing answers, legacy settings and competitor identity changes", () => {
  const before = run(); const after = run("followup", "2026-10-21T12:00:00Z");
  const changes: Partial<SavedRun>[] = [
    { measurement: undefined }, { measurement: buildMeasurementScope({ ...input, prompts: ["Rewritten question?"] }) },
    { results: [] }, { competitors: ["Other"] }, { competitorDetails: [{ name: "Composio", domain: "different.dev" }] },
  ];
  for (const change of changes) { const result = compareEvidenceRuns(before, { ...after, ...change }); assert.equal(result.delta, null); assert(result.reasons.length); }
});

test("plan comparison refuses missing evidence, edited frozen scope and pre-publication follow-ups", () => {
  const before = run(); const after = run("followup", "2026-10-21T12:00:00Z"); const value = { ...plan(), followupRunId: after.id };
  assert.equal(comparePagePlanRuns(value, [before, after]).comparable, true);
  assert.equal(comparePagePlanRuns(value, [after]).delta, null);
  assert.equal(comparePagePlanRuns({ ...value, baselineMeasurement: undefined }, [before, after]).delta, null);
  assert.match(comparePagePlanRuns({ ...value, publishedAt: "2026-10-22" }, [before, after]).reasons.join(" "), /before.*publication/);
  assert.equal(comparePagePlanRuns({ ...value, publishedAt: "2026-10-20" }, [before, after]).comparable, true);
});

test("follow-up reconstruction uses original questions, classifications, competitors and domains", () => {
  const before = run(); before.measurement!.prompts[0].id = "original-id"; before.measurement!.prompts[0].kind = "branded";
  const value = createPagePlan({ id: "plan", opportunity: pagePlanOpportunities([before], input)[0] });
  const restored = buildPagePlanFollowup(value, [before]);
  assert.deepEqual(restored.input, { ...input, market: { country: "US", language: "en" } });
  assert.equal(restored.promptRecords[0].id, "original-id"); assert.equal(restored.promptRecords[0].kind, "branded");
  assert.deepEqual(restored.competitorDetails, before.competitorDetails);
  assert.equal("token" in restored.input, false);
});

test("follow-up fails closed for missing baseline, legacy settings or substituted collectors", () => {
  const value = plan(); const before = run();
  assert.throws(() => buildPagePlanFollowup(value, []), /unavailable/);
  assert.throws(() => buildPagePlanFollowup({ ...value, baselineMeasurement: undefined }, [before]), /recorded/);
  assert.throws(() => buildPagePlanFollowup(value, [{ ...before, brand: "Other" }]), /unavailable/);
  const changed = structuredClone(value); changed.baselineMeasurement!.collectors[0].model = "future-model";
  assert.throws(() => buildPagePlanFollowup(changed, [before]), /matching/);
  assert.throws(() => buildPagePlanFollowup(changed, [{ ...before, measurement: changed.baselineMeasurement }]), /no longer supported/);
});

test("plan parser bounds storage, validates owned target URLs, and strips unknown nested fields", () => {
  const value = plan();
  const injected = { ...value, token: "secret", brand: { ...value.brand, token: "secret" }, target: { kind: "existing", url: "https://treg.to/guide", token: "secret" } };
  const cleaned = parsePagePlans([injected]); assert(cleaned); assert.equal(JSON.stringify(cleaned).includes("secret"), false);
  for (const mutation of [
    { target: { kind: "existing" } }, { target: { kind: "existing", url: "https://other.dev/guide" } },
    { target: { kind: "existing", url: "https://treg.to.evil.dev/guide" } }, { target: { kind: "existing", url: "https://user:secret@treg.to/guide" } },
    { target: { kind: "later", url: "https://treg.to/guide" } }, { status: "measured" }, { brief: "x".repeat(12001) },
    { updatedAt: "2026-10-19" }, { publishedAt: "not a date" }, { followupRunId: value.baselineRunId },
  ]) assert.equal(parsePagePlans([{ ...value, ...mutation }]), null);
  assert.equal(parsePagePlans([value, value]), null);
  assert.equal(parsePagePlans(Array.from({ length: MAX_PAGE_PLANS + 1 }, (_, i) => ({ ...value, id: String(i) }))), null);
});

test("strategy and plans survive full snapshot sanitation without changing old snapshots", () => {
  const snapshot = { project: { ...input, strategy: { goal: "Improve reviewed answers", keyPages: ["https://treg.to/aeo"], token: "secret" } }, prompts: input.prompts, runs: [run()], done: [], sourceResearch: {}, pagePlans: [plan()] };
  const cleaned = sanitizeWorkspaceSnapshot(snapshot);
  assert.equal(cleaned.pagePlans?.[0].id, "plan-one"); assert.equal(JSON.stringify(cleaned.project.strategy).includes("secret"), false);
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...snapshot, project: { ...snapshot.project, strategy: { keyPages: ["https://other.dev"] } } }));
  const legacy = sanitizeWorkspaceSnapshot({ project: input, prompts: input.prompts, runs: [], done: [], sourceResearch: {} });
  assert.equal(legacy.pagePlans, undefined); assert.equal(legacy.project.strategy, undefined);
});
