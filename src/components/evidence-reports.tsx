"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowRight, FileText, Printer, X } from "lucide-react";
import { createEvidenceReport, evidenceAgentHandoff, evidenceReportJson, evidenceReportMarkdown, MAX_EVIDENCE_REPORTS, type EvidenceReport } from "@/lib/evidence-reports";
import { measureRun } from "@/lib/measurement";
import { compareEvidenceRuns, comparePagePlanRuns, type PagePlan } from "@/lib/page-plans";
import { downloadFile, normalizeDomain, type Project, type SavedRun } from "@/lib/workspace-data";
import AnswerBody from "./answer-body";
import "./evidence-reports.css";

const timestamp = (value: string) => new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const percent = (value: number | null) => value === null ? "Unknown" : `${value.toFixed(1)}%`;
const sameBrand = (a: Pick<Project, "brand" | "domain">, b: Pick<Project, "brand" | "domain">) => a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase() && normalizeDomain(a.domain) === normalizeDomain(b.domain);
function safeLink(value: string): string | undefined {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

function ReportDialog({ title, children, onClose, returnFocus }: { title: string; children: ReactNode; onClose: () => void; returnFocus: HTMLElement | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = returnFocus ?? document.activeElement as HTMLElement | null;
    dialog?.showModal();
    let closed: HTMLDetailsElement[] = [];
    const beforePrint = () => { closed = Array.from(dialog?.querySelectorAll<HTMLDetailsElement>("details:not([open])") ?? []); closed.forEach((detail) => { detail.open = true; }); };
    const afterPrint = () => { closed.forEach((detail) => { detail.open = false; }); closed = []; };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, [returnFocus]);
  return <dialog ref={ref} className="native-modal wide evidence-report-dialog" aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')].filter((node) => node.getClientRects().length > 0);
    if (!nodes.length) return;
    event.preventDefault(); const active = nodes.indexOf(document.activeElement as HTMLElement); nodes[(active + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
  }}><div className="modal-top er-no-print"><h2>{title}</h2><button className="icon-button" aria-label="Close report" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}

function RunEvidence({ run, index }: { run: SavedRun; index: number }) {
  const measurement = measureRun(run);
  return <section className="er-run" aria-label={`${index === 0 ? "Baseline" : "Follow-up"} evidence`}>
    <div className="er-run-heading"><div><span className="er-eyebrow">{index === 0 ? "Baseline" : "Follow-up"}</span><h3>{timestamp(run.completedAt)}</h3><p>Audit {run.id}</p></div><span className="er-badge">{measurement.answered}/{measurement.requested} answers · {(measurement.coverage * 100).toFixed(0)}% coverage</span></div>
    <div className="er-metrics"><div><strong>{percent(measurement.mentionRate)}</strong><span>Observed mentions</span></div><div><strong>{percent(measurement.citationRate)}</strong><span>Observed own-domain citations</span></div><div><strong>{run.totalCostKnown === true ? `$${run.totalCostUsd.toFixed(4)}` : "Final cost unknown"}</strong><span>{run.totalCostKnown === true ? "Reported charge" : `$${run.totalCostUsd.toFixed(4)} known charges; additional charges may exist`}</span></div></div>
    <p className="er-note">{measurement.recorded ? `${measurement.scope.market.country} / ${measurement.scope.market.language} · ${measurement.scope.prompts.length} saved questions · ${measurement.scope.collectors.length} collectors.` : "Legacy collection settings were not recorded. These observations cannot establish a comparable change."} Rates describe answered checks; missing answers are not absence.</p>
    <details className="er-detail"><summary>Collection settings and question identities</summary><ul>{measurement.scope.collectors.map((collector) => <li key={collector.engine}>{collector.engine} · {collector.sourceKind} · {collector.provider} · {collector.model}</li>)}</ul><ul>{measurement.scope.prompts.map((prompt) => <li key={prompt.id}>{prompt.text}<small>{prompt.id} · {prompt.kind}</small></li>)}</ul></details>
    {run.errors.length > 0 && <div className="er-warning"><strong>{run.errors.length} collection error{run.errors.length === 1 ? "" : "s"}</strong><ul>{run.errors.map((error, i) => <li key={i}>{error.engine} · {error.prompt}: {error.error}</li>)}</ul></div>}
    <details className="er-detail"><summary>Inspect {run.results.length} saved answer{run.results.length === 1 ? "" : "s"} and citations</summary><div className="er-answers">{run.results.map((answer, i) => <article key={`${answer.id}-${i}`} className="er-answer"><h4>{answer.prompt}</h4><p className="er-note">{answer.engine} · {timestamp(answer.completedAt)} · Answer {answer.id}</p><AnswerBody answer={answer.answer || "No answer text was returned."} />{answer.citations.length ? <ul className="er-citations">{answer.citations.map((citation, j) => <li key={`${citation.url}-${j}`}>{safeLink(citation.url) ? <a href={safeLink(citation.url)} target="_blank" rel="noreferrer">{citation.title || citation.url}</a> : <span>{citation.title || "Unsafe citation link omitted"}</span>}<small>{citation.url}</small></li>)}</ul> : <p className="er-note">No citations were returned for this answer.</p>}</article>)}</div></details>
  </section>;
}

function ComparisonNote({ runs, plans = [] }: { runs: SavedRun[]; plans?: PagePlan[] }) {
  if (runs.length < 2) return <p className="er-note" data-testid="report-comparison">Baseline only. A second saved audit is needed to inspect change.</p>;
  if (runs.length > 2) return <p className="er-note" data-testid="report-comparison">This snapshot contains {runs.length} audits. Create a separate report with exactly two selected audits to compare a baseline and follow-up.</p>;
  const linkedPlan = plans.find((plan) => plan.baselineRunId === runs[0].id && plan.followupRunId === runs[1].id);
  const comparison = linkedPlan ? comparePagePlanRuns(linkedPlan, runs) : compareEvidenceRuns(runs[0], runs[1]);
  if (!comparison.comparable || !comparison.delta) return <p className="er-warning" data-testid="report-comparison">Comparison unavailable. {comparison.reasons.join(" ")} The original observations remain inspectable.</p>;
  const delta = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} percentage points`;
  return <p className="er-comparison" data-testid="report-comparison">Comparable saved observations: {delta(comparison.delta.mentions)} in mentions; {delta(comparison.delta.citations)} in own-domain citations. This is an observed change, not evidence that a page edit caused it. Provider model versions can remain unreported.</p>;
}

function SavedReport({ report, onClose, onDelete, preview = false, synced, returnFocus }: { report: EvidenceReport; onClose: () => void; onDelete?: (id: string) => Promise<boolean>; preview?: boolean; synced: boolean; returnFocus: HTMLElement | null }) {
  const [handoff, setHandoff] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const basename = `treg-lens-report-${report.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <ReportDialog title={report.title} onClose={onClose} returnFocus={returnFocus}><article className="er-printable" aria-label="Saved report evidence">
    <header className="er-report-heading"><span className="er-eyebrow">Treg Lens · {report.demo ? "Illustrative demo" : "Private evidence report"}</span><h2>{report.title}</h2><p>{report.project.brand} · {report.project.domain}</p><p className="er-note">{preview ? "Preview" : synced ? "Saved snapshot" : "Local workspace copy — synchronization pending"} · {timestamp(report.createdAt)} · Format version {report.version} · {report.id}</p></header>
    <div className="er-toolbar er-no-print"><button className="button" onClick={() => downloadFile(`${basename}.md`, evidenceReportMarkdown(report), "text/markdown;charset=utf-8")}><ArrowDownToLine size={14} />Download Markdown</button><button className="button" onClick={() => downloadFile(`${basename}.json`, evidenceReportJson(report))}>Download report JSON</button><button className="button" onClick={() => window.print()}><Printer size={14} />Print report</button><button className="button primary" onClick={() => setHandoff((value) => !value)} aria-expanded={handoff}>Continue with your agent <ArrowRight size={14} /></button></div>
    {report.demo && <p className="er-warning">Illustrative demo evidence. This report is not saved to a private workspace and does not describe live research.</p>}
    <p className="er-note">This snapshot keeps the selected evidence as it was saved. Current profile edits, deleted audits and later page-plan changes do not rewrite it. Report exports are not restorable workspace backups.</p>
    {report.project.description && <p className="er-context">{report.project.description}</p>}
    {(report.project.audience || report.project.strategy) && <section className="er-context-snapshot"><h3>Reviewed context</h3><dl>{report.project.audience && <><dt>Audience</dt><dd>{report.project.audience}</dd></>}{report.project.strategy?.goal && <><dt>Goal</dt><dd>{report.project.strategy.goal}</dd></>}{report.project.strategy?.timeframe && <><dt>Timeframe</dt><dd>{report.project.strategy.timeframe}</dd></>}{report.project.strategy?.differentiators && <><dt>Differentiators</dt><dd>{report.project.strategy.differentiators}</dd></>}{report.project.strategy?.keyPages?.length ? <><dt>Key pages</dt><dd><ul>{report.project.strategy.keyPages.map((url) => <li key={url}>{safeLink(url) ? <a href={safeLink(url)} target="_blank" rel="noreferrer">{url}</a> : url}</li>)}</ul></dd></> : null}{report.project.strategy?.writingPreferences && <><dt>Writing preferences</dt><dd>{report.project.strategy.writingPreferences}</dd></>}</dl></section>}
    {report.notes && <section className="er-notes"><h3>Report notes</h3><p>{report.notes}</p></section>}
    <ComparisonNote runs={report.runs} plans={report.plans} />
    {report.plans.length > 0 && <section className="er-plans"><h3>Saved page plans</h3>{report.plans.map((plan) => <article key={plan.id} className="er-plan"><h4>{plan.question.text}</h4><p className="er-note">{plan.status} · {plan.target.kind} page{plan.publishedAt ? ` · Published ${timestamp(plan.publishedAt)}` : ""}</p>{plan.target.url && <p>{safeLink(plan.target.url) ? <a href={safeLink(plan.target.url)} target="_blank" rel="noreferrer">{plan.target.url}</a> : plan.target.url}</p>}<h5>Why this page</h5><p className="er-context">{plan.rationale || "No rationale recorded."}</p><h5>Writing brief</h5><AnswerBody answer={plan.brief || "No brief recorded."} /><p className="er-note">Plan {plan.id} · Question {plan.question.id} · Baseline {plan.baselineRunId}{plan.followupRunId ? ` · Linked follow-up ${plan.followupRunId}` : ""}. Only the audits selected in this report are included below.</p></article>)}</section>}
    {report.runs.map((run, index) => <RunEvidence key={run.id} run={run} index={index} />)}
    <footer className="er-note er-report-footer">Selected observations only; AI answers vary. Collection coverage and reported charges are preserved. Unknown charges are not zero. No live connection, publishing permission or paid-work approval is included.</footer>
    {handoff && <section className="er-handoff er-no-print" aria-label="Agent handoff"><h3>Your next step, with the evidence attached.</h3><p>Give your agent this instruction pack and the report JSON. It contains saved context and evidence, not a live connection. Review the files before sharing them outside your workspace. Fresh research, paid checks and publishing need your separate approval.</p><label>Agent instruction pack<textarea aria-label="Agent instruction pack" readOnly value={evidenceAgentHandoff(report)} rows={12} onFocus={(event) => event.currentTarget.select()} /></label><div className="er-toolbar"><button className="button" onClick={async () => { try { await navigator.clipboard.writeText(evidenceAgentHandoff(report)); setMessage("Agent handoff copied."); } catch { setMessage("Copy is unavailable. Select the instruction pack or download it below."); } }}>Copy agent handoff</button><button className="button" onClick={() => downloadFile(`${basename}-agent.md`, evidenceAgentHandoff(report), "text/markdown;charset=utf-8")}>Download agent handoff</button></div>{message && <p role="status">{message}</p>}</section>}
    {onDelete && !preview && <div className="er-delete er-no-print"><p className="er-note">To keep a copy outside this workspace, download this report or a full workspace backup before deleting it.</p>{deleteError && <p role="alert" className="er-warning">{deleteError}</p>}<button className="button" disabled={deleting} onClick={async () => { if (!window.confirm("Delete this saved report? Download the report or a full workspace backup first. Its frozen evidence cannot be recovered from this workspace after deletion.")) return; setDeleting(true); setDeleteError(""); try { if (await onDelete(report.id)) onClose(); else setDeleteError("Report deletion was not acknowledged. Resolve workspace synchronization before trying again."); } catch { setDeleteError("Report could not be deleted. Your snapshot remains open."); } finally { setDeleting(false); } }}>{deleting ? "Deleting report…" : "Delete saved report"}</button></div>}
  </article></ReportDialog>;
}

export default function EvidenceReports({ project, runs, plans, reports, onSave, onDelete, demo = false, synced = true, initialReportId, initialPlanId, onTargetClose }: { onTargetClose?: () => void; initialReportId?: string; initialPlanId?: string; project: Project; runs: SavedRun[]; plans: PagePlan[]; reports: EvidenceReport[]; onSave: (report: EvidenceReport) => Promise<boolean>; onDelete?: (id: string) => Promise<boolean>; demo?: boolean; synced?: boolean }) {
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null);
  const eligible = useMemo(() => runs.filter((run) => sameBrand(run, project)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)), [runs, project]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [initialPlan] = useState(() => plans.find((plan) => plan.id === initialPlanId && sameBrand({ brand: plan.brand.name, domain: plan.brand.domain }, project)));
  const [baselineId, setBaselineId] = useState(initialPlan?.baselineRunId ?? "");
  const [followupId, setFollowupId] = useState(initialPlan?.followupRunId ?? "");
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [selected, setSelected] = useState<EvidenceReport | null>(() => reports.find((report) => report.id === initialReportId && sameBrand(report.project, project)) ?? null);
  const [pending, setPending] = useState<EvidenceReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const baseline = eligible.find((run) => run.id === baselineId) ?? (!baselineId ? eligible[0] : undefined);
  const followup = eligible.find((run) => run.id === followupId);
  const selectedRuns = baseline ? [baseline, ...(followup && followup.id !== baseline.id ? [followup] : [])] : [];
  const currentPlans = plans.filter((plan) => sameBrand({ brand: plan.brand.name, domain: plan.brand.domain }, project));
  const limitReached = reports.length >= MAX_EVIDENCE_REPORTS && !reports.some((report) => report.id === pending?.id);
  const savedReports = pending ? reports.filter((report) => report.id !== pending.id) : reports;
  async function save() {
    setError(""); setStatus("");
    try {
      if (!pending && followupId && !followup) throw new Error("The selected follow-up audit is no longer available. Choose another saved audit or select Baseline only.");
      const report = pending ?? createEvidenceReport({ id: crypto.randomUUID(), title: title.trim() || `${project.brand} visibility review`, project, runs: selectedRuns, plans: currentPlans.filter((plan) => plan.id === planId), notes, demo });
      if (demo) { setSelected(report); return; }
      setPending(report); setSaving(true);
      if (!await onSave(report)) { setError("Report not saved. Your exact snapshot is retained here. Resolve workspace synchronization before trying again."); return; }
      setPending(null); setSelected(report); setStatus("Report saved to your private workspace."); setTitle(""); setNotes("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report could not be saved."); } finally { setSaving(false); }
  }
  return <section className="evidence-reports" aria-label="Private evidence reports">
    <div className="er-intro"><span className="er-eyebrow">From evidence to the next move</span><h2>A report you can return to.</h2><p>Freeze your findings, share a clear next step with your agent, and keep every conclusion connected to its original answers. No provider calls are made.</p></div>
    <div className="er-layout"><form className="panel er-composer" onSubmit={(event) => { event.preventDefault(); setReportTrigger((event.nativeEvent as SubmitEvent).submitter as HTMLElement | null ?? document.activeElement as HTMLElement | null); void save(); }}><div className="er-section-heading"><FileText size={18} /><h3>Create a private report</h3></div><p className="er-note">{project.brand} · {project.domain}. Select a baseline and, optionally, a follow-up. A saved report is an independent snapshot.</p>
      <fieldset disabled={saving || Boolean(pending)}><label>Report title<input aria-label="Report title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${project.brand} visibility review`} maxLength={160} /></label><label>Baseline audit<select aria-label="Baseline audit" value={baseline?.id ?? ""} onChange={(event) => { setBaselineId(event.target.value); if (event.target.value === followupId) setFollowupId(""); }} disabled={!eligible.length}><option value="" disabled>Select an audit</option>{eligible.map((run) => <option key={run.id} value={run.id}>{timestamp(run.completedAt)} · {run.id}</option>)}</select></label><label>Follow-up audit<select aria-label="Follow-up audit" value={followupId} onChange={(event) => setFollowupId(event.target.value)}><option value="">Baseline only</option>{eligible.filter((run) => run.id !== baseline?.id).map((run) => <option key={run.id} value={run.id}>{timestamp(run.completedAt)} · {run.id}</option>)}</select></label><label>Include a saved page plan<select aria-label="Include a saved page plan" value={planId} onChange={(event) => { const plan = currentPlans.find((item) => item.id === event.target.value); setPlanId(event.target.value); if (plan) { setBaselineId(plan.baselineRunId); setFollowupId(plan.followupRunId ?? ""); } }}><option value="">No page plan</option>{currentPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.question.text} · {plan.status}</option>)}</select></label><label>Report notes<textarea aria-label="Report notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} placeholder="What should the reader take away? Keep observations separate from hypotheses." /></label></fieldset>
      {selectedRuns.length > 0 && <ComparisonNote runs={selectedRuns} plans={currentPlans.filter((plan) => plan.id === planId)} />}
      {!eligible.length && <p className="er-note">Run an audit first. Your saved answers will appear here.</p>}{eligible.length > 0 && baselineId && !baseline && <p className="er-warning">This plan’s original baseline audit is no longer available. Select a saved baseline explicitly before creating a report.</p>}
      {followupId && !followup && <p className="er-warning">The linked follow-up audit is no longer available. Choose another saved audit or select Baseline only.</p>}{limitReached && !demo && <p className="er-warning">This workspace has reached its 10 saved report limit. Download reports or a full backup before managing saved snapshots.</p>}
      {error && <p role="alert" className="er-warning">{error}</p>}{status && <p role="status">{status}</p>}
      <div className="er-toolbar"><button className="button primary" type="submit" disabled={saving || (!baseline && !pending) || (!demo && limitReached)}>{saving ? "Saving report…" : demo ? "Preview demo report" : pending ? "Retry saving snapshot" : "Save private report"}</button>{pending && !saving && <button className="button" type="button" onClick={() => { setPending(null); setError(""); }}>Edit report draft</button>}</div>
    </form><div className="panel er-library"><div className="er-section-heading"><h3>{synced || demo ? "Saved reports" : "Report snapshots"}</h3><span>{savedReports.length} / 10</span></div><p className="er-note">Snapshots from every brand in this workspace remain available.</p>{!synced && !demo && <p className="er-warning">Workspace changes are not yet acknowledged by the server. Local report copies remain available for recovery and download.</p>}{!savedReports.length ? <div className="er-empty"><FileText size={28} /><h4>Your evidence, ready to use.</h4><p>Save a report to preserve the context behind your next page improvement.</p></div> : <ul>{[...savedReports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((report) => <li key={report.id}><button type="button" onClick={(event) => { setReportTrigger(event.currentTarget); setSelected(report); }}><span><strong>{report.title}</strong><small>{report.project.brand} · {report.project.domain}</small><small>{timestamp(report.createdAt)} · {report.runs.length} audit{report.runs.length === 1 ? "" : "s"} · v{report.version}</small></span><ArrowRight size={17} /></button></li>)}</ul>}</div></div>
    {selected && <SavedReport key={selected.id} report={selected} onClose={() => { setSelected(null); if (selected.id === initialReportId) onTargetClose?.(); }} onDelete={onDelete} preview={demo} synced={synced} returnFocus={reportTrigger} />}
  </section>;
}
