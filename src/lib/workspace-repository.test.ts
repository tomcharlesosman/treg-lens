import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { getDatabase } from "./database";
import {
  appendWorkspaceRun, getWorkspace, saveWorkspace, sanitizeWorkspaceSnapshot,
  WorkspaceConflictError, WorkspaceValidationError,
} from "./workspace-repository";
import type { SavedRun } from "./workspace-data";

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

before(() => { process.env.TREG_DATA_DIR = directory; });
after(() => {
  getDatabase().close();
  if (previous === undefined) delete process.env.TREG_DATA_DIR;
  else process.env.TREG_DATA_DIR = previous;
  rmSync(directory, { recursive: true, force: true });
});

test("SQLite enables durable WAL, a busy timeout and private filesystem permissions", () => {
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

test("new namespaces are empty and saved snapshots are isolated by owner", () => {
  assert.deepEqual(getWorkspace(owner("a")), { snapshot: null, revision: 0, updatedAt: null });
  const saved = saveWorkspace(owner("a"), snapshot(), 0);
  assert.equal(saved.revision, 1);
  assert.ok(saved.updatedAt);
  assert.deepEqual(getWorkspace(owner("a")), saved);
  assert.deepEqual(getWorkspace(owner("b")), { snapshot: null, revision: 0, updatedAt: null });
});

test("optimistic revisions reject stale writes and return current evidence without replacing it", () => {
  const initial = saveWorkspace(owner("c"), snapshot(), 0);
  const current = saveWorkspace(owner("c"), { ...snapshot(), prompts: ["New question"] }, initial.revision);
  assert.throws(() => saveWorkspace(owner("c"), { ...snapshot(), prompts: ["Stale question"] }, initial.revision), (error) => {
    assert.ok(error instanceof WorkspaceConflictError);
    assert.deepEqual(error.current, current);
    return true;
  });
  assert.deepEqual(getWorkspace(owner("c")), current);
});

test("snapshot validation discards unknown credential-bearing metadata at every stored layer", () => {
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
  assert.throws(() => saveWorkspace(owner("d"), sample, -1), WorkspaceValidationError);
  assert.throws(() => getWorkspace("another-owner"), WorkspaceValidationError);
});

test("append initializes missing workspaces, deduplicates run IDs, and preserves later settings", () => {
  const first = appendWorkspaceRun(owner("e"), run("first"));
  assert.deepEqual(first.snapshot?.project, snapshot().project);
  assert.deepEqual(first.snapshot?.prompts, ["Which toolkit?"]);
  assert.equal(first.revision, 1);
  assert.deepEqual(appendWorkspaceRun(owner("e"), run("first")), first);
  const edited = saveWorkspace(owner("e"), { ...first.snapshot, project: { brand: "Another brand", domain: "example.com", competitors: [] }, prompts: ["Edited prompt"] }, first.revision);
  const next = appendWorkspaceRun(owner("e"), run("second"));
  assert.equal(next.revision, edited.revision + 1);
  assert.equal(next.snapshot?.project.brand, "Another brand");
  assert.deepEqual(next.snapshot?.prompts, ["Edited prompt"]);
  assert.deepEqual(next.snapshot?.runs.map((item) => item.id), ["first", "second"]);
  assert.throws(() => saveWorkspace(owner("e"), edited.snapshot, edited.revision), WorkspaceConflictError);
});

test("failed oversized writes leave the previous transaction intact", () => {
  const initial = saveWorkspace(owner("f"), snapshot(), 0);
  assert.throws(() => saveWorkspace(owner("f"), { ...snapshot(), prompts: ["x".repeat(8 * 1024 * 1024)] }, initial.revision), WorkspaceValidationError);
  assert.deepEqual(getWorkspace(owner("f")), initial);
});

test("committed snapshots are readable from another Node process", () => {
  const current = saveWorkspace(owner("0"), snapshot(), 0);
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

test("an append exceeding the combined limit rolls back and releases the write transaction", () => {
  const current = saveWorkspace(owner("1"), { ...snapshot(), prompts: ["x".repeat(7_800_000)] }, 0);
  const large = { ...run("too-large"), prompts: ["y".repeat(900_000)] };
  assert.throws(() => appendWorkspaceRun(owner("1"), large), WorkspaceValidationError);
  assert.deepEqual(getWorkspace(owner("1")), current);
  const next = appendWorkspaceRun(owner("1"), run("fits"));
  assert.equal(next.revision, current.revision + 1);
  assert.deepEqual(next.snapshot?.runs.map((item) => item.id), ["fits"]);
});
