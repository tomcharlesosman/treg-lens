"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { DEFAULT_PROJECT, DEFAULT_PROMPTS, type Project, type SavedRun } from "@/lib/workspace-data";
import type { WorkspaceSnapshot } from "@/lib/workspace-storage";
import { sanitizeWorkspaceSnapshot } from "@/lib/workspace-validation";

export type WorkspaceEnvelope = { snapshot: WorkspaceSnapshot | null; revision: number; updatedAt: string | null };
export type SyncPhase = "loading" | "sample" | "saved" | "unsaved" | "saving" | "offline" | "conflict";
export type WorkspaceSync = { phase: SyncPhase; revision: number | null; updatedAt: string | null; error: string; cacheError: string; isNew: boolean };
export type AuditPersistence = { saved?: boolean; storageError?: string };
const sensitive = /^(?:token|api_?token|treg_?token|api_?key|session_?secret|secret|password|cookie|authorization|credentials?)$/i;

export function withoutCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCredentials);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.test(key)).map(([key, item]) => [key, withoutCredentials(item)]));
  return value;
}
export function emptyWorkspace(): WorkspaceSnapshot {
  return { project: { ...DEFAULT_PROJECT, competitors: [...DEFAULT_PROJECT.competitors] }, prompts: [...DEFAULT_PROMPTS], runs: [], done: [], sourceResearch: {} };
}
function snapshotFrom(value: unknown): WorkspaceSnapshot | null {
  try { return sanitizeWorkspaceSnapshot(value); } catch { return null; }
}
function envelopeFrom(value: unknown): WorkspaceEnvelope {
  const data = value as Partial<WorkspaceEnvelope> | null;
  if (!data || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0 || !(data.updatedAt === null || typeof data.updatedAt === "string")) throw new Error("The server returned an invalid workspace version.");
  const snapshot = data.snapshot === null ? null : snapshotFrom(data.snapshot);
  if (data.snapshot !== null && !snapshot) throw new Error("The server returned an unreadable workspace.");
  return { snapshot, revision: data.revision!, updatedAt: data.updatedAt! };
}
const message = (error: unknown) => error instanceof Error ? error.message : "Workspace synchronization is unavailable.";

export function useServerWorkspace(storageKey: string, demoMode: boolean) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(emptyWorkspace);
  const [sync, setSync] = useState<WorkspaceSync>({ phase: demoMode ? "sample" : "loading", revision: null, updatedAt: null, error: "", cacheError: "", isNew: false });
  const state = useRef({ snapshot: emptyWorkspace(), revision: null as number | null, updatedAt: null as string | null, dirty: false, version: 0, loaded: demoMode, serverVerified: false, saving: false, refreshing: false, disposed: false, conflict: null as WorkspaceEnvelope | null });
  const metaKey = storageKey.replace("treg-lens-workspace-v1", "treg-lens-sync-v1");
  const publish = useCallback((phase: SyncPhase, error = "", isNew?: boolean) => {
    const current = state.current;
    if (current.disposed) return;
    setSync((old) => ({ ...old, phase, revision: current.revision, updatedAt: current.updatedAt, error, ...(isNew === undefined ? {} : { isNew }) }));
  }, []);
  const cache = useCallback(() => {
    if (demoMode || !state.current.loaded || state.current.disposed) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(withoutCredentials(state.current.snapshot)));
      localStorage.setItem(metaKey, JSON.stringify({ revision: state.current.revision, dirty: state.current.dirty }));
      setSync((old) => old.cacheError ? { ...old, cacheError: "" } : old);
    } catch {
      setSync((old) => ({ ...old, cacheError: "Browser storage is full or unavailable. Download a workspace backup; server synchronization is independent." }));
    }
  }, [demoMode, storageKey, metaKey]);
  const adopt = useCallback((envelope: WorkspaceEnvelope) => {
    const current = state.current;
    current.snapshot = envelope.snapshot ?? emptyWorkspace();
    current.revision = envelope.revision;
    current.updatedAt = envelope.updatedAt;
    current.dirty = false;
    current.conflict = null;
    current.loaded = true;
    current.serverVerified = true;
    current.version++;
    setSnapshot(current.snapshot);
    publish("saved", "", envelope.snapshot === null);
    cache();
  }, [cache, publish]);
  const change = useCallback((action: SetStateAction<WorkspaceSnapshot>) => {
    const current = state.current;
    if (!current.loaded || current.disposed) return;
    const next = typeof action === "function" ? action(current.snapshot) : action;
    if (next === current.snapshot) return;
    current.snapshot = next;
    current.version++;
    current.dirty = !demoMode;
    setSnapshot(current.snapshot);
    if (!demoMode) {
      setSync((old) => ({ ...old, phase: current.conflict ? "conflict" : old.phase === "offline" ? "offline" : current.saving ? "saving" : "unsaved", isNew: false }));
      cache();
    }
  }, [cache, demoMode]);
  const field = useCallback(<K extends keyof WorkspaceSnapshot>(key: K, action: SetStateAction<WorkspaceSnapshot[K]>) => {
    change((current) => ({ ...current, [key]: typeof action === "function" ? (action as (value: WorkspaceSnapshot[K]) => WorkspaceSnapshot[K])(current[key]) : action }));
  }, [change]);
  const readServer = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the saved workspace. Your local changes are retained.");
    return envelopeFrom(data);
  }, []);
  const save = useCallback(async (): Promise<boolean> => {
    const current = state.current;
    if (demoMode || !current.dirty) return true;
    if (!current.loaded || !current.serverVerified || current.disposed || current.saving || current.conflict || current.revision === null) return false;
    const version = current.version;
    const submitted = current.snapshot;
    const revision = current.revision;
    current.saving = true;
    publish("saving");
    try {
      const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: withoutCredentials(submitted), revision }) });
      const data = await response.json();
      if (current.disposed) return false;
      if (response.status === 409) {
        current.conflict = envelopeFrom(data);
        publish("conflict", "A newer server version exists. Your local changes are retained. Download a backup before choosing which version to load.");
        return false;
      }
      if (!response.ok) throw new Error(data.error || "The server could not save this workspace. Your changes are retained locally.");
      const envelope = envelopeFrom(data);
      current.revision = envelope.revision;
      current.updatedAt = envelope.updatedAt;
      current.dirty = current.version !== version;
      if (current.conflict) publish("conflict", "A newer server version exists. Your local changes are retained; choose which version to load.");
      else publish(current.dirty ? "unsaved" : "saved");
      cache();
      return !current.dirty;
    } catch (error) {
      if (!current.disposed) publish("offline", message(error));
      return false;
    } finally {
      current.saving = false;
    }
  }, [cache, demoMode, publish]);
  const refresh = useCallback(async (): Promise<boolean> => {
    const current = state.current;
    if (demoMode || current.disposed || !current.loaded || current.saving || current.refreshing) return false;
    current.refreshing = true;
    try {
      const remote = await readServer();
      if (current.disposed || current.saving) return false;
      current.serverVerified = true;
      if (current.revision !== null && remote.revision < current.revision) return false;
      if (current.dirty) {
        if (remote.revision !== current.revision && !(remote.snapshot === null && remote.revision === 0 && current.revision === null)) {
          current.conflict = remote;
          publish("conflict", "The server changed while you had local edits. Neither version was overwritten. Download a backup or load the saved server version.");
          return false;
        }
        current.revision = remote.revision;
        current.updatedAt = remote.updatedAt;
        publish(current.conflict ? "conflict" : "unsaved");
        return !current.conflict;
      }
      adopt(remote);
      return true;
    } catch (error) {
      if (!current.disposed) publish("offline", message(error));
      return false;
    } finally {
      current.refreshing = false;
    }
  }, [adopt, demoMode, publish, readServer]);
  const retry = useCallback(async () => {
    if (await refresh()) await save();
  }, [refresh, save]);
  const loadServer = useCallback(async () => {
    if (state.current.saving) return false;
    const version = state.current.version;
    try {
      const remote = await readServer();
      if (state.current.disposed) return false;
      if (state.current.saving || state.current.version !== version || remote.revision < (state.current.revision ?? 0)) { publish(state.current.conflict ? "conflict" : state.current.dirty ? "unsaved" : "saved", "Your workspace changed while loading. Retry to fetch its latest version."); return false; }
      adopt(remote);
      return true;
    } catch (error) {
      publish("offline", message(error));
      return false;
    }
  }, [adopt, publish, readServer]);
  const acceptAudit = useCallback(async (run: SavedRun, persistence?: AuditPersistence, originalProject?: Project) => {
    const append = (value: WorkspaceSnapshot, selectProject: boolean): WorkspaceSnapshot => ({ ...value, runs: [...value.runs.filter((old) => old.id !== run.id), run], ...(selectProject ? { project: { brand: run.brand, domain: run.domain, competitors: run.competitors ?? value.project.competitors }, prompts: [...new Set([...value.prompts, ...(run.prompts ?? [])])] } : {}) });
    const current = state.current;
    if (persistence?.saved) {
      const requestedVersion = current.version;
      try {
        const remote = await readServer();
        if (current.disposed) return;
        if (remote.revision < (current.revision ?? 0) || (!current.dirty && !current.saving && current.version !== requestedVersion)) return;
        if (!current.dirty && !current.saving) {
          adopt(remote);
          const canSelect = originalProject && JSON.stringify(originalProject) === JSON.stringify(remote.snapshot?.project);
          const matches = run.brand.toLowerCase() === current.snapshot.project.brand.toLowerCase() && run.domain.toLowerCase() === current.snapshot.project.domain.toLowerCase();
          if (canSelect || matches) { const merged = append(current.snapshot, true); if (JSON.stringify(merged) !== JSON.stringify(current.snapshot)) change(merged); }
          return;
        }
        current.snapshot = append(current.snapshot, false);
        current.version++;
        current.dirty = true;
        current.conflict = remote;
        setSnapshot(current.snapshot);
        cache();
        publish("conflict", "Your audit was saved on the server while other edits were pending. Both versions are retained. Download a backup before loading the server version.");
        return;
      } catch (error) {
        change((value) => append(value, false));
        publish("offline", `${message(error)} The completed audit is retained in this tab.`);
        return;
      }
    }
    change((value) => append(value, !originalProject || JSON.stringify(originalProject) === JSON.stringify(value.project)));
    if (persistence?.storageError) publish("offline", persistence.storageError);
  }, [adopt, cache, change, publish, readServer]);

  useEffect(() => {
    const current = state.current;
    current.disposed = false;
    try { sessionStorage.removeItem("treg-lens-token"); } catch {}
    if (demoMode) return () => { current.disposed = true; };
    let cancelled = false;
    async function load() {
      let local: WorkspaceSnapshot | null = null;
      let localRevision: number | null = null;
      let localDirty = false;
      try {
        local = snapshotFrom(JSON.parse(localStorage.getItem(storageKey) || "null"));
        const metadata = JSON.parse(localStorage.getItem(metaKey) || "null");
        if (metadata && Number.isSafeInteger(metadata.revision)) localRevision = metadata.revision;
        localDirty = metadata?.dirty === true;
      } catch {}
      try {
        const remote = await readServer();
        if (cancelled) return;
        if (local && ((remote.snapshot === null && remote.revision === 0) || localDirty)) {
          current.snapshot = local;
          current.revision = remote.snapshot === null ? remote.revision : localRevision ?? remote.revision;
          current.updatedAt = remote.updatedAt;
          current.dirty = true;
          current.loaded = true;
          current.serverVerified = true;
          setSnapshot(local);
          if (remote.snapshot !== null && localRevision !== remote.revision) {
            current.conflict = remote;
            publish("conflict", "Recovered unsynced browser edits and a newer saved server version. Neither was overwritten.");
          } else publish("unsaved", "Migrating this browser's workspace to server storage.");
          cache();
        } else adopt(remote);
      } catch (error) {
        if (cancelled) return;
        current.snapshot = local ?? emptyWorkspace();
        current.revision = localRevision;
        current.dirty = Boolean(local);
        current.loaded = true;
        setSnapshot(current.snapshot);
        publish("offline", `${message(error)} Using this browser's cached workspace; changes are unsynced.`);
      }
    }
    void load();
    return () => { cancelled = true; current.disposed = true; };
  }, [adopt, cache, demoMode, metaKey, publish, readServer, storageKey]);
  useEffect(() => {
    if (sync.phase !== "unsaved" || demoMode) return;
    const timer = window.setTimeout(() => { void save(); }, 700);
    return () => window.clearTimeout(timer);
  }, [snapshot, sync.phase, save, demoMode]);
  useEffect(() => {
    if (demoMode) return;
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(onFocus, 30_000);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); window.clearInterval(timer); };
  }, [demoMode, refresh]);
  return { snapshot, sync, loaded: demoMode || sync.phase !== "loading", change, field, save, refresh, retry, loadServer, acceptAudit };
}
