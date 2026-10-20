"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CircleHelp } from "lucide-react";
import { comparableTrend, competitorMeasurementIdentity, competitorMentionRate, MIN_TREND_COVERAGE } from "@/lib/measurement";
import type { PromptKind } from "@/lib/prompt-library";
import { ENGINES, type Project, type SavedRun } from "@/lib/workspace-data";
import "./visibility-trends.css";

const colors = ["#118453", "#7d7db2", "#d2a65f", "#4791a1"];
const pct = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function VisibilityTrends({ runs, project, engine, onEngine, onRun }: {
  runs: SavedRun[]; project: Project; engine: string;
  onEngine?: (engine: string) => void; onRun?: () => void;
}) {
  const [kind, setKind] = useState<"all" | PromptKind>("all");
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const trend = useMemo(() => comparableTrend(runs, project, { engine, kind }), [runs, project, engine, kind]);
  const brands = [project.brand, ...project.competitors.slice(0, 3)];
  const eligible = trend.latest && trend.latest.coverage >= MIN_TREND_COVERAGE;
  const selected = trend.points[hover ?? trend.points.length - 1];
  const values = brands.map((brand, index) => trend.points.map((point) => point.coverage < MIN_TREND_COVERAGE ? null : index === 0 ? point.mentionRate : trend.latest ? competitorMentionRate(point, trend.latest, brand) : null));
  const x = (i: number) => trend.points.length > 1 ? 20 + i / (trend.points.length - 1) * 600 : 320;
  const y = (value: number) => 180 - value * 1.6;
  return <section className="panel trend-panel reliable-trends" aria-label="Comparable visibility trends">
    <div className="panel-heading"><div><h2>Visibility over time <CircleHelp size={14} aria-hidden="true" /></h2><p>Compare the same questions, collection settings and market.</p></div><div className="rt-filters"><select aria-label="Filter chart by engine" value={engine} onChange={(event) => onEngine?.(event.target.value)}><option value="all">All engines</option>{ENGINES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label="Filter trends by question type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">All questions</option><option value="neutral">Neutral questions</option><option value="branded">Branded questions</option></select></div></div>
    {!trend.latest ? <div className="rt-empty"><h3>Your baseline starts here</h3><p>{runs.length ? "No saved run requested this question and engine selection. Choose another filter or collect a new baseline." : "Run your first audit to see how AI talks about your brand."}</p>{onRun && <button className="button primary" onClick={onRun}>Run an audit <ArrowRight size={14} /></button>}</div> : <>
      <div className="rt-metrics"><div><strong data-testid="trend-mention-rate">{eligible ? pct(trend.latest.mentionRate) : "—"}</strong><span>Mention rate</span></div><div><strong data-testid="trend-citation-rate">{eligible ? pct(trend.latest.citationRate) : "—"}</strong><span>Own-domain citation rate</span></div><div className="rt-coverage"><strong>{trend.latest.answered} / {trend.latest.requested}</strong><span>Answers collected · {(trend.latest.coverage * 100).toFixed(0)}% coverage</span></div></div>
      <p className="rt-comparison" data-testid="trend-comparison">{trend.delta ? `${trend.delta.mentions >= 0 ? "+" : ""}${trend.delta.mentions.toFixed(1)} percentage points in mentions · ${trend.delta.citations >= 0 ? "+" : ""}${trend.delta.citations.toFixed(1)} in citations versus the previous comparable day.` : !eligible ? "Comparison unavailable: at least 90% answer coverage is required. Missing answers are not brand absence." : !trend.latest.recorded ? "Legacy evidence: collection settings were not recorded. Collect a new baseline before comparing change." : "Baseline only: another day with the same scope and at least 90% coverage is needed for a change comparison."}</p>
      <div className="rt-scope">United States / English · {trend.latest.scope.prompts.filter((p) => kind === "all" || p.kind === kind).length} questions · {trend.latest.scope.collectors.filter((c) => engine === "all" || c.engine === engine).length} engines · latest finished run per UTC day{trend.excluded > 0 && <span>{trend.excluded} run{trend.excluded === 1 ? " has" : "s have"} a different scope and {trend.excluded === 1 ? "is" : "are"} excluded from this comparison.</span>}</div>
      <div className="rt-chart"><svg viewBox="0 0 640 200" role="img" aria-label="Brand mention rate trend" onMouseMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(trend.points.length - 1, Math.round((event.clientX - bounds.left) / bounds.width * (trend.points.length - 1))))); }} onMouseLeave={() => setHover(null)}>
        <title>Comparable mention rates. Gaps indicate less than 90% coverage; table below contains values.</title>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1="20" y1={y(v)} x2="620" y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" /><text x="0" y={y(v) - 3} fill="var(--muted)" fontSize="9">{v}</text></g>)}
        {brands.map((brand, bi) => !hidden.includes(brand) && <g key={brand} data-testid={`trend-series-${brand}`}>{values[bi].map((value, i) => value === null ? null : <g key={trend.points[i].run.id}>{i > 0 && values[bi][i - 1] !== null && trend.points[i].recorded && trend.points[i - 1].recorded && <line x1={x(i - 1)} y1={y(values[bi][i - 1]!)} x2={x(i)} y2={y(value)} stroke={colors[bi]} strokeWidth={bi ? 1.5 : 2.5} strokeDasharray={bi ? "4 4" : undefined} />}<circle cx={x(i)} cy={y(value)} r="4" fill={colors[bi]} /></g>)}</g>)}
      </svg>{hover !== null && selected && <div className="chart-tooltip rt-tooltip"><b>{date(selected.run.completedAt)}</b><span>{selected.answered}/{selected.requested} answers · {pct(selected.mentionRate)} observed mentions</span></div>}</div>
      <div className="rt-dates">{trend.points.length > 1 && <span>{date(trend.points[0].run.completedAt)}</span>}<span>{date(trend.points.at(-1)!.run.completedAt)}</span></div>
      <div className="chart-legend">{brands.map((brand, i) => <button key={brand} aria-label={brand} title={i === 0 ? "Your saved brand" : trend.latest && competitorMeasurementIdentity(trend.latest.run, brand) ? "Saved competitor identity; gaps indicate changed or unrecorded identity" : "Competitor was not configured in the latest saved audit; no observations shown"} aria-pressed={!hidden.includes(brand)} className={hidden.includes(brand) ? "muted-legend" : ""} onClick={() => setHidden((old) => old.includes(brand) ? old.filter((value) => value !== brand) : [...old, brand])}><i style={{ background: colors[i] }} />{brand}{i === 0 && <span>You</span>}</button>)}</div>
      <details className="rt-evidence"><summary>Inspect trend scope and observations</summary><p>Rates use answered requests, counting one answer per question and engine. A failed or empty response is missing evidence. The chart uses the latest run for each UTC day in the latest scope; repeated runs never receive extra daily weight. Question types start from whether wording names the brand, its website or a competitor; reviewed library labels can override that classification. Competitor lines require the same saved name and domain as the latest audit; unconfigured or changed identities are gaps. When both saved domains are unknown, the line measures the configured name only. Current profile changes never rewrite historical identities. Collector routes are recorded; underlying provider model versions are unreported and may change.</p><div className="rt-table"><table><caption>Saved audit observations for the selected questions and engines</caption><thead><tr><th>Date (UTC)</th><th>Coverage</th><th>Mentions</th><th>Citations</th><th>Scope</th></tr></thead><tbody>{[...trend.measured].reverse().map((point) => <tr key={point.run.id}><td>{date(point.run.completedAt)} {new Date(point.run.completedAt).toISOString().slice(11, 16)}</td><td>{point.answered}/{point.requested}</td><td>{pct(point.mentionRate)}</td><td>{pct(point.citationRate)}</td><td>{point.scopeKey !== trend.latest!.scopeKey ? "Different scope" : !point.recorded ? "Legacy, unrecorded collector" : !point.comparable ? "Below 90% coverage" : "Matching scope"}</td></tr>)}</tbody></table></div><p>Current scope: {trend.latest.scope.prompts.filter((p) => kind === "all" || p.kind === kind).map((p) => p.text).join(" · ")}</p></details>
    </>}
  </section>;
}
