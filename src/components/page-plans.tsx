"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, FilePenLine, LoaderCircle, Settings2, X } from "lucide-react";
import { buildPagePlanFollowup, createPagePlan, MAX_PAGE_PLANS, pagePlanMatchesProject, pagePlanOpportunities, type PagePlan } from "@/lib/page-plans";
import { normalizeDomain, type Project, type SavedRun } from "@/lib/workspace-data";
import { DialogFrame } from "./audit-dialog";
import FollowupComparison from "./followup-comparison";
import "./page-plans.css";

type Props = {
  project: Project;
  runs: SavedRun[];
  plans: PagePlan[];
  initialPlanId?: string;
  onTargetClose?: () => void;
  legacyDone?: string[];
  onSave: (plans: PagePlan[]) => Promise<void>;
  onSaveStrategy?: (strategy: Project["strategy"]) => Promise<void>;
  onFollowup: (plan: PagePlan) => void;
  disabled?: boolean;
};
const statuses: Record<PagePlan["status"], string> = { planned: "Planned", "in-progress": "In progress", published: "Published", measured: "Measured", dismissed: "Dismissed" };
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
function stableValue(value: unknown): string {
  return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function ownedUrl(value: string, domain: string) {
  try { const url = new URL(value); const host = normalizeDomain(url.hostname); const owner = normalizeDomain(domain); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && (host === owner || host.endsWith(`.${owner}`)); } catch { return false; }
}

export default function PagePlans({ project, runs, plans, initialPlanId, onTargetClose, legacyDone = [], onSave, onSaveStrategy, onFollowup, disabled }: Props) {
  const [initialPlan] = useState(() => plans.find((plan) => plan.id === initialPlanId && pagePlanMatchesProject(plan, project)) ?? null);
  const [draft, setDraft] = useState<PagePlan | null>(() => initialPlan ? structuredClone(initialPlan) : null);
  const [originalPlan, setOriginalPlan] = useState<PagePlan | null>(() => initialPlan ? structuredClone(initialPlan) : null);
  const attemptedPlan = useRef<PagePlan | null>(null);
  const attemptedDelete = useRef(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [filter, setFilter] = useState<"open" | "all" | "measured" | "dismissed">("open");
  const [notice, setNotice] = useState("");
  const ownPlans = useMemo(() => plans.filter((plan) => pagePlanMatchesProject(plan, project)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [plans, project]);
  const opportunities = useMemo(() => pagePlanOpportunities(runs, project).filter((item) => item.answered > 0 && item.absent > 0), [runs, project]);
  const visiblePlans = ownPlans.filter((plan) => filter === "all" || (filter === "open" ? !["dismissed", "measured"].includes(plan.status) : plan.status === filter));
  const ready = ownPlans.filter((plan) => plan.status === "published" && !plan.followupRunId);
  function openPlan(plan: PagePlan, existing: boolean) {
    attemptedPlan.current = null;
    attemptedDelete.current = false;
    setOriginalPlan(existing ? structuredClone(plan) : null);
    setDraft(structuredClone(plan));
  }
  function guardPlan(id: string) {
    const latest = plans.find((item) => item.id === id) ?? null;
    if (stableValue(latest) !== stableValue(originalPlan) && (!attemptedPlan.current || stableValue(latest) !== stableValue(attemptedPlan.current)) && !(attemptedDelete.current && latest === null)) throw new Error("This page plan changed while you were editing. Your draft is still here. Copy your changes, close the editor and reopen the latest saved plan before applying them.");
  }

  return <section className="page-plans" aria-label="Page plans">
    {notice && <p className="pp-success" role="status"><Check size={15} />{notice}</p>}
    {(ready.length > 0 || project.strategy?.goal) && <div className="pp-next">{ready.length > 0 && <p>{`${ready.length} published ${ready.length === 1 ? "plan is" : "plans are"} ready for a deliberate follow-up. Review a fresh quote or attach evidence you already collected.`}</p>}{project.strategy?.goal && <p className="pp-goal"><strong>Your goal:</strong> {project.strategy.goal}{project.strategy.timeframe ? ` · ${project.strategy.timeframe}` : ""}</p>}</div>}
    <div className="pp-section-heading"><div><h3>Saved page plans <span>{ownPlans.length}</span></h3></div><div className="pp-section-actions">{onSaveStrategy && <button type="button" className="button" onClick={() => setStrategyOpen(true)} disabled={disabled}><Settings2 size={14} />Strategy context</button>}<label>Show<select aria-label="Filter page plans" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="open">Open plans</option><option value="all">All plans</option><option value="measured">Measured</option><option value="dismissed">Dismissed</option></select></label></div></div>
    {visiblePlans.length ? <div className="pp-plan-list">{visiblePlans.map((plan) => <article className="pp-plan-card" key={plan.id}><div className="pp-plan-top"><span className={`pp-status pp-status-${plan.status}`}>{statuses[plan.status]}</span><span>Updated {date(plan.updatedAt)}</span></div><h4>{plan.question.text}</h4><p className="pp-target">{plan.target.kind === "existing" ? "Improve existing page" : plan.target.kind === "proposed" ? "Create a new page" : "Decide on a page later"}{plan.target.url && <> · <a href={plan.target.url} target="_blank" rel="noopener noreferrer">{plan.target.url}<ArrowUpRight size={12} /></a></>}</p><p className="pp-rationale">{plan.rationale}</p><div className="pp-plan-footer"><span>{plan.publishedAt ? `Change recorded ${date(plan.publishedAt)}` : runs.some((run) => run.id === plan.baselineRunId) ? `Baseline ${date(runs.find((run) => run.id === plan.baselineRunId)!.completedAt)}` : "Baseline unavailable"}</span><button type="button" className="button" onClick={() => openPlan(plan, true)} disabled={disabled}>Open page plan <ArrowRight size={13} /></button></div></article>)}</div> : <div className="pp-empty"><FilePenLine size={22} /><h4>{ownPlans.length ? "No plans in this view" : "A useful next step deserves more than a checkbox."}</h4><p>{ownPlans.length ? "Choose another filter to find your saved work." : "Save a question below with a target page, a specific brief and its original evidence."}</p></div>}
    <div className="pp-section-heading"><div><h3>Questions to investigate</h3></div></div>
    <div className="pp-opportunities">{opportunities.map((opportunity) => {
      const existing = ownPlans.find((plan) => plan.question.id === opportunity.question.id && plan.status !== "dismissed");
      const competitor = opportunity.competitorMentions > 0 || opportunity.competitorCitations > 0;
      return <article className="pp-opportunity" key={opportunity.id}><div><div className="pp-opportunity-labels"><span className={`pp-status ${competitor ? "pp-status-published" : ""}`}>{competitor ? "Observed competitor gap" : "Brand absence"}</span><span>{opportunity.answered}/{opportunity.requested} answers for this question · {Math.round(opportunity.coverage * 100)}% coverage · {date(opportunity.completedAt)}</span></div><h4>{opportunity.question.text}</h4><p>{opportunity.reason}</p>{opportunity.coverage < .9 && <p className="pp-evidence-note">Partial collection: missing answers are excluded. This is not a comparable progress measurement.</p>}</div><button type="button" className="button" disabled={disabled || (!existing && plans.length >= MAX_PAGE_PLANS)} onClick={() => openPlan(existing ?? createPagePlan({ id: crypto.randomUUID(), opportunity }), Boolean(existing))}>{existing ? "Open saved plan" : "Create page plan"}<ArrowRight size={13} /></button></article>;
    })}</div>
    {!opportunities.length && <p className="pp-footnote">No saved answers show your brand missing yet.</p>}
    {plans.length >= MAX_PAGE_PLANS && <p className="pp-footnote">Your workspace has reached its {MAX_PAGE_PLANS}-plan limit. Existing plans remain editable and exportable.</p>}
    {legacyDone.length > 0 && <details className="pp-legacy"><summary>Earlier completed moves ({legacyDone.length})</summary><p>These older records contain question wording only. They have no frozen brand, baseline or page plan and are not counted as this project’s completed plans.</p><ul>{legacyDone.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
    {draft && <PagePlanEditor key={draft.id} plan={draft} runs={runs} onClose={() => { setDraft(null); if (draft.id === initialPlanId) onTargetClose?.(); }} onSave={async (next) => { guardPlan(next.id); attemptedPlan.current = next; await onSave(plans.some((plan) => plan.id === next.id) ? plans.map((plan) => plan.id === next.id ? next : plan) : [...plans, next]); setNotice("Page plan saved. Your evidence and next step are kept together."); }} onFollowup={(next) => { setDraft(null); onFollowup(next); }} onDelete={originalPlan ? async () => { guardPlan(draft.id); attemptedDelete.current = true; await onSave(plans.filter((plan) => plan.id !== draft.id)); setNotice("Page plan deleted. Original audits remain in your history."); } : undefined} />}
    {strategyOpen && onSaveStrategy && <StrategyEditor project={project} onClose={() => setStrategyOpen(false)} onSave={async (strategy) => { await onSaveStrategy(strategy); setNotice("Strategy context saved."); }} />}
  </section>;
}

function PagePlanEditor({ plan, runs, onClose, onSave, onFollowup, onDelete }: { plan: PagePlan; runs: SavedRun[]; onClose: () => void; onSave: (plan: PagePlan) => Promise<void>; onFollowup: (plan: PagePlan) => void; onDelete?: () => Promise<void> }) {
  const id = useId();
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (discard || confirmDelete) confirmationRef.current?.focus(); }, [discard, confirmDelete]);
  const change = (updates: Partial<PagePlan>) => { setDraft((old) => ({ ...old, ...updates })); setDirty(true); setError(""); };
  let followupError = "";
  try { buildPagePlanFollowup(draft, runs); } catch (failure) { followupError = failure instanceof Error ? failure.message : "The original scope is unavailable."; }
  const validation = draft.target.kind === "existing" && !draft.target.url?.trim() ? "Enter the existing page URL." : draft.target.url && !ownedUrl(draft.target.url, draft.brand.domain) ? `Use an http:// or https:// page on ${draft.brand.domain} or one of its subdomains.` : !draft.rationale.trim() ? "Add a reason for this page plan." : !draft.brief.trim() ? "Add a writing brief." : draft.status === "measured" && !draft.followupRunId ? "Select a saved follow-up before marking the plan measured." : ["published", "measured"].includes(draft.status) && !draft.publishedAt ? "Record the page change date before marking it published or measured." : "";
  async function save(followup = false) {
    if (saving || validation) { setError(validation); return; }
    setSaving(true); setError("");
    const next = { ...draft, updatedAt: new Date(Math.max(Date.now(), Date.parse(draft.updatedAt) + 1)).toISOString(), target: { kind: draft.target.kind, ...(draft.target.url?.trim() ? { url: draft.target.url.trim() } : {}) } };
    try { await onSave(next); setDirty(false); if (followup) onFollowup(next); else onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : "The plan could not be saved. Your draft is still here."); } finally { setSaving(false); }
  }
  async function remove() {
    if (!onDelete || saving) return;
    setSaving(true); setError("");
    try { await onDelete(); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : "The plan could not be deleted."); } finally { setSaving(false); }
  }
  return <DialogFrame open onClose={() => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } }} titleId={`${id}-title`} descriptionId={`${id}-description`} className="pp-editor">
    <div className="lens-dialog-heading"><span className="lens-dialog-eyebrow">A PAGE PLAN WITH A BASELINE</span><button className="lens-dialog-close" type="button" aria-label="Close page plan" onClick={() => dirty ? setDiscard(true) : onClose()} disabled={saving}><X size={19} /></button><h2 id={`${id}-title`}>Make the next page count.</h2><p id={`${id}-description`}>{draft.question.text}</p></div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><div className="lens-dialog-body"><fieldset className="lens-dialog-fieldset" disabled={saving}>
      <div className="pp-baseline"><strong>{draft.brand.name}</strong><span>{draft.brand.domain} · Baseline {runs.find((run) => run.id === draft.baselineRunId) ? date(runs.find((run) => run.id === draft.baselineRunId)!.completedAt) : "audit unavailable"}</span><p>Original buyer question and collection scope stay attached to this plan.</p></div>
      <label className="lens-dialog-field" htmlFor={`${id}-target`}>Page decision<select data-initial-focus id={`${id}-target`} value={draft.target.kind} onChange={(event) => { const kind = event.target.value as PagePlan["target"]["kind"]; change({ target: { kind, ...(kind !== "later" && draft.target.url ? { url: draft.target.url } : {}) } }); }}><option value="existing">Improve an existing page</option><option value="proposed">Create a new page</option><option value="later">Decide later</option></select></label>
      {draft.target.kind !== "later" && <label className="lens-dialog-field" htmlFor={`${id}-url`}>{draft.target.kind === "existing" ? "Existing page URL" : "Proposed page URL (optional)"}<input id={`${id}-url`} type="url" maxLength={2000} value={draft.target.url ?? ""} onChange={(event) => change({ target: { ...draft.target, url: event.target.value } })} placeholder={`https://${draft.brand.domain}/your-page`} /><span className="pp-field-note">Choose a page on your saved brand domain. The page is not fetched or published.</span></label>}
      <label className="lens-dialog-field" htmlFor={`${id}-rationale`}>Why this page?<textarea id={`${id}-rationale`} rows={3} maxLength={2000} value={draft.rationale} onChange={(event) => change({ rationale: event.target.value })} /></label>
      <label className="lens-dialog-field" htmlFor={`${id}-brief`}>Writing brief<textarea className="pp-brief-input" id={`${id}-brief`} rows={10} maxLength={12000} value={draft.brief} onChange={(event) => change({ brief: event.target.value })} /><span className="pp-field-note">An editable starting point from saved evidence. Verify claims before publishing; no extra model call was made.</span></label>
      <div className="lens-dialog-grid"><label className="lens-dialog-field" htmlFor={`${id}-status`}>Plan status<select id={`${id}-status`} value={draft.status} onChange={(event) => change({ status: event.target.value as PagePlan["status"] })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="lens-dialog-field" htmlFor={`${id}-published`}>Page change date<input id={`${id}-published`} type="date" value={draft.publishedAt?.slice(0, 10) ?? ""} onChange={(event) => change({ publishedAt: event.target.value || undefined })} /><span className="pp-field-note">Your reported publication or update date.</span></label></div>
      <FollowupComparison plan={draft} runs={runs} onSelectFollowup={(followupRunId) => change({ followupRunId })} disabled={saving} />
      {followupError && <p className="pp-followup-warning"><CircleAlert size={15} /><span>Follow-up audit unavailable: {followupError} You can still inspect and edit this plan.</span></p>}
      {onDelete && <button type="button" className="button pp-delete" onClick={() => setConfirmDelete(true)}>Delete page plan</button>}
    </fieldset>{confirmDelete && <div className="pp-discard" role="alert"><p>Delete this saved plan? Its original audits remain available. Download a full workspace backup to retain a copy of the plan.</p><button ref={confirmationRef} type="button" className="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Keep plan</button><button type="button" className="button" disabled={saving} onClick={() => void remove()}>Confirm delete plan</button></div>}{error && <p className="pp-error" role="alert">{error}</p>}{discard && <div className="pp-discard" role="alert"><p>Your changes have not been saved.</p><button type="button" className="button" ref={confirmationRef} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="button" onClick={onClose}>Discard changes</button></div>}</div>
    <div className="pp-editor-footer"><p>Saving is free. A follow-up starts only after you review its fresh estimate and approve it.</p><div><button type="button" className="button" disabled={saving || !!followupError || !!validation} onClick={() => void save(true)}>Review follow-up audit <ArrowRight size={13} /></button><button type="submit" className="lens-dialog-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Save page plan</button></div></div></form>
  </DialogFrame>;
}

function StrategyEditor({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (strategy: Project["strategy"]) => Promise<void> }) {
  const id = useId();
  const [strategy, setStrategy] = useState(project.strategy ?? {});
  const [originalStrategy] = useState(() => stableValue(project.strategy ?? {}));
  const [originalProject] = useState(() => stableValue([project.brand.trim().toLowerCase(), normalizeDomain(project.domain)]));
  const attemptedStrategy = useRef<string | null>(null);
  const [pages, setPages] = useState((project.strategy?.keyPages ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const confirmationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (discard) confirmationRef.current?.focus(); }, [discard]);
  const change = (value: typeof strategy) => { setStrategy(value); setDirty(true); setError(""); };
  async function save() {
    if (stableValue([project.brand.trim().toLowerCase(), normalizeDomain(project.domain)]) !== originalProject) { setError("The active brand changed while you were editing. Your draft is still here. Copy your changes and reopen strategy context for the intended brand."); return; }
    if (stableValue(project.strategy ?? {}) !== originalStrategy && stableValue(project.strategy ?? {}) !== attemptedStrategy.current) { setError("Strategy context changed while you were editing. Your draft is still here. Copy your changes, close this editor and reopen the latest context before applying them."); return; }
    const keyPages = [...new Set(pages.split("\n").map((page) => page.trim()).filter(Boolean))];
    if (keyPages.length > 12 || keyPages.some((page) => !ownedUrl(page, project.domain))) { setError(`Add up to 12 http:// or https:// page URLs on ${project.domain}, one per line.`); return; }
    setBusy(true); setError("");
    try { attemptedStrategy.current = stableValue({ ...strategy, keyPages }); await onSave({ ...strategy, keyPages }); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Context could not be saved. Your draft is still here."); } finally { setBusy(false); }
  }
  return <DialogFrame open onClose={() => { if (!busy) { if (dirty) setDiscard(true); else onClose(); } }} titleId={`${id}-title`} descriptionId={`${id}-description`} className="pp-strategy-dialog"><div className="lens-dialog-heading"><span className="lens-dialog-eyebrow">OPTIONAL, REVIEWED CONTEXT</span><button className="lens-dialog-close" type="button" aria-label="Close strategy context" onClick={() => dirty ? setDiscard(true) : onClose()} disabled={busy}><X size={19} /></button><h2 id={`${id}-title`}>Keep the work pointed somewhere.</h2><p id={`${id}-description`}>Give saved plans, reports and your agent the context that matters for {project.brand}. This does not run research.</p></div><form onSubmit={(event) => { event.preventDefault(); void save(); }}><div className="lens-dialog-body"><fieldset className="lens-dialog-fieldset" disabled={busy}><label className="lens-dialog-field" htmlFor={`${id}-goal`}>Goal<textarea data-initial-focus id={`${id}-goal`} maxLength={600} rows={2} value={strategy.goal ?? ""} onChange={(event) => change({ ...strategy, goal: event.target.value })} placeholder="Help buyers understand when our product is the right fit." /></label><label className="lens-dialog-field" htmlFor={`${id}-timeframe`}>Timeframe<input id={`${id}-timeframe`} maxLength={120} value={strategy.timeframe ?? ""} onChange={(event) => change({ ...strategy, timeframe: event.target.value })} placeholder="For example, this quarter" /></label><label className="lens-dialog-field" htmlFor={`${id}-differences`}>Verified differentiators<textarea id={`${id}-differences`} maxLength={1200} rows={3} value={strategy.differentiators ?? ""} onChange={(event) => change({ ...strategy, differentiators: event.target.value })} placeholder="What can you substantiate about your product?" /></label><label className="lens-dialog-field" htmlFor={`${id}-pages`}>Important owned pages<textarea id={`${id}-pages`} maxLength={24000} rows={3} value={pages} onChange={(event) => { setPages(event.target.value); setDirty(true); }} placeholder={`https://${project.domain}/product\nhttps://${project.domain}/docs`} /><span className="pp-field-note">Up to 12 URLs, one per line.</span></label><label className="lens-dialog-field" htmlFor={`${id}-voice`}>Writing preferences<textarea id={`${id}-voice`} maxLength={1200} rows={3} value={strategy.writingPreferences ?? ""} onChange={(event) => change({ ...strategy, writingPreferences: event.target.value })} placeholder="Tone, audience needs and claims to avoid." /></label></fieldset>{error && <p className="pp-error" role="alert">{error}</p>}{discard && <div className="pp-discard" role="alert"><p>Your strategy changes have not been saved.</p><button type="button" className="button" ref={confirmationRef} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="button" onClick={onClose}>Discard changes</button></div>}</div><div className="pp-editor-footer"><p>Optional context stays in this private workspace and selected exports.</p><button className="lens-dialog-primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={14} />}Save strategy context</button></div></form></DialogFrame>;
}
