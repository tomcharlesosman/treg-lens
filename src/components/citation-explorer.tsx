"use client";
/* eslint-disable @next/next/no-img-element -- static local engine marks */

import { useMemo, useState } from "react";
import { ArrowUpRight, FileSearch, Globe2 } from "lucide-react";
import type { AnswerResult } from "@/lib/aeo";
import { citationAnalytics, type CitationEvidence, type CitationOwnership } from "@/lib/citation-analytics";
import { ENGINES, type SavedRun } from "@/lib/workspace-data";
import "./citation-explorer.css";

type Source = { url: string; domain: string; title: string };
type Props = {
  /** Date/engine-filtered runs, with their original identity snapshots retained. */
  runs: SavedRun[];
  onAnswer: (answer: AnswerResult) => void;
  onResearch: (source: Source) => void;
};
const labels: Record<CitationOwnership, string> = { owned: "Your domain", competitor: "Competitor", other: "Other source", unknown: "Ownership unknown" };
const percent = (value: number) => `${Number(value.toFixed(1))}%`;

export default function CitationExplorer({ runs, onAnswer, onResearch }: Props) {
  const [group, setGroup] = useState<"domains" | "pages">("domains");
  const [ownership, setOwnership] = useState<CitationOwnership | "all">("all");
  const [domain, setDomain] = useState("");
  const all = useMemo(() => citationAnalytics(runs), [runs]);
  const filtered = useMemo(() => ownership === "all" ? all : citationAnalytics(runs, ownership), [runs, ownership, all]);
  const rows = group === "domains" ? filtered.domains : filtered.pages.filter((page) => !domain || page.domain === domain);
  const ownershipText = (values: CitationOwnership[]) => values.map((value) => labels[value]).join(" / ");
  function answers(evidence: CitationEvidence[]) {
    return <details className="ce-answers"><summary>View {evidence.length} saved {evidence.length === 1 ? "answer" : "answers"}</summary><ul>{evidence.map((row) => <li key={row.key}>
      <span className="ce-answer-context">{ENGINES.find((engine) => engine.id === row.answer.engine)?.name} · {new Date(row.answer.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {labels[row.ownership]}{row.owner ? `: ${row.owner}` : ""}</span>
      <strong>{row.answer.prompt}</strong><button type="button" className="button" onClick={() => onAnswer(row.answer)}>Read saved answer</button>
    </li>)}</ul></details>;
  }
  function research(source: Source) {
    return <button type="button" className="button source-research-button" onClick={() => onResearch(source)}><FileSearch size={12} />Research</button>;
  }
  return <section className="citation-explorer" aria-label="Citation explorer">
    <div className="ce-controls"><div className="ce-toggle" role="group" aria-label="Group citations"><button type="button" className={group === "domains" ? "active" : ""} aria-pressed={group === "domains"} onClick={() => { setGroup("domains"); setDomain(""); }}>Domains</button><button type="button" className={group === "pages" ? "active" : ""} aria-pressed={group === "pages"} onClick={() => { setGroup("pages"); setDomain(""); }}>Pages</button></div><label>Ownership<select aria-label="Filter citations by ownership" value={ownership} onChange={(event) => setOwnership(event.target.value as CitationOwnership | "all")}><option value="all">All sources</option><option value="owned">Your domain</option><option value="competitor">Competitor</option><option value="other">Other sources</option><option value="unknown">Ownership unknown</option></select></label>{domain && <button type="button" className="button" onClick={() => setDomain("")}>Show all pages</button>}<div className="ce-stats" role="group" aria-label="Citation summary"><span><strong>{all.domains.length}</strong> source {all.domains.length === 1 ? "domain" : "domains"}</span><span><strong>{all.pages.length}</strong> cited {all.pages.length === 1 ? "page" : "pages"}</span><span><strong>{all.answered}</strong> answered {all.answered === 1 ? "check" : "checks"}</span></div></div>
    {domain && <p className="ce-scope" role="status">Pages on {domain}</p>}
    <div className="panel table-panel ce-table"><table aria-label="Saved citation evidence"><thead><tr><th>{group === "domains" ? "SOURCE DOMAIN" : "CITED PAGE"}</th><th>ANSWERS CITING</th><th>COVERAGE</th><th>QUESTIONS / ENGINES</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((row) => {
      const page = "url" in row ? row : row.pages.length === 1 ? row.pages[0] : null;
      return <tr key={"url" in row ? row.url : row.domain}><td><div className="source-domain"><span className="source-icon"><Globe2 size={17} /></span><div><strong>{"url" in row ? row.title : row.domain}</strong><small>{ownershipText(row.ownerships)}{!("url" in row) && ` · ${row.pages.length} cited ${row.pages.length === 1 ? "page" : "pages"}`}</small>{"url" in row && <a className="ce-page-address" href={row.url} target="_blank" rel="noopener noreferrer">{row.url}</a>}</div></div>{answers(row.evidence)}</td><td>{row.answerCount}<span className="muted"> / {all.answered}</span></td><td><b>{percent(row.coverage)}</b></td><td><span className="ce-question-count">{row.promptCount} {row.promptCount === 1 ? "question" : "questions"}</span><div className="ce-engine-counts">{ENGINES.filter((engine) => row.engineCounts[engine.id]).map((engine) => <span key={engine.id} title={`${engine.name}: ${row.engineCounts[engine.id]}`}><img src={`/engines/${engine.id}.svg`} alt="" width={14} height={14} /><span className="visually-hidden">{engine.name}: </span>{row.engineCounts[engine.id]}</span>)}</div></td><td><div className="ce-row-actions">{page ? <><a className="icon-button" href={page.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${group === "domains" ? page.domain : page.url}`}><ArrowUpRight size={16} /></a>{research(page)}</> : <button type="button" className="button" onClick={() => { setGroup("pages"); setDomain(row.domain); }}>View {"pages" in row ? row.pages.length : 0} pages</button>}</div></td></tr>;
    })}</tbody></table>{!rows.length && <div className="ce-empty"><h3>{all.answered ? "No citations match this view" : "Find out what AI is reading"}</h3><p>{all.answered ? "Choose another ownership filter or collect more answers. An answer without citations is not proof that no sources were used." : "Cited sources will appear here after an audit."}</p></div>}</div>
    {all.unsafeCitations > 0 && <p className="ce-warning">{all.unsafeCitations} unsupported citation {all.unsafeCitations === 1 ? "link is" : "links are"} excluded from this explorer. The original saved answers remain available in audit history.</p>}
    <section className="panel ce-brand-panel" aria-label="Independent mention and citation rates"><div className="ce-brand-heading"><span className="eyebrow">SEPARATE SIGNALS</span><h3>Brand mentions and domain citations</h3><p>A brand can be mentioned without its website being cited.</p></div><div className="ce-table"><table><thead><tr><th>BRAND AT AUDIT TIME</th><th>SNAPSHOT DOMAIN</th><th>MENTIONED</th><th>DOMAIN CITED</th></tr></thead><tbody>{all.brands.map((brand) => <tr key={brand.key}><td><strong>{brand.name}</strong><small className="ce-brand-role">{brand.role === "owned" ? "Your brand" : "Configured competitor"}</small></td><td>{brand.domain || <span className="ce-unknown">Not captured</span>}</td><td>{brand.mentioned} / {brand.answered} <span className="muted">({percent(brand.mentionRate)})</span></td><td>{brand.cited === null ? <span className="ce-unknown">Unknown · no saved domain</span> : <>{brand.cited} / {brand.answered} <span className="muted">({percent(brand.citationRate!)})</span></>}</td></tr>)}</tbody></table>{!all.brands.length && <p className="ce-note">Collect an approved audit to compare these signals.</p>}</div></section>
  </section>;
}
