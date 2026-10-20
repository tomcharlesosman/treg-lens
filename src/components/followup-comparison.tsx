"use client";

import { useId } from "react";
import { ArrowUpRight, ChevronDown, CircleAlert, GitCompareArrows } from "lucide-react";
import type { AnswerResult, Engine } from "@/lib/aeo";
import { comparePagePlanRuns, type PagePlan } from "@/lib/page-plans";
import { measureRun, type RunMeasurement } from "@/lib/measurement";
import { ENGINES, normalizeDomain, type SavedRun } from "@/lib/workspace-data";
import AnswerBody from "./answer-body";
import "./followup-comparison.css";

type Props = {
  plan: PagePlan;
  runs: SavedRun[];
  onSelectFollowup: (runId?: string) => void;
  disabled?: boolean;
};

const date = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const percent = (value: number | null) => value === null ? "Unknown" : `${Number(value.toFixed(1))}%`;
const points = (value: number) => `${value > 0 ? "+" : ""}${Number(value.toFixed(1))} pp`;
function safeLink(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function AnswerEvidence({ answer }: { answer: AnswerResult }) {
  return <div className="fc-answer">
    <p className="fc-answer-meta">Collected {date(answer.completedAt)} UTC · {answer.brandMentioned ? "Brand mentioned" : "Brand not mentioned"}</p>
    <AnswerBody answer={answer.answer} />
    <div className="fc-citations"><strong>Original citations</strong>{answer.citations.length ? <ul>{answer.citations.map((citation, index) => {
      const href = safeLink(citation.url);
      return <li key={`${citation.url}:${index}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.title || citation.url}<ArrowUpRight size={12} /><span>{citation.url}</span></a> : <span>Unsupported citation link: {citation.title || "Untitled source"}</span>}</li>;
    })}</ul> : <p>No citations were returned.</p>}</div>
  </div>;
}

function ComparisonSide({ label, point, engine, question }: { label: string; point?: RunMeasurement; engine: Engine; question: string }) {
  const collector = point?.scope.collectors.find((item) => item.engine === engine);
  const answer = point?.answers.find((item) => item.engine === engine && item.prompt === question);
  const errors = point?.run.errors.filter((item) => item.engine === engine && item.prompt === question) ?? [];
  return <section className="fc-side" aria-label={`${label} ${ENGINES.find((item) => item.id === engine)?.name} answer`}>
    <div className="fc-side-heading"><strong>{label}</strong><span>{point ? `${date(point.run.completedAt)} UTC` : "No saved audit selected"}</span></div>
    {collector && <p className="fc-collector">{collector.sourceKind === "model-api" ? "Model API" : "Web interface"} · {collector.provider} · {collector.model}</p>}
    {answer ? <AnswerEvidence answer={answer} /> : <p className="fc-empty-answer">{!point ? "Select a saved follow-up to inspect its answer." : !collector || !point.scope.prompts.some((item) => item.text === question) ? "This question and engine were not requested in this audit." : "No nonblank answer was collected. Missing evidence is not brand absence."}</p>}
    {errors.length > 0 && <div className="fc-errors"><strong>Original collection errors</strong><ul>{errors.map((error, i) => <li key={i}>{error.error}</li>)}</ul></div>}
  </section>;
}

export default function FollowupComparison({ plan, runs, onSelectFollowup, disabled }: Props) {
  const id = useId();
  const comparison = comparePagePlanRuns(plan, runs);
  const candidates = runs.filter((run) => run.id !== plan.baselineRunId && run.brand.toLowerCase() === plan.brand.name.toLowerCase() && normalizeDomain(run.domain) === normalizeDomain(plan.brand.domain)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const { baseline, followup } = comparison;
  const engines = [...new Set([...(baseline?.scope.collectors.map((item) => item.engine) ?? []), ...(followup?.scope.collectors.map((item) => item.engine) ?? [])])];
  return <section className="followup-comparison" aria-label="Follow-up comparison">
    <div className="fc-heading"><GitCompareArrows size={20} /><div><h3>Compare the saved evidence</h3><p>Read original answers for this buyer question. Selecting an audit makes no provider call.</p></div></div>
    <label className="lens-dialog-field" htmlFor={`${id}-followup`}>Saved follow-up audit<span className="fc-select"><select id={`${id}-followup`} value={plan.followupRunId ?? ""} onChange={(event) => onSelectFollowup(event.target.value || undefined)} disabled={disabled}>
      <option value="">Select a saved audit</option>
      {plan.followupRunId && !candidates.some((run) => run.id === plan.followupRunId) && <option value={plan.followupRunId}>Selected audit is no longer available</option>}
      {candidates.map((run) => { const point = measureRun(run); return <option key={run.id} value={run.id}>{date(run.completedAt)} UTC · {point.answered}/{point.requested} answers · {run.id.slice(0, 12)}</option>; })}
    </select><ChevronDown size={15} aria-hidden="true" /></span></label>
    <div className="fc-measures" aria-label="Full audit coverage and rates">{[{ label: "Baseline", point: baseline }, { label: "Follow-up", point: followup }].map(({ label, point }) => <div key={label}><strong>{label}</strong><span>{point ? `${point.answered} / ${point.requested} answers · ${percent(point.coverage * 100)} coverage` : "Evidence unavailable"}</span><span>Mentions {percent(point?.mentionRate ?? null)} · Own citations {percent(point?.citationRate ?? null)}</span></div>)}</div>
    <p className="fc-note">Rates cover the entire frozen audit scope. The answer panels below show this plan’s question. Model labels ending in “unreported” do not identify a pinned underlying model.</p>
    {comparison.comparable && comparison.delta ? <div className="fc-compatible" role="status"><strong>Comparable saved audits</strong><span>Brand mentions {points(comparison.delta.mentions)} · Own-domain citations {points(comparison.delta.citations)}</span><p>Matching recorded scope and at least 90% coverage. This observed change does not prove the page edit caused it.</p></div> : <div className="fc-warning"><CircleAlert size={16} /><div><strong>No comparable change yet</strong><ul>{comparison.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><p>Original evidence remains available to inspect; no progress delta is inferred.</p></div></div>}
    {engines.map((engine) => <div className="fc-engine" key={engine}><h4>{ENGINES.find((item) => item.id === engine)?.name}</h4><div className="fc-answer-grid"><ComparisonSide label="Baseline" point={baseline} engine={engine} question={plan.question.text} /><ComparisonSide label="Follow-up" point={followup} engine={engine} question={plan.question.text} /></div></div>)}
  </section>;
}
