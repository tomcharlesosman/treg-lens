"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Clock, LoaderCircle, X } from "lucide-react";
import { DialogFrame } from "./audit-dialog";
import type { Project } from "@/lib/workspace-data";
import type { Engine } from "@/lib/aeo";

import type { MonitorState, MonitorSchedule as Schedule } from "@/lib/monitor-types";
const engines: Engine[] = ["chatgpt", "perplexity", "gemini", "google"];
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC" : "Not yet";

export default function MonitorSettings({ open, onClose, project, prompts }: { open: boolean; onClose: () => void; project: Project; prompts: string[] }) {
  const id = useId();
  const initial = useRef({ project, prompts });
  const [data, setData] = useState<MonitorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<24 | 168>(24);
  const [hour, setHour] = useState(9);
  const [perRun, setPerRun] = useState("0.10");
  const [monthly, setMonthly] = useState("3.00");
  const [questions, setQuestions] = useState("");
  const [selectedEngines, setSelectedEngines] = useState<Engine[]>(["chatgpt", "perplexity"]);
  const [config, setConfig] = useState<Project>(project);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/monitor", { cache: "no-store" }).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not load monitoring.");
      if (!active) return;
      setData(value);
      const saved = value.schedule as Schedule | null;
      setEnabled(saved?.enabled ?? false);
      setCadence(saved?.intervalHours ?? 24);
      setHour(saved?.hourUtc ?? 9);
      setPerRun(String(saved?.perRunBudgetUsd ?? 0.1));
      setMonthly(String(saved?.monthlyBudgetUsd ?? 3));
      setQuestions((saved?.config.prompts ?? initial.current.prompts.slice(0, 8)).join("\n"));
      setSelectedEngines(saved?.config.engines ?? ["chatgpt", "perplexity"]);
      setConfig(saved?.config ?? initial.current.project);
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "Monitoring is unavailable."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);
  const cleanPrompts = [...new Set(questions.split("\n").map((value) => value.trim()).filter(Boolean))];
  const runLimit = Number(perRun), monthLimit = Number(monthly);
  const valid = Boolean(config.brand.trim() && config.domain.trim() && cleanPrompts.length >= 1 && cleanPrompts.length <= 8 && cleanPrompts.every((prompt) => prompt.length <= 500) && selectedEngines.length && Number.isFinite(runLimit) && runLimit >= 0.001 && runLimit <= 1 && Number.isFinite(monthLimit) && monthLimit >= runLimit && monthLimit <= 1000);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/monitor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, intervalHours: cadence, hourUtc: hour, perRunBudgetUsd: runLimit, monthlyBudgetUsd: monthLimit, config: { brand: config.brand.trim(), domain: config.domain.trim(), competitors: config.competitors, prompts: cleanPrompts, engines: selectedEngines } }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Monitoring could not be saved.");
      setData(value); setNotice(enabled ? "Monitoring enabled. The worker will run your next audit at the scheduled UTC time." : "Monitoring paused. The stored monitoring credential was removed.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Monitoring could not be saved."); }
    finally { setBusy(false); }
  }
  async function pause() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/monitor", { method: "DELETE" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Monitoring could not be paused.");
      setEnabled(false); setData(value); setNotice("Monitoring paused and its encrypted credential removed. An audit already in flight may still complete.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Monitoring could not be paused."); }
    finally { setBusy(false); }
  }
  return <DialogFrame open={open} onClose={busy ? () => {} : onClose} titleId={`${id}-title`} className="lens-settings-dialog">
    <div className="lens-dialog-heading"><div className="lens-dialog-eyebrow"><span className="lens-eyebrow-dot" /> AUTOMATED RECHECKS</div><button className="lens-dialog-close" aria-label="Close monitoring" disabled={busy} onClick={onClose}><X size={19} /></button><div className="lens-dialog-title-row"><div className="lens-dialog-icon"><Clock size={23} strokeWidth={1.6} /></div><h2 id={`${id}-title`}>Scheduled monitoring.</h2></div><p>Recheck your buyer questions daily or weekly, with explicit spending limits.</p></div>
    <div className="lens-dialog-body">
      {loading ? <p role="status">Loading monitoring settings…</p> : <form className="monitor-form" onSubmit={(event) => { void save(event); }}>
        <div className={`monitor-worker ${data?.worker.healthy ? "" : "offline"}`} role="status"><strong>{data?.worker.healthy ? "Worker online" : "Worker offline or not yet seen"}</strong><br />Last heartbeat: {date(data?.worker.lastSeenAt)}. {data?.worker.healthy ? "Scheduled jobs can run while your browser is closed." : <>Start the separate server process with <code>npm run monitor</code>. An enabled schedule will wait until a worker is available.</>}</div>
        <fieldset disabled={busy} className="lens-dialog-fieldset monitor-form">
          <div className="monitor-grid"><label>Monitoring brand<input value={config.brand} maxLength={100} onChange={(event) => setConfig({ ...config, brand: event.target.value })} /></label><label>Monitoring website<input value={config.domain} onChange={(event) => setConfig({ ...config, domain: event.target.value })} /></label></div>
          <label>Scheduled prompts<textarea value={questions} onChange={(event) => setQuestions(event.target.value)} maxLength={4100} /><span className="muted">{cleanPrompts.length} / 8 questions, one per line, up to 500 characters each.</span></label>
          <div className="monitor-engine" role="group" aria-label="Scheduled answer engines">{engines.map((engine) => <label key={engine}><input type="checkbox" checked={selectedEngines.includes(engine)} onChange={() => setSelectedEngines((old) => old.includes(engine) ? old.filter((value) => value !== engine) : [...old, engine])} />{engine === "google" ? "Google AI Mode" : engine === "chatgpt" ? "ChatGPT" : engine === "perplexity" ? "Perplexity" : "Gemini"}</label>)}</div>
          <div className="monitor-grid"><label>Audit cadence<select value={cadence} onChange={(event) => setCadence(Number(event.target.value) as 24 | 168)}><option value={24}>Daily · every 24 hours</option><option value={168}>Weekly · every 168 hours</option></select></label><label>Run hour (UTC)<select value={hour} onChange={(event) => setHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{String(value).padStart(2, "0")}:00 UTC</option>)}</select></label></div>
          <div className="monitor-grid"><label>Maximum USD per scheduled audit<input type="number" min="0.001" max="1" step="0.001" value={perRun} onChange={(event) => setPerRun(event.target.value)} /></label><label>Monthly automated budget (USD)<input type="number" min="0.001" max="1000" step="0.001" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></label></div>
          <label className="monitor-consent"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable paid monitoring. I authorize the server to retain my Treg key encrypted and run these scheduled audits within the limits above, including after I close the browser or sign out.</span></label>
          <p className="monitor-warning">These budgets cover automated audits only, not manual audits or other Treg usage. Each run refreshes current prices; unknown charges reserve the quoted ceiling. The first run uses the next selected UTC hour, followed by the selected cadence. Pause explicitly to remove the monitoring credential; an in-flight run may finish.</p>
          <button className="button primary" type="submit" disabled={busy || !valid || !data}>{busy ? <LoaderCircle size={15} /> : <Clock size={15} />} Save monitoring settings</button>
          {data?.schedule && <button className="button" type="button" disabled={busy} onClick={() => { void pause(); }}>Pause and remove monitoring credential</button>}
        </fieldset>
        {data?.schedule && <div className="monitor-status"><p>Status: {data.schedule.lastStatus ?? (data.schedule.enabled ? "scheduled" : "paused")}</p><p>Next run: {date(data.schedule.nextRunAt)}</p><p>Last run: {date(data.schedule.lastRunAt)}</p><p>Spent or reserved this month: ${data.schedule.spentMonthUsd.toFixed(4)}</p>{data.schedule.recoveryAudit && <p><a href={data.schedule.recoveryAudit.url} download>Download recovered monitoring audit</a> · {date(data.schedule.recoveryAudit.completedAt)}. Prune old history after a full backup, then import this recovery file to merge its audits.</p>}{data.schedule.lastError && <p role="alert">{data.schedule.lastError}</p>}</div>}
        {error && <p className="key-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      </form>}
    </div>
  </DialogFrame>;
}
