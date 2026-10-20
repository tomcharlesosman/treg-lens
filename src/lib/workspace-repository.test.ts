import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { getDatabase } from "./database";
import {
  appendWorkspaceRun, appendWorkspaceDiscovery, getWorkspace, saveWorkspace, sanitizeWorkspaceSnapshot,
  WorkspaceConflictError, WorkspaceValidationError,
} from "./workspace-repository";
import type { Project, SavedRun } from "./workspace-data";
import type { SavedDiscovery } from "./discovery-research";
import { createPagePlan, pagePlanOpportunities } from "./page-plans";
import { createEvidenceReport } from "./evidence-reports";

const directory = mkdtempSync(join(tmpdir(), "treg-workspace-unit-"));
const previous = process.env.TREG_DATA_DIR;
const owner = (letter: string) => `treg_${letter.repeat(24)}`;
const snapshot = () => ({
  project: { brand: "Treg", domain: "treg.to", competitors: ["Composio"] },
  prompts: ["Which toolkit?"], runs: [], done: [], sourceResearch: {},
});
const run = (id: string): SavedRun => ({
  id, brand: "Treg", domain: "treg.to", competitors: ["Composio"],
  prompts: ["Which toolkit?"], engines: ["chatgpt"], results: [],
  errors: [{ prompt: "Which toolkit?", engine: "chatgpt", error: "Provider unavailable" }],
  totalCostUsd: 0, totalCostKnown: true, completedAt: "2026-10-19T12:00:00Z",
});

test("discovery appends coexist with audit appends, preserve profile edits and reject stale snapshots", async () => {
  const id = owner("9");
  const initial = await saveWorkspace(id, snapshot(), 0);
  const receipt: SavedDiscovery = {
    id: "durable-discovery", input: { brand: "Treg", domain: "treg.to", seeds: ["Toolkit", "Research"] },
    estimate: { currency: "USD", totalCostUsd: 0.01, maxCalls: 5, breakdown: [], note: "Fixture", pricedAt: "2026-10-20T12:00:00Z" },
    result: { candidates: [], keywordCount: 0, questionCount: 0, totalCostUsd: 0, totalCostKnown: false, reservedCostUsd: 0.01, errors: [], completedAt: "2026-10-20T12:00:00Z", locale: { country: "US", language: "en" }, callIds: ["call-one"] },
    selectedCandidateIds: [],
  };
  await Promise.all([appendWorkspaceDiscovery(id, receipt), appendWorkspaceRun(id, run("concurrent-audit"))]);
  const saved = await getWorkspace(id);
  assert.deepEqual(saved.snapshot?.project, initial.snapshot?.project);
  assert.equal(saved.snapshot?.runs[0].id, "concurrent-audit");
  assert.deepEqual(saved.snapshot?.discoveryResearch, [receipt]);
  assert.equal(saved.revision, initial.revision + 2);
  assert.deepEqual(await appendWorkspaceDiscovery(id, receipt), saved);
  await assert.rejects(() => saveWorkspace(id, initial.snapshot, initial.revision), WorkspaceConflictError);
});

before(() => { process.env.TREG_DATA_DIR = directory; process.env.TREG_STORAGE = "sqlite"; });
after(() => {
  getDatabase().close();
  if (previous === undefined) delete process.env.TREG_DATA_DIR;
  else process.env.TREG_DATA_DIR = previous;
  rmSync(directory, { recursive: true, force: true });
});

test("SQLite enables durable WAL, a busy timeout and private filesystem permissions", async () => {
  const db = getDatabase();
  assert.equal(getDatabase(), db);
  assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
  assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  if (process.platform !== "win32") {
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(join(directory, "treg-lens.sqlite")).mode & 0o777, 0o600);
  }
});

test("new namespaces are empty and saved snapshots are isolated by owner", async () => {
  assert.deepEqual(await getWorkspace(owner("a")), { snapshot: null, revision: 0, updatedAt: null });
  const saved = await saveWorkspace(owner("a"), snapshot(), 0);
  assert.equal(saved.revision, 1);
  assert.ok(saved.updatedAt);
  assert.deepEqual(await getWorkspace(owner("a")), saved);
  assert.deepEqual(await getWorkspace(owner("b")), { snapshot: null, revision: 0, updatedAt: null });
});

test("optimistic revisions reject stale writes and return current evidence without replacing it", async () => {
  const initial = await saveWorkspace(owner("c"), snapshot(), 0);
  const current = await saveWorkspace(owner("c"), { ...snapshot(), prompts: ["New question"] }, initial.revision);
  await assert.rejects(async () => await saveWorkspace(owner("c"), { ...snapshot(), prompts: ["Stale question"] }, initial.revision), (error) => {
    assert.ok(error instanceof WorkspaceConflictError);
    assert.deepEqual(error.current, current);
    return true;
  });
  assert.deepEqual(await getWorkspace(owner("c")), current);
});

test("snapshot validation discards unknown credential-bearing metadata at every stored layer", async () => {
  const sample = snapshot();
  const sanitized = sanitizeWorkspaceSnapshot({
    ...sample, token: "PRIVATE-KEY", sessionSecret: "PRIVATE-SECRET",
    project: { ...sample.project, token: "PRIVATE-KEY" },
    runs: [{ ...run("sanitized"), token: "PRIVATE-KEY", headers: { "X-Treg-Token": "PRIVATE-KEY" } }],
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /PRIVATE|token|headers|sessionSecret/);
  assert.equal(sanitized.runs[0].id, "sanitized");
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...sample, runs: [{ id: "broken" }] }), WorkspaceValidationError);
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...sample, runs: [run("same"), run("same")] }), WorkspaceValidationError);
  await assert.rejects(async () => await saveWorkspace(owner("d"), sample, -1), WorkspaceValidationError);
  await assert.rejects(async () => await getWorkspace("another-owner"), WorkspaceValidationError);
});

test("append initializes missing workspaces, deduplicates run IDs, and preserves later settings", async () => {
  const first = await appendWorkspaceRun(owner("e"), run("first"));
  assert.deepEqual(first.snapshot?.project, snapshot().project);
  assert.deepEqual(first.snapshot?.prompts, ["Which toolkit?"]);
  assert.equal(first.revision, 1);
  assert.deepEqual(await appendWorkspaceRun(owner("e"), run("first")), first);
  const edited = await saveWorkspace(owner("e"), { ...first.snapshot, project: { brand: "Another brand", domain: "example.com", competitors: [] }, prompts: ["Edited prompt"] }, first.revision);
  const next = await appendWorkspaceRun(owner("e"), run("second"));
  assert.equal(next.revision, edited.revision + 1);
  assert.equal(next.snapshot?.project.brand, "Another brand");
  assert.deepEqual(next.snapshot?.prompts, ["Edited prompt"]);
  assert.deepEqual(next.snapshot?.runs.map((item) => item.id), ["first", "second"]);
  await assert.rejects(async () => await saveWorkspace(owner("e"), edited.snapshot, edited.revision), WorkspaceConflictError);
});

test("failed oversized writes leave the previous transaction intact", async () => {
  const initial = await saveWorkspace(owner("f"), snapshot(), 0);
  await assert.rejects(async () => await saveWorkspace(owner("f"), { ...snapshot(), prompts: ["x".repeat(8 * 1024 * 1024)] }, initial.revision), WorkspaceValidationError);
  assert.deepEqual(await getWorkspace(owner("f")), initial);
});

test("committed snapshots are readable from another Node process", async () => {
  const current = await saveWorkspace(owner("0"), snapshot(), 0);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.env.TREG_DATA_DIR + '/treg-lens.sqlite');
    const row = db.prepare('SELECT snapshot_json, revision FROM workspaces WHERE workspace_id = ?').get('${owner("0")}');
    console.log(JSON.stringify({ snapshot: JSON.parse(row.snapshot_json), revision: row.revision }));
    db.close();
  `], { encoding: "utf8", env: process.env });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { snapshot: current.snapshot, revision: current.revision });
});

test("an append exceeding the combined limit rolls back and releases the write transaction", async () => {
  const current = await saveWorkspace(owner("1"), { ...snapshot(), prompts: ["x".repeat(7_800_000)] }, 0);
  const large = { ...run("too-large"), prompts: ["y".repeat(900_000)] };
  await assert.rejects(async () => await appendWorkspaceRun(owner("1"), large), WorkspaceValidationError);
  assert.deepEqual(await getWorkspace(owner("1")), current);
  const next = await appendWorkspaceRun(owner("1"), run("fits"));
  assert.equal(next.revision, current.revision + 1);
  assert.deepEqual(next.snapshot?.runs.map((item) => item.id), ["fits"]);
});

test("simultaneous first saves accept exactly one revision without interleaving transactions", async () => {
  const results = await Promise.allSettled([
    saveWorkspace(owner("2"), { ...snapshot(), prompts: ["First tab"] }, 0),
    saveWorkspace(owner("2"), { ...snapshot(), prompts: ["Second tab"] }, 0),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof WorkspaceConflictError);
  assert.equal((await getWorkspace(owner("2"))).revision, 1);
});

test("simultaneous audit appends preserve every distinct run and deduplicate replayed IDs", async () => {
  await Promise.all(["a", "b", "c", "a"].map((id) => appendWorkspaceRun(owner("3"), run(id))));
  const saved = await getWorkspace(owner("3"));
  assert.equal(saved.revision, 3);
  assert.deepEqual(saved.snapshot?.runs.map((item) => item.id).sort(), ["a", "b", "c"]);
});

test("follow-up append links its exact plan without replacing a concurrently edited plan", async () => {
  const baseline = run("plan-baseline");
  const plan = createPagePlan({ id: "plan-one", opportunity: pagePlanOpportunities([baseline], snapshot().project)[0], now: "2026-10-19T13:00:00Z" });
  const first = await saveWorkspace(owner("5"), { ...snapshot(), runs: [baseline], pagePlans: [plan] }, 0);
  const edited = { ...plan, rationale: "A concurrent decision", updatedAt: "2099-10-19T14:00:00Z" };
  await saveWorkspace(owner("5"), { ...first.snapshot, pagePlans: [edited] }, first.revision);
  const appended = await appendWorkspaceRun(owner("5"), run("followup-one"), { planId: plan.id, updatedAt: plan.updatedAt });
  assert.deepEqual(appended.snapshot?.pagePlans, [edited]);
  assert.equal(appended.snapshot?.runs.length, 2);
  const linked = await appendWorkspaceRun(owner("5"), run("followup-two"), { planId: edited.id, updatedAt: edited.updatedAt });
  assert.equal(linked.snapshot?.pagePlans?.[0].followupRunId, "followup-two");
  assert.equal(linked.snapshot?.pagePlans?.[0].status, "planned");
  assert.equal(linked.snapshot?.pagePlans?.[0].rationale, edited.rationale);
  assert.ok(Date.parse(linked.snapshot!.pagePlans![0].updatedAt) > Date.parse(edited.updatedAt), "linking remains monotonic for imported future timestamps");
  assert.deepEqual(await appendWorkspaceRun(owner("5"), run("followup-two"), { planId: edited.id, updatedAt: edited.updatedAt }), linked);
});

test("saved report contents cannot be overwritten by a later ordinary snapshot save", async () => {
  const report = createEvidenceReport({ id: "immutable-report", project: snapshot().project, runs: [run("report-baseline")] });
  const first = await saveWorkspace(owner("6"), { ...snapshot(), reports: [report] }, 0);
  await assert.rejects(() => saveWorkspace(owner("6"), { ...first.snapshot, reports: [{ ...report, notes: "Silent replacement" }] }, first.revision), /immutable/);
  assert.deepEqual(await getWorkspace(owner("6")), first);
  const removed = await saveWorkspace(owner("6"), { ...first.snapshot, reports: [] }, first.revision);
  assert.deepEqual(removed.snapshot?.reports, []);
});

test("onboarding evidence and unselected ideas remain durable through audit append and stale profile saves", async () => {
  const project: Project = {
    ...snapshot().project, audience: "Agent builders", market: { country: "US", language: "en" },
    competitorDetails: [{ name: "Composio", domain: "composio.dev", sourceUrl: "https://composio.dev/" }],
    buyerQuestions: [
      { text: "Which toolkit?", intent: "category", provenance: "generated" },
      { text: "How much do toolkits cost?", intent: "purchase", provenance: "generated" },
    ],
    researchReceipts: [{
      kind: "research", url: "https://treg.to/", domain: "treg.to", brand: "Treg", description: "Agent tools",
      competitors: [{ name: "Composio", domain: "composio.dev", sourceUrl: "https://composio.dev/" }],
      questions: ["Which toolkit?", "How much do toolkits cost?"],
      sources: [{ title: "Composio", url: "https://composio.dev/" }],
      totalCostUsd: null, knownCostUsd: 0, costKnown: false, callIds: ["research-receipt"], errors: [],
      completedAt: "2026-10-20T12:00:00Z",
    }],
  };
  const initial = await saveWorkspace(owner("4"), { ...snapshot(), project }, 0);
  const appended = await appendWorkspaceRun(owner("4"), run("with-evidence"));
  assert.deepEqual(appended.snapshot?.project, project);
  assert.deepEqual((await getWorkspace(owner("4"))).snapshot?.project, project);
  await assert.rejects(saveWorkspace(owner("4"), initial.snapshot, initial.revision), WorkspaceConflictError);
  const final = await getWorkspace(owner("4"));
  assert.equal(final.snapshot?.project.buyerQuestions?.length, 2);
  assert.deepEqual(final.snapshot?.prompts, ["Which toolkit?"]);
  assert.equal(final.snapshot?.project.researchReceipts?.[0].totalCostUsd, null);
  assert.equal(final.snapshot?.runs.length, 1);
});
