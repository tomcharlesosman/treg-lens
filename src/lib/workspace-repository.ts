import { withStorage, type StorageSession } from "./storage-database";
import { parseWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace-storage";
import type { SavedRun } from "./workspace-data";
import { MAX_WORKSPACE_BYTES, WorkspaceValidationError, sanitizeWorkspaceSnapshot } from "./workspace-validation";
import { MAX_DISCOVERY_RESEARCH, parseSavedDiscovery, type SavedDiscovery } from "./discovery-research";
import { assertImmutableEvidenceReports } from "./evidence-reports";
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
export async function getWorkspaceInSession(tx: StorageSession, workspaceId: string): Promise<WorkspaceEnvelope> {
  assertWorkspaceId(workspaceId);
  const row = await tx.get("SELECT snapshot_json, revision, updated_at FROM workspaces WHERE workspace_id = ?", workspaceId);
  if (!row) return { snapshot: null, revision: 0, updatedAt: null };
  const snapshot = parseWorkspaceSnapshot(String(row.snapshot_json));
  if (!snapshot) throw new Error("Stored workspace data could not be read.");
  return { snapshot, revision: Number(row.revision), updatedAt: String(row.updated_at) };
}
export function getWorkspace(workspaceId: string): Promise<WorkspaceEnvelope> {
  return withStorage((tx) => getWorkspaceInSession(tx, workspaceId));
}

async function writeWorkspace(tx: StorageSession, workspaceId: string, snapshot: WorkspaceSnapshot, revision: number): Promise<WorkspaceEnvelope> {
  const updatedAt = new Date().toISOString();
  const raw = JSON.stringify(snapshot);
  if (Buffer.byteLength(raw) > MAX_WORKSPACE_BYTES)
    throw new WorkspaceValidationError("Workspace data exceeds the 8 MiB storage limit. Export older runs before retrying.");
  await tx.run(`INSERT INTO workspaces (workspace_id, snapshot_json, revision, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET
    snapshot_json=excluded.snapshot_json, revision=excluded.revision, updated_at=excluded.updated_at`, workspaceId, raw, revision, updatedAt);
  return { snapshot, revision, updatedAt };
}

export async function saveWorkspaceInSession(tx: StorageSession, workspaceId: string, value: unknown, expectedRevision: number): Promise<WorkspaceEnvelope> {
  assertWorkspaceId(workspaceId);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new WorkspaceValidationError();
  const snapshot = sanitizeWorkspaceSnapshot(value);
  const current = await getWorkspaceInSession(tx, workspaceId);
  if (current.revision !== expectedRevision) throw new WorkspaceConflictError(current);
  try { assertImmutableEvidenceReports(current.snapshot?.reports, snapshot.reports); }
  catch (error) { throw new WorkspaceValidationError(error instanceof Error ? error.message : "Saved reports cannot be overwritten."); }
  return writeWorkspace(tx, workspaceId, snapshot, current.revision + 1);
}
export function saveWorkspace(workspaceId: string, value: unknown, expectedRevision: number): Promise<WorkspaceEnvelope> {
  return withStorage((tx) => saveWorkspaceInSession(tx, workspaceId, value, expectedRevision), { write: true, lock: `workspace:${workspaceId}` });
}

/** Schedulers and manual audits share an atomic, idempotent append operation. */
export async function appendWorkspaceRun(workspaceId: string, run: SavedRun, followup?: { planId: string; updatedAt: string }): Promise<WorkspaceEnvelope> {
  assertWorkspaceId(workspaceId);
  const initial = sanitizeWorkspaceSnapshot({
    project: { brand: run.brand, domain: run.domain, competitors: run.competitors ?? [] },
    prompts: run.prompts ?? [...new Set([...run.results.map((row) => row.prompt), ...run.errors.map((row) => row.prompt)])],
    runs: [run], done: [], sourceResearch: {},
  });
  return withStorage(async (tx) => {
    const current = await getWorkspaceInSession(tx, workspaceId);
    if (current.snapshot?.runs.some((existing) => existing.id === run.id)) {
      return current;
    }
    const snapshot = current.snapshot
      ? { ...current.snapshot, runs: [...current.snapshot.runs, initial.runs[0]] }
      : initial;
    // Link only the exact reviewed plan. Concurrent plan edits win; the paid
    // evidence is still appended and can be selected deliberately afterward.
    if (followup && snapshot.pagePlans) snapshot.pagePlans = snapshot.pagePlans.map((plan) =>
      plan.id === followup.planId && plan.updatedAt === followup.updatedAt
        ? { ...plan, followupRunId: run.id, updatedAt: new Date(Math.min(8.64e15, Math.max(Date.now(), Date.parse(plan.updatedAt) + 1))).toISOString() }
        : plan);
    return writeWorkspace(tx, workspaceId, snapshot, current.revision + 1);
  }, { write: true, lock: `workspace:${workspaceId}` });
}

/** Paid discovery appends original evidence without replacing concurrent profile edits. */
export async function appendWorkspaceDiscovery(workspaceId: string, receipt: SavedDiscovery): Promise<WorkspaceEnvelope> {
  assertWorkspaceId(workspaceId);
  const clean = parseSavedDiscovery(receipt);
  if (!clean) throw new WorkspaceValidationError("Discovery research could not be validated.");
  return withStorage(async (tx) => {
    const current = await getWorkspaceInSession(tx, workspaceId);
    if (current.snapshot?.discoveryResearch?.some((item) => item.id === clean.id)) return current;
    const snapshot = current.snapshot ?? {
      project: { brand: clean.input.brand, domain: clean.input.domain, competitors: [] },
      prompts: [], runs: [], done: [], sourceResearch: {},
    };
    return writeWorkspace(tx, workspaceId, { ...snapshot,
      discoveryResearch: [...(snapshot.discoveryResearch ?? []), clean].slice(-MAX_DISCOVERY_RESEARCH),
    }, current.revision + 1);
  }, { write: true, lock: `workspace:${workspaceId}` });
}
