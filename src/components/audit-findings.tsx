"use client";

import { ArrowRight, ArrowUpRight, CircleAlert, FileSearch } from "lucide-react";
import type { AnswerResult } from "@/lib/aeo";
import { auditFindings } from "@/lib/audit-findings";
import type { SavedRun } from "@/lib/workspace-data";
import "./audit-findings.css";

export default function AuditFindings({ run, onAnswer, onRun }: {
  run: SavedRun;
  onAnswer: (answer: AnswerResult) => void;
  onRun: () => void;
}) {
  const evidence = auditFindings(run);
  return <section className="audit-findings" aria-label="Latest audit findings">
    <div className="af-heading"><div><span className="af-eyebrow">FROM YOUR SAVED ANSWERS</span><h2>Your next move, with evidence.</h2></div><button className="button" onClick={onRun}>Review this audit <ArrowRight size={14} /></button></div>
    <div className="af-coverage"><strong>{evidence.answered} of {evidence.requested} requested answers collected</strong><span>Latest saved audit · {new Date(run.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · United States / English</span></div>
    {(evidence.missing > 0 || run.totalCostKnown === false) && <p className="af-notice"><CircleAlert size={16} /><span>{evidence.missing > 0 ? "Missing answers are not evidence that your brand was absent. " : ""}{run.totalCostKnown === false ? "The final charge is not fully confirmed. Check Treg activity before repeating work." : "Review incomplete requests before deciding on another audit."}</span></p>}
    {evidence.findings.length ? <div className="af-grid">{evidence.findings.map((finding) => <article key={finding.kind} className="af-card"><span className="af-kind"><FileSearch size={14} />{finding.kind === "competitor" ? "COMPETITOR GAP" : finding.kind === "source" ? "CITED SOURCE" : finding.kind === "question" ? "QUESTION TO REVIEW" : "BRAND PRESENCE"}</span><h3>{finding.title}</h3><p>{finding.detail}</p><p className="af-next">{finding.nextStep}</p><div className="af-actions"><button className="button" onClick={() => onAnswer(finding.answer)}>View answer evidence <ArrowRight size={13} /></button>{finding.sourceUrl && <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer">Open cited page <ArrowUpRight size={13} /></a>}</div></article>)}</div> : <p className="af-empty">No answer evidence is available yet. The saved run retains its errors and cost information for review.</p>}
    <p className="af-footnote">Findings describe this audit’s observations. They suggest what to investigate; they do not promise a ranking or traffic improvement.</p>
  </section>;
}
