import { getDatabase } from "./database";
import { parseWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace-storage";
import type { SavedRun } from "./workspace-data";
import { MAX_WORKSPACE_BYTES, WorkspaceValidationError, sanitizeWorkspaceSnapshot } from "./workspace-validation";
export { MAX_WORKSPACE_BYTES, WorkspaceValidationError, sanitizeWorkspaceSnapshot } from "./workspace-validation";

export type WorkspaceEnvelope = {
  snapshot: WorkspaceSnapshot | null;
  revision: number;
  updatedAt: string | null;
};
export class WorkspaceConflictError extends Error {
  constructor(public current: WorkspaceEnvelope) {
    super("This workspace changed on the server. Refresh it before choosing which changes to save.");
    this.name = "WorkspaceConflictError";
  }
}

function assertWorkspaceId(id: string) {
  if (!/^treg_[a-f\d]{24}$/.test(id)) throw new WorkspaceValidationError("Invalid workspace namespace.");
}
export function getWorkspace(workspaceId: string): WorkspaceEnvelope {
  assertWorkspaceId(workspaceId);
  const row = getDatabase().prepare("SELECT snapshot_json, revision, updated_at FROM workspaces WHERE workspace_id = ?").get(workspaceId);
  if (!row) return { snapshot: null, revision: 0, updatedAt: null };
  const snapshot = parseWorkspaceSnapshot(String(row.snapshot_json));
  if (!snapshot) throw new Error("Stored workspace data could not be read.");
  return { snapshot, revision: Number(row.revision), updatedAt: String(row.updated_at) };
}

function writeWorkspace(workspaceId: string, snapshot: WorkspaceSnapshot, revision: number): WorkspaceEnvelope {
  const updatedAt = new Date().toISOString();
  const raw = JSON.stringify(snapshot);
  if (Buffer.byteLength(raw) > MAX_WORKSPACE_BYTES)
    throw new WorkspaceValidationError("Workspace data exceeds the 8 MiB storage limit. Export older runs before retrying.");
  getDatabase().prepare(`INSERT INTO workspaces (workspace_id, snapshot_json, revision, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET
    snapshot_json=excluded.snapshot_json, revision=excluded.revision, updated_at=excluded.updated_at`).run(workspaceId, raw, revision, updatedAt);
  return { snapshot, revision, updatedAt };
}

export function saveWorkspace(workspaceId: string, value: unknown, expectedRevision: number): WorkspaceEnvelope {
  assertWorkspaceId(workspaceId);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new WorkspaceValidationError();
  const snapshot = sanitizeWorkspaceSnapshot(value);
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = getWorkspace(workspaceId);
    if (current.revision !== expectedRevision) throw new WorkspaceConflictError(current);
    const next = writeWorkspace(workspaceId, snapshot, current.revision + 1);
    database.exec("COMMIT");
    return next;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Schedulers and manual audits share an atomic, idempotent append operation. */
export function appendWorkspaceRun(workspaceId: string, run: SavedRun): WorkspaceEnvelope {
  assertWorkspaceId(workspaceId);
  const initial = sanitizeWorkspaceSnapshot({
    project: { brand: run.brand, domain: run.domain, competitors: run.competitors ?? [] },
    prompts: run.prompts ?? [...new Set([...run.results.map((row) => row.prompt), ...run.errors.map((row) => row.prompt)])],
    runs: [run], done: [], sourceResearch: {},
  });
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = getWorkspace(workspaceId);
    if (current.snapshot?.runs.some((existing) => existing.id === run.id)) {
      database.exec("COMMIT");
      return current;
    }
    const snapshot = current.snapshot
      ? { ...current.snapshot, runs: [...current.snapshot.runs, initial.runs[0]] }
      : initial;
    const next = writeWorkspace(workspaceId, snapshot, current.revision + 1);
    database.exec("COMMIT");
    return next;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
