import assert from "node:assert/strict";
import test from "node:test";
import { buildMeasurementScope } from "./measurement";
import { createPagePlan, pagePlanOpportunities } from "./page-plans";
import { createEvidenceReport } from "./evidence-reports";
import { deriveWorkspaceContinuity, MAX_DISMISSED_STEPS, MAX_RECENT_WORK, parseContinuityPreferences, setStepDismissed } from "./workspace-continuity";
import { parseWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace-storage";
import { sanitizeWorkspaceSnapshot } from "./workspace-validation";
import type { SavedRun } from "./workspace-data";
import type { AuditInput } from "./aeo";
import type { SavedDiscovery } from "./discovery-research";

const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Best toolkit?"], engines: ["chatgpt"] };
const run = (id = "baseline", date = "2026-10-18T12:00:00Z"): SavedRun => ({ ...input, id, measurement: buildMeasurementScope(input), completedAt: date, totalCostUsd: .02, totalCostKnown: true, errors: [], results: [{ id: `${id}-answer`, prompt: input.prompts[0], engine: "chatgpt", answer: "Composio offers integrations.", citations: [], mentionedBrands: ["Composio"], brandMentioned: false, position: null, costUsd: .02, costKnown: true, completedAt: date }] });
const fixture = (runs: SavedRun[] = []): WorkspaceSnapshot => ({ project: { ...input }, prompts: input.prompts, runs, done: [], sourceResearch: {} });
const plan = () => createPagePlan({ id: "plan-one", opportunity: pagePlanOpportunities([run()], input)[0], now: "2026-10-19T12:00:00Z" });

test("first action reviews audit scope without inventing saved activity", () => {
  const value = fixture(); const original = JSON.stringify(value);
  const result = deriveWorkspaceContinuity(value);
  assert.equal(result.steps[0].action.kind, "audit"); assert.deepEqual(result.recent, []);
  assert.match(result.steps[0].detail, /separate approval/); assert.equal(JSON.stringify(value), original);
});
test("latest missing answers and unknown costs precede any new audit recommendation", () => {
  const value = fixture([{ ...run(), results: [], totalCostKnown: false, errors: [{ prompt: input.prompts[0], engine: "chatgpt", error: "Interrupted" }] }]);
  const result = deriveWorkspaceContinuity(value);
  assert.equal(result.steps[0].action.kind, "run"); assert.match(result.steps[0].detail, /Billing is unknown/);
  assert.match(result.steps[0].detail, /Missing answers are not brand absence/);
  assert.equal(result.steps[1].action.kind, "audit"); assert.match(result.recent[0].detail, /0\/1.*Billing unknown/);
});
test("observed gap leads to a decision; all-present answers do not lead to empty opportunities", () => {
  assert.equal(deriveWorkspaceContinuity(fixture([run()])).steps[0].action.kind, "plans");
  const present = run(); present.results[0].brandMentioned = true;
  assert.deepEqual(deriveWorkspaceContinuity(fixture([present])).steps, []);
});
test("new successful audits cannot settle retained unknown or legacy billing", () => {
  const legacy = run("legacy"); delete legacy.totalCostKnown;
  const pending = { ...run("pending", "2026-10-19T12:00:00Z"), totalCostKnown: false };
  const value = fixture([legacy, pending, run("known", "2026-10-20T12:00:00Z")]);
  const result = deriveWorkspaceContinuity(value);
  assert.deepEqual(result.steps.slice(0, 2).map((step) => step.id), ["review-run:pending", "review-run:legacy"]);
  assert.match(result.recent.find((item) => item.id === "run:legacy")!.detail, /Billing unknown/);
  value.continuity = setStepDismissed(value, "review-run:pending");
  assert.equal(deriveWorkspaceContinuity(value).steps[0].id, "review-run:legacy");
});
test("drafts resume, owner-reported publication prompts review, and no click marks measured", () => {
  const value = { ...fixture([run()]), pagePlans: [plan()] };
  assert.match(deriveWorkspaceContinuity(value).steps[0].title, /Continue/);
  value.pagePlans[0].status = "published"; value.pagePlans[0].publishedAt = "2026-10-19";
  const result = deriveWorkspaceContinuity(value);
  assert.match(result.steps[0].title, /follow-up measurement/); assert.match(result.steps[0].detail, /owner-reported/);
  assert.deepEqual(result.steps[0].action, { kind: "plan", id: "plan-one" });
  assert.equal(value.pagePlans[0].status, "published");
});
test("compatible evidence must be reviewed before a measured plan is ready for a report", () => {
  const value = { ...fixture([run(), run("followup", "2026-10-20T12:00:00Z")]), pagePlans: [{ ...plan(), followupRunId: "followup", publishedAt: "2026-10-19" }] };
  assert.match(deriveWorkspaceContinuity(value).steps[0].title, /Review the follow-up comparison/);
  value.pagePlans[0].status = "measured";
  const result = deriveWorkspaceContinuity(value);
  assert.deepEqual(result.steps[0].action, { kind: "reports", id: "plan-one" });
  const report = createEvidenceReport({ id: "report-one", title: "Measured evidence", project: value.project, runs: value.runs, plans: value.pagePlans, now: "2026-10-21T12:00:00Z" });
  assert(!deriveWorkspaceContinuity({ ...value, reports: [report] }).steps.some((step) => step.action.kind === "reports"));
  value.pagePlans[0].updatedAt = "2026-10-21T13:00:00Z";
  assert(deriveWorkspaceContinuity({ ...value, reports: [report] }).steps.some((step) => step.action.kind === "reports"));
});
test("incompatible, missing and pre-publication followups remain reviewable without a report completion claim", () => {
  for (const mode of ["missing", "legacy", "early"] as const) {
    const later = run("followup", "2026-10-20T12:00:00Z");
    if (mode === "legacy") delete later.measurement;
    const value = { ...fixture(mode === "missing" ? [run()] : [run(), later]), pagePlans: [{ ...plan(), followupRunId: "followup", publishedAt: mode === "early" ? "2026-10-21" : "2026-10-19" }] };
    const result = deriveWorkspaceContinuity(value);
    assert.match(result.steps[0].title, /comparison limits/); assert.match(result.steps[0].detail, /No comparable delta/);
    assert.equal(result.steps[0].action.kind, "plan");
  }
});
test("dismiss and restore are scoped by both brand name and normalized domain", () => {
  const value = fixture(); value.continuity = setStepDismissed(value, "first-audit", "2026-10-21T12:00:00Z");
  assert.equal(deriveWorkspaceContinuity(value).steps.length, 0);
  const alias = { ...value, project: { ...value.project, brand: " treg ", domain: "https://www.treg.to/aeo" } };
  assert.equal(deriveWorkspaceContinuity(alias).steps.length, 0);
  const other = { ...value, project: { ...value.project, domain: "other.example" } };
  other.continuity = setStepDismissed(other, "first-audit");
  value.continuity = setStepDismissed({ ...value, continuity: other.continuity }, null);
  assert.equal(value.continuity.dismissed.length, 1); assert.equal(value.continuity.dismissed[0].brand.domain, "other.example");
  assert.equal(deriveWorkspaceContinuity(value).steps.length, 1);
});
test("a changed plan produces a fresh suggestion without rewriting old dismissals", () => {
  const value = { ...fixture([run()]), pagePlans: [plan()] };
  const hidden = { ...value, continuity: setStepDismissed(value, deriveWorkspaceContinuity(value).steps[0].id) };
  assert(!deriveWorkspaceContinuity(hidden).steps.some((step) => step.action.kind === "plan"));
  hidden.pagePlans[0].updatedAt = "2026-10-20T12:00:00Z";
  assert(deriveWorkspaceContinuity(hidden).steps.some((step) => step.action.kind === "plan"));
});
test("digest is bounded, chronological and deterministic while all original evidence remains", () => {
  const value = fixture(Array.from({ length: 30 }, (_, index) => run(`run-${index}`, new Date(Date.UTC(2026, 9, 1 + index)).toISOString())));
  const result = deriveWorkspaceContinuity(value);
  assert.equal(result.recent.length, MAX_RECENT_WORK); assert.equal(result.recent[0].id, "run:run-29"); assert.equal(value.runs.length, 30);
  assert.deepEqual(deriveWorkspaceContinuity({ ...value, runs: [...value.runs].reverse() }), result);
});
test("same-name brands with other domains and demo reports cannot enter current live activity", () => {
  const other = { ...run("other"), domain: "other.example" };
  const otherPlan = { ...plan(), brand: { name: "Treg", domain: "other.example" } };
  const demo = createEvidenceReport({ id: "demo", title: "Illustrative", project: input, runs: [run()], demo: true });
  const value = { ...fixture([other]), pagePlans: [otherPlan], reports: [demo] };
  assert.deepEqual(deriveWorkspaceContinuity(value).recent, []); assert.equal(deriveWorkspaceContinuity(value).steps[0].action.kind, "audit");
});
test("frozen report activity survives deleting original evidence and does not imply agent execution", () => {
  const report = createEvidenceReport({ id: "retained-report", title: "Prior work", project: input, runs: [run()] });
  const result = deriveWorkspaceContinuity({ ...fixture(), reports: [report] });
  assert.deepEqual(result.recent[0].action, { kind: "report", id: "retained-report" });
  assert.match(result.recent[0].detail, /no agent execution/); assert.equal(result.steps[0].action.kind, "audit");
});
test("optional continuity round-trips in backups, accepts legacy snapshots and strips unknown keys", () => {
  const value = fixture(); const preferences = setStepDismissed(value, "first-audit");
  const contaminated = { ...preferences, token: "secret", dismissed: preferences.dismissed.map((entry) => ({ ...entry, authorization: "secret", brand: { ...entry.brand, token: "secret" } })) };
  const cleaned = sanitizeWorkspaceSnapshot({ ...value, continuity: contaminated });
  assert.deepEqual(cleaned.continuity, preferences); assert(!JSON.stringify(cleaned).includes("secret"));
  assert.deepEqual(parseWorkspaceSnapshot(JSON.stringify(cleaned)), cleaned);
  assert.equal(parseWorkspaceSnapshot(JSON.stringify(value))?.continuity, undefined);
});
test("invalid preferences are rejected rather than silently resetting prior choices", () => {
  const value = fixture(); const pref = setStepDismissed(value, "first-audit");
  for (const continuity of [null, { version: 2, dismissed: [] }, { version: 1, dismissed: [pref.dismissed[0], pref.dismissed[0]] }, { version: 1, dismissed: [{ ...pref.dismissed[0], dismissedAt: "never" }] }, { version: 1, dismissed: Array.from({ length: 129 }, (_, i) => ({ ...pref.dismissed[0], stepId: String(i) })) }]) {
    assert.equal(parseContinuityPreferences(continuity), null); assert.equal(parseWorkspaceSnapshot(JSON.stringify({ ...value, continuity })), null);
  }
});
test("preference growth is bounded and restores only the selected brand", () => {
  const value = fixture();
  for (let index = 0; index < 140; index++) value.continuity = setStepDismissed(value, String(index));
  assert.equal(value.continuity!.dismissed.length, MAX_DISMISSED_STEPS); assert.equal(value.continuity!.dismissed[0].stepId, "12");
  assert.deepEqual(setStepDismissed(value, null).dismissed, []);
});

test("research receipts preserve billing uncertainty, original targets and selection progress", () => {
  const discovery: SavedDiscovery = { id: "discovery-one", input: { brand: "Treg", domain: "treg.to", seeds: ["agent tools", "research data"] }, selectedCandidateIds: [],
    estimate: { currency: "USD", totalCostUsd: .01, maxCalls: 5, pricedAt: "2026-10-20T12:00:00Z", note: "Fixture estimate", breakdown: [] },
    result: { candidates: [{ id: "question-one", text: "Which research toolkit should I choose?", kind: "question", origin: "People Also Ask", seed: "agent tools", keyword: "agent tools", searchVolume: null, provider: "cloro" }], keywordCount: 0, questionCount: 1, totalCostUsd: .002, totalCostKnown: false, reservedCostUsd: .001, callIds: ["fixture-call"], errors: [{ stage: "questions", seed: "agent tools", error: "Pending" }], completedAt: "2026-10-20T12:01:00Z", locale: { country: "US", language: "en" } } };
  const value = { ...fixture([run()]), discoveryResearch: [discovery] };
  let result = deriveWorkspaceContinuity(value);
  assert.equal(result.steps[0].id, "review-discovery:discovery-one");
  assert.deepEqual(result.recent[0].action, { kind: "discovery", id: "discovery-one" });
  assert.match(result.recent[0].detail, /Billing unknown.*Partial results/);
  assert(result.steps.some((step) => step.id === "select-discovery:discovery-one"));
  discovery.selectedCandidateIds = ["question-one"];
  result = deriveWorkspaceContinuity(value);
  assert(!result.steps.some((step) => step.id === "select-discovery:discovery-one"));
  assert.equal(result.steps[0].id, "review-discovery:discovery-one");
  assert.deepEqual(deriveWorkspaceContinuity({ ...value, project: { ...input, domain: "other.example" } }).recent, []);
});

test("onboarding receipts target the original receipt and cannot leak across brand domains", () => {
  const value = fixture();
  value.project.researchReceipts = [{ kind: "research", url: "https://treg.to/", domain: "treg.to", brand: "Treg", description: "Agent toolkit", market: { country: "US", language: "en" }, competitors: [], questions: [], sources: [], totalCostUsd: null, knownCostUsd: 0, costKnown: false, errors: [{ step: "research", error: "Provider pending" }], callIds: ["fixture-call"], completedAt: "2026-10-21T10:00:00Z" }];
  const result = deriveWorkspaceContinuity(value);
  assert.equal(result.steps[0].action.kind, "research");
  assert.deepEqual(result.recent[0].action, { kind: "research", id: "2026-10-21T10:00:00Z:https://treg.to/" });
  assert.match(result.recent[0].detail, /Generated questions remain suggestions/);
  assert.deepEqual(deriveWorkspaceContinuity({ ...value, project: { ...value.project, domain: "other.example" } }).recent, []);
  value.project.researchReceipts.push({ ...value.project.researchReceipts[0], url: `https://treg.to/${"x".repeat(1800)}` });
  const steps = deriveWorkspaceContinuity(value).steps.filter((step) => step.action.kind === "research");
  assert.equal(steps.length, 2); assert.notEqual(steps[0].id, steps[1].id);
  assert(steps.every((step) => step.id.length <= 600));
  value.continuity = setStepDismissed(value, steps[0].id);
  assert.equal(deriveWorkspaceContinuity(value).steps.filter((step) => step.action.kind === "research").length, 1);
});
