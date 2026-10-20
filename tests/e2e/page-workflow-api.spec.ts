import { expect, test, type APIRequestContext } from "@playwright/test";
import { buildMeasurementScope } from "../../src/lib/measurement";
import { createPagePlan, pagePlanOpportunities } from "../../src/lib/page-plans";
import { createPromptRecord } from "../../src/lib/prompt-library";
import type { AuditInput } from "../../src/lib/aeo";
import type { SavedRun } from "../../src/lib/workspace-data";
import { createEvidenceReport, MAX_REPORT_BYTES } from "../../src/lib/evidence-reports";

const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Which toolkit should an agency use?"], engines: ["chatgpt"] };
const project = { ...input, competitorDetails: [{ name: "Composio", domain: "composio.dev" }], onboardingCompletedAt: "2026-10-18T10:00:00Z" };
const headers = (cookie: string) => ({ cookie, "x-forwarded-for": crypto.randomUUID() });
async function login(request: APIRequestContext) {
  const token = `treg-e2e-page-workflow-${crypto.randomUUID()}`;
  const response = await request.post("/api/auth/session", { data: { token }, headers: headers("") });
  expect(response.status(), await response.text()).toBe(200);
  return { token, cookie: response.headers()["set-cookie"].split(";")[0] };
}
function fixture() {
  const record = { ...createPromptRecord(input.prompts[0], project), id: "original-question" };
  const baseline: SavedRun = { id: "original-audit", ...input, competitorDetails: project.competitorDetails,
    measurement: buildMeasurementScope(input, [record]), completedAt: "2026-10-18T10:00:00Z", totalCostUsd: 0.002, totalCostKnown: true, errors: [],
    results: [{ id: "original-answer", prompt: input.prompts[0], engine: "chatgpt", answer: "Composio offers integrations.",
      citations: [{ url: "https://composio.dev/docs", title: "Competitor documentation", domain: "composio.dev" }],
      mentionedBrands: ["Composio"], brandMentioned: false, position: null, costUsd: 0.002, costKnown: true,
      sourceKind: "web-interface", provider: "cloro", completedAt: "2026-10-18T10:00:00Z" }],
  };
  const plan = createPagePlan({ id: "saved-page-plan", opportunity: pagePlanOpportunities([baseline], project)[0], now: "2026-10-19T10:00:00Z" });
  return { project, prompts: input.prompts, promptRecords: [record], runs: [baseline], done: ["Legacy completion kept"], sourceResearch: {}, pagePlans: [plan] };
}
async function setup(request: APIRequestContext) {
  const user = await login(request);
  const snapshot = fixture();
  const saved = await request.put("/api/workspace", { data: { snapshot, revision: 0 }, headers: headers(user.cookie) });
  expect(saved.status(), await saved.text()).toBe(200);
  return { ...user, saved: await saved.json(), snapshot, body: { ...input, followupPlanId: snapshot.pagePlans[0].id, followupPlanUpdatedAt: snapshot.pagePlans[0].updatedAt } };
}

test("a quoted follow-up preserves original question and competitor scope, appends evidence and links only the reviewed plan", async ({ request }) => {
  const user = await setup(request);
  const edited = structuredClone(user.saved.snapshot);
  edited.project.competitors = ["Another competitor"];
  edited.project.competitorDetails = [{ name: "Another competitor", domain: "different-example.com" }];
  edited.promptRecords[0].id = "current-question-identity";
  edited.promptRecords[0].kind = "branded";
  const change = await request.put("/api/workspace", { data: { snapshot: edited, revision: user.saved.revision }, headers: headers(user.cookie) });
  expect(change.status(), await change.text()).toBe(200);
  const quote = await request.post("/api/aeo/estimate", { data: user.body, headers: headers(user.cookie) });
  expect(quote.status(), await quote.text()).toBe(200);
  const beforeRun = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(beforeRun.snapshot.runs).toHaveLength(1);
  expect(beforeRun.snapshot.pagePlans[0].followupRunId).toBeUndefined();
  const unapproved = await request.post("/api/aeo/run", { data: user.body, headers: headers(user.cookie) });
  expect(unapproved.status()).toBe(409);
  const response = await request.post("/api/aeo/run", { data: { ...user.body, maxCostUsd: (await quote.json()).totalCostUsd }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const result = await response.json();
  expect(result.saved).toBe(true);
  expect(result.measurement).toEqual(user.snapshot.runs[0].measurement);
  expect(result.competitorDetails).toEqual(project.competitorDetails);
  const after = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(after.snapshot.runs).toHaveLength(2);
  expect(after.snapshot.project).toEqual(beforeRun.snapshot.project);
  expect(after.snapshot.promptRecords).toEqual(beforeRun.snapshot.promptRecords);
  expect(after.snapshot.pagePlans[0]).toMatchObject({ followupRunId: result.auditId, status: "planned" });
  expect(after.snapshot.done).toEqual(user.snapshot.done);
  expect(JSON.stringify(after)).not.toContain(user.token);
  expect((await (await request.get("/api/monitor", { headers: headers(user.cookie) })).json()).schedule).toBeNull();
});

test("follow-up endpoints refuse another workspace's plan, stale versions and changed paid scope", async ({ request }) => {
  const user = await setup(request);
  const other = await login(request);
  for (const route of ["estimate", "run"]) {
    const isolated = await request.post(`/api/aeo/${route}`, { data: user.body, headers: headers(other.cookie) });
    expect(isolated.status(), await isolated.text()).toBe(404);
    for (const change of [
      { followupPlanUpdatedAt: "2026-10-18T10:00:00Z" },
      { prompts: ["A different paid question?"] },
      { engines: ["perplexity"] },
      { competitors: ["Unreviewed competitor"] },
      { domain: "different.example" },
    ]) {
      const response = await request.post(`/api/aeo/${route}`, { data: { ...user.body, ...change }, headers: headers(user.cookie) });
      expect(response.status(), await response.text()).toBe(409);
    }
  }
  const after = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(after).toEqual(user.saved);
  expect((await (await request.get("/api/workspace", { headers: headers(other.cookie) })).json()).snapshot).toBeNull();
});

test("legacy, deleted and unsupported baseline collectors cannot silently buy a substituted follow-up", async ({ request }) => {
  for (const mode of ["legacy", "deleted", "unsupported"] as const) {
    const user = await setup(request);
    const snapshot = structuredClone(user.saved.snapshot);
    if (mode === "legacy") { delete snapshot.runs[0].measurement; delete snapshot.pagePlans[0].baselineMeasurement; }
    if (mode === "deleted") snapshot.runs = [];
    if (mode === "unsupported") {
      snapshot.runs[0].measurement.collectors[0].model = "retired-pinned-model";
      snapshot.pagePlans[0].baselineMeasurement.collectors[0].model = "retired-pinned-model";
    }
    const save = await request.put("/api/workspace", { data: { snapshot, revision: user.saved.revision }, headers: headers(user.cookie) });
    expect(save.status(), await save.text()).toBe(200);
    for (const route of ["estimate", "run"]) {
      const response = await request.post(`/api/aeo/${route}`, { data: user.body, headers: headers(user.cookie) });
      expect(response.status(), await response.text()).toBe(409);
    }
    const after = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
    expect(after.revision).toBe(user.saved.revision + 1);
    expect(after.snapshot.runs).toHaveLength(mode === "deleted" ? 0 : 1);
  }
});

test("page plans preserve CAS and reject invalid owned pages and malformed follow-up references", async ({ request }) => {
  const user = await setup(request);
  const changed = structuredClone(user.saved.snapshot);
  changed.pagePlans[0].rationale = "A deliberate later edit.";
  const response = await request.put("/api/workspace", { data: { snapshot: changed, revision: user.saved.revision }, headers: headers(user.cookie) });
  expect(response.status()).toBe(200);
  const stale = await request.put("/api/workspace", { data: { snapshot: user.snapshot, revision: user.saved.revision }, headers: headers(user.cookie) });
  expect(stale.status()).toBe(409);
  const version = (await response.json()).revision;
  for (const url of ["https://unrelated.example/page", "javascript:alert(1)", "http://127.0.0.1/private"]) {
    changed.pagePlans[0].target = { kind: "existing", url };
    expect((await request.put("/api/workspace", { data: { snapshot: changed, revision: version }, headers: headers(user.cookie) })).status()).toBe(400);
  }
  for (const fields of [{ followupPlanUpdatedAt: undefined }, { followupPlanId: "" }, { followupPlanUpdatedAt: "invalid" }]) {
    expect((await request.post("/api/aeo/estimate", { data: { ...user.body, ...fields }, headers: headers(user.cookie) })).status()).toBe(400);
  }
});

test("reports are immutable private snapshots, preserve exact evidence and strip unknown credential fields", async ({ request }) => {
  const user = await setup(request);
  const report = createEvidenceReport({ id: "saved-report", title: "Evidence review", project, runs: user.snapshot.runs, plans: user.snapshot.pagePlans });
  const contaminated = { ...report, token: "PRIVATE-KEY", project: { ...report.project, credentials: { apiKey: "PRIVATE-KEY" } },
    runs: report.runs.map((run) => ({ ...run, authorization: "PRIVATE-KEY", results: run.results.map((answer) => ({ ...answer, token: "PRIVATE-KEY" })) })) };
  const response = await request.put("/api/workspace", { data: { snapshot: { ...user.snapshot, reports: [contaminated] }, revision: user.saved.revision }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const saved = await response.json();
  expect(saved.snapshot.reports).toEqual([report]);
  expect(JSON.stringify(saved)).not.toContain("PRIVATE-KEY");
  const changed = structuredClone(saved.snapshot);
  changed.reports[0].runs[0].results[0].answer = "A revised answer must not rewrite a saved report.";
  const rejected = await request.put("/api/workspace", { data: { snapshot: changed, revision: saved.revision }, headers: headers(user.cookie) });
  expect(rejected.status(), await rejected.text()).toBe(400);
  expect((await rejected.json()).error).toContain("immutable");
  const withoutSources = { ...saved.snapshot, project: { brand: "New brand", domain: "new.example", competitors: [] }, runs: [], pagePlans: [] };
  const removed = await request.put("/api/workspace", { data: { snapshot: withoutSources, revision: saved.revision }, headers: headers(user.cookie) });
  expect(removed.status()).toBe(200);
  expect((await removed.json()).snapshot.reports).toEqual([report]);
  const other = await login(request);
  expect((await (await request.get("/api/workspace", { headers: headers(other.cookie) })).json()).snapshot).toBeNull();
});

test("bounded report imports refuse oversized, cross-brand and excess snapshots without changing saved work", async ({ request }) => {
  const user = await setup(request);
  const report = createEvidenceReport({ id: "bounded-report", project, runs: user.snapshot.runs });
  const oversized = structuredClone(report);
  oversized.runs[0].results[0].answer = "x".repeat(MAX_REPORT_BYTES);
  const crossBrand = structuredClone(report);
  crossBrand.runs[0].brand = "Another brand";
  for (const reports of [[oversized], [crossBrand], Array.from({ length: 11 }, (_, i) => ({ ...report, id: `excess-${i}` }))]) {
    const response = await request.put("/api/workspace", { data: { snapshot: { ...user.snapshot, reports }, revision: user.saved.revision }, headers: headers(user.cookie) });
    expect(response.status(), await response.text()).toBe(400);
  }
  expect(await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json()).toEqual(user.saved);
});
