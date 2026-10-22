"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CircleAlert, Clock3, EyeOff, RotateCcw } from "lucide-react";
import { deriveWorkspaceContinuity, type ContinuityAction, type NextStep } from "@/lib/workspace-continuity";
import { parseSavedDiscovery } from "@/lib/discovery-research";
import { cleanResearchReceipt, isResearchReceipt } from "@/lib/workspace-profile";
import { normalizeDomain } from "@/lib/workspace-data";
import type { WorkspaceSnapshot } from "@/lib/workspace-storage";
import type { SyncPhase } from "./use-server-workspace";

type Props = {
  snapshot: WorkspaceSnapshot;
  syncPhase: SyncPhase;
  storageKey: string;
  recoveryRefreshKey: boolean;
  onAction: (action: ContinuityAction) => void;
  onDismiss: (stepId: string | null) => Promise<boolean>;
  onRecover: () => void;
  onRecoverDiscovery: () => void;
  onRecoverBrandResearch: () => void;
  onEditProfile: () => void;
  onManageQuestions: () => void;
  /** Latest-audit evidence, shown inside this module rather than as a separate section. */
  findings?: ReactNode;
};
const stamp = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** The marker belongs to this key's workspace, including interrupted work before a profile switch. */
function browserRecovery(storageKey: string): "pending" | "returned" | null {
  try {
    const text = localStorage.getItem(`${storageKey}:discovery:v1`);
    if (!text || text.length > 1_000_000) return null;
    const value = JSON.parse(text);
    if (value?.pending === true) return "pending";
    return parseSavedDiscovery(value?.receipt) ? "returned" : null;
  } catch { return null; }
}

/** Match the existing review wizard's key, version and size bound; never inspect its initial-setup draft. */
function brandReviewRecovery(storageKey: string, confirmed: WorkspaceSnapshot | null): "pending" | "returned" | null {
  try {
    const text = localStorage.getItem(`${storageKey}:review:onboarding:v1`);
    if (!text || text.length > 500_000) return null;
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return null;
    if (value.interrupted === true) return "pending";
    if (!isResearchReceipt(value.receipt)) return null;
    const returned = JSON.stringify(cleanResearchReceipt(value.receipt));
    return confirmed?.project.researchReceipts?.some((receipt) => JSON.stringify(cleanResearchReceipt(receipt)) === returned) ? null : "returned";
  } catch { return null; }
}

export default function WorkspaceContinuity({ snapshot, syncPhase, storageKey, recoveryRefreshKey, onAction, onDismiss, onRecover, onRecoverDiscovery, onRecoverBrandResearch, onEditProfile, onManageQuestions, findings }: Props) {
  const [confirmed, setConfirmed] = useState<WorkspaceSnapshot | null>(() => syncPhase === "saved" ? snapshot : null);
  if (syncPhase === "saved" && confirmed !== snapshot) setConfirmed(snapshot);
  const [recovery, setRecovery] = useState<"pending" | "returned" | null>(null);
  const [brandRecovery, setBrandRecovery] = useState<"pending" | "returned" | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const refresh = () => { setRecovery(browserRecovery(storageKey)); setBrandRecovery(brandReviewRecovery(storageKey, confirmed)); };
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [storageKey, recoveryRefreshKey, confirmed]);
  const sameProject = confirmed?.project.brand.trim().toLowerCase() === snapshot.project.brand.trim().toLowerCase() && normalizeDomain(confirmed?.project.domain ?? "") === normalizeDomain(snapshot.project.domain);
  const data = confirmed && sameProject ? deriveWorkspaceContinuity(confirmed) : { steps: [], recent: [], dismissedCount: 0 };
  const blocked = syncPhase !== "saved";
  async function dismiss(id: string | null) {
    if (saving || blocked) return;
    setSaving(id ?? "restore"); setError(""); setNotice("");
    try {
      if (!await onDismiss(id)) { setError("Suggestion preference not saved. Your previous suggestions remain visible. Review workspace synchronization before trying again."); return; }
      setNotice(id ? "Suggestion hidden. Saved work is unchanged." : "Suggestions restored for this brand.");
      requestAnimationFrame(() => heading.current?.focus());
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The preference could not be saved. Your previous suggestions remain visible."); }
    finally { setSaving(null); }
  }
  function stepCard(step: NextStep, first = false) {
    return <article className={`wc-step ${first ? "wc-primary" : ""}`} key={step.id} data-step-id={step.id}>
      <div><h3>{step.title}</h3><p>{step.detail}</p></div>
      <div className="wc-step-actions"><button className="button primary" type="button" disabled={blocked || Boolean(recovery) || Boolean(brandRecovery) || Boolean(saving)} onClick={() => onAction(step.action)}>{step.actionLabel}<ArrowRight size={14} /></button><button className="wc-hide" type="button" aria-label={`Hide suggestion: ${step.title}`} disabled={blocked || Boolean(saving)} onClick={() => void dismiss(step.id)}><EyeOff size={13} />Hide suggestion</button></div>
    </article>;
  }
  return <section className="workspace-continuity" aria-label="Workspace next steps and recent work">
    {blocked && <div className="wc-recovery" role="status"><CircleAlert size={18} /><div><h2>Resolve synchronization first</h2><p>{syncPhase === "saving" ? "Waiting for the server to acknowledge your changes. Guidance below still reflects the last acknowledged workspace." : "Your workspace has unacknowledged changes or a conflicting version. Review synchronization before using saved progress to choose the next step."}</p><button className="button" type="button" onClick={onRecover}>Review synchronization<ArrowRight size={13} /></button></div></div>}
    {brandRecovery && <div className="wc-recovery" aria-label="Brand research recovery"><CircleAlert size={18} /><div><h2>{brandRecovery === "pending" ? "Review interrupted brand research first" : "Finish reviewing your brand research"}</h2><p>{brandRecovery === "pending" ? "Your saved onboarding review contains a research request without an acknowledged result. Resume the original draft and check Treg activity before approving more research. Nothing will repeat automatically." : "Your onboarding review has returned research awaiting a saved profile. Resume the original draft to review its suggestions and save without purchasing the same research again."}</p><button className="button" type="button" disabled={blocked} onClick={onRecoverBrandResearch}>Resume brand research review<ArrowRight size={13} /></button></div></div>}
    {recovery && <div className="wc-recovery" aria-label="Discovery recovery"><CircleAlert size={18} /><div><h2>{recovery === "pending" ? "Review interrupted discovery first" : "Recover your returned research"}</h2><p>{recovery === "pending" ? "This browser recorded a discovery request without an acknowledged result. Open the original recovery view and check Treg activity before approving more research. Nothing will repeat automatically." : "This browser has returned research awaiting recovery. Review and save the existing receipt before buying the same research again."}</p><button className="button" type="button" onClick={onRecoverDiscovery}>Review discovery recovery<ArrowRight size={13} /></button></div></div>}
    <div className="wc-layout"><div className="wc-guidance"><div className="wc-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2 ref={heading} tabIndex={-1}>Your next step</h2></div>{data.dismissedCount > 0 && <button className="wc-restore" type="button" disabled={blocked || Boolean(saving)} onClick={() => void dismiss(null)}><RotateCcw size={13} />Restore hidden suggestions ({data.dismissedCount})</button>}</div>
      {data.steps[0] ? stepCard(data.steps[0], true) : <p className="wc-empty">{blocked ? "Recommendations resume when the saved workspace is confirmed." : data.dismissedCount ? "Your current suggestions are hidden. Restore them whenever you want to review the next step." : "No new suggestion from the saved evidence. Revisit recent work or review an audit when you are ready."}</p>}
      {data.steps.length > 1 && <details className="wc-more"><summary>{data.steps.length - 1} more saved-work {data.steps.length === 2 ? "suggestion" : "suggestions"}</summary>{data.steps.slice(1).map((step) => stepCard(step))}</details>}
      {error && <p className="wc-message wc-error" role="alert">{error}</p>}{notice && <p className="wc-message" role="status">{notice}</p>}
      {!blocked && !confirmed?.runs.some((run) => run.brand.trim().toLowerCase() === snapshot.project.brand.trim().toLowerCase() && normalizeDomain(run.domain) === normalizeDomain(snapshot.project.domain)) && <section className="wc-first-audit" aria-label="Set up your workspace"><p>Before your first answers:</p><div><button className="button" onClick={onEditProfile}>Edit brand profile</button><button className="button" onClick={onManageQuestions}>Manage buyer questions</button></div></section>}
    </div><section className="wc-recent" aria-label="Recent saved work"><div className="wc-heading"><div><span className="eyebrow">SAVED RECORDS</span><h2>Recent work</h2></div><span>{showOlder ? data.recent.length : Math.min(4, data.recent.length)} of {data.recent.length}</span></div>{blocked && <p className="wc-note">Showing the last acknowledged workspace.</p>}{data.recent.length ? <ol id="continuity-recent-records">{data.recent.slice(0, showOlder ? 12 : 4).map((item) => <li key={item.id}><button type="button" onClick={() => onAction(item.action)}><span className="wc-record"><strong>{item.title}</strong><span>{item.detail}</span><time dateTime={item.at}><Clock3 size={11} />{stamp(item.at)} UTC</time></span><ArrowRight size={14} /></button></li>)}</ol> : <p className="wc-empty">Saved research, audits, page plans and reports will appear here with their original dates.</p>}{data.recent.length > 4 && <button type="button" className="wc-restore wc-recent-toggle" aria-expanded={showOlder} aria-controls="continuity-recent-records" onClick={() => setShowOlder(!showOlder)}>{showOlder ? "Show fewer saved records" : `Show older saved work (${data.recent.length - 4})`}</button>}</section></div>
    {findings}
  </section>;
}
