"use client";

import { useId, useRef, useState } from "react";
import { ArchiveRestore, ArrowDownToLine, Upload, X } from "lucide-react";
const MAX_BACKUP_FILE_BYTES = MAX_WORKSPACE_BYTES + 1024;

import { DialogFrame } from "./audit-dialog";
import { downloadFile, type SavedRun } from "@/lib/workspace-data";
import type { WorkspaceSnapshot } from "@/lib/workspace-storage";
import { MAX_WORKSPACE_BYTES, sanitizeWorkspaceSnapshot } from "@/lib/workspace-validation";

export function downloadWorkspaceBackup(snapshot: WorkspaceSnapshot) {
  const clean = sanitizeWorkspaceSnapshot(snapshot);
  downloadFile(`treg-lens-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: "treg-lens-workspace-backup", version: 1, demo: false, exportedAt: new Date().toISOString(), snapshot: clean }));
}
function hasCredentials(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCredentials);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => /^(?:token|api_?token|treg_?token|api_?key|session_?secret|secret|password|cookie|authorization|credentials?)$/i.test(key) || hasCredentials(item));
}
export function parseWorkspaceBackup(value: unknown): WorkspaceSnapshot {
  const backup = value as { kind?: string; version?: number; demo?: boolean; snapshot?: WorkspaceSnapshot } | null;
  if (!backup || backup.kind !== "treg-lens-workspace-backup" || backup.version !== 1 || backup.demo !== false || !backup.snapshot) throw new Error("Choose a full Treg Lens workspace backup. Demo data and filtered reports cannot be restored.");
  if (hasCredentials(backup)) throw new Error("This file contains credential fields. Restore a backup exported without API keys or secrets.");
  const raw = backup.snapshot;
  if (!Array.isArray(raw.done) || !raw.sourceResearch || typeof raw.sourceResearch !== "object" || Array.isArray(raw.sourceResearch)) throw new Error("The backup is incomplete: completed moves and source research must be included.");
  const clean = sanitizeWorkspaceSnapshot(raw);
  if (Object.keys(clean.sourceResearch).length !== Object.keys(raw.sourceResearch).length) throw new Error("The backup contains invalid source research records.");
  if (clean.runs.some((run) => run.id.startsWith("demo-"))) throw new Error("Illustrative demo audits cannot be imported into a real workspace.");
  return clean;
}

export default function WorkspaceBackup({ open, onClose, snapshot, onRestore }: { open: boolean; onClose: () => void; snapshot: WorkspaceSnapshot; onRestore: (next: WorkspaceSnapshot) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<WorkspaceSnapshot | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<SavedRun[] | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function readFile(file: File | undefined) {
    setError("");
    setPending(null);
    setPendingRecovery(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) { setError("Backups must be 8 MiB or smaller."); return; }
    setBusy(true);
    try {
      const text = await file.text();
      if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_FILE_BYTES) throw new Error("Backups must be 8 MiB or smaller.");
      const value = JSON.parse(text);
      if (value?.kind === "monitoring-recovery" && value.version === 1 && Array.isArray(value.runs)) {
        if (hasCredentials(value)) throw new Error("This recovery file contains credential fields.");
        const recovered = sanitizeWorkspaceSnapshot({ ...snapshot, runs: value.runs });
        if (recovered.runs.some((run) => run.id.startsWith("demo-"))) throw new Error("Demo audits cannot be restored.");
        const runs = [...new Map([...recovered.runs, ...snapshot.runs].map((run: SavedRun) => [run.id, run])).values()].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
        setPendingRecovery(recovered.runs);
        setPending(sanitizeWorkspaceSnapshot({ ...snapshot, runs })); setMode("merge");
      } else { setPending(parseWorkspaceBackup(value)); setMode("replace"); }
    } catch (failure) { setError(failure instanceof SyntaxError ? "This file is not valid JSON." : failure instanceof Error ? failure.message : "The backup could not be read."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <DialogFrame open={open} onClose={onClose} titleId={`${id}-title`} className="lens-settings-dialog">
    <div className="lens-dialog-heading"><div className="lens-dialog-eyebrow"><span className="lens-eyebrow-dot" /> YOUR DATA, PORTABLE</div><button className="lens-dialog-close" aria-label="Close backup and restore" onClick={onClose}><X size={19} /></button><div className="lens-dialog-title-row"><div className="lens-dialog-icon"><ArchiveRestore size={23} strokeWidth={1.6} /></div><h2 id={`${id}-title`}>Backup and restore.</h2></div><p>A complete copy of your workspace, across every brand, date and engine.</p></div>
    <div className="lens-dialog-body workspace-backup-body">
      <p>Your backup includes all {snapshot.runs.length} audits, {snapshot.prompts.length} tracked prompts, saved page plans, report snapshots, strategy context, completed moves and research. API keys are excluded.</p>
      <button className="button primary" onClick={() => { try { downloadWorkspaceBackup(snapshot); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not export backup."); } }}><ArrowDownToLine size={15} /> Download full workspace backup</button>
      <hr />
      <label className="field-label" htmlFor={`${id}-file`}>Import a full workspace backup</label>
      <input ref={input} id={`${id}-file`} type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { void readFile(event.target.files?.[0]); }} />
      <p className="muted">Maximum 8 MiB of workspace data. Filtered reports and demo exports are not importable.</p>
      {error && <p role="alert" className="key-error">{error}</p>}
      {pending && <section className="workspace-restore-confirm" aria-label="Confirm workspace restore"><h3>{mode === "merge" ? "Merge recovered monitoring audits?" : "Replace your current workspace?"}</h3><p>Restore {pending.runs.length} audits and {pending.prompts.length} prompts for {pending.project.brand}. {mode === "merge" ? "Recovered audits will be merged by their unique IDs, preserving your current settings and other data." : "This replaces your settings, history, page plans, reports, completed moves and research. Download your current full backup first."} Other tabs may require a refresh.</p><button className="button" onClick={() => setPending(null)}>Cancel import</button><button className="button primary" onClick={() => { try { const next = mode === "merge" ? sanitizeWorkspaceSnapshot({ ...snapshot, runs: [...new Map([...(pendingRecovery ?? []), ...snapshot.runs].map((run) => [run.id, run])).values()].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt)) }) : pending; onRestore(next); setPending(null); setError(""); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not restore this backup."); } }}><Upload size={14} /> {mode === "merge" ? "Confirm merge recovered audits" : "Confirm replace workspace"}</button></section>}
    </div>
  </DialogFrame>;
}
