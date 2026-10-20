import type { AnswerResult, AuditInput, Engine } from "./aeo";
import { ENGINES } from "./aeo";
import type { Project, SavedRun } from "./workspace-data";
import { normalizeDomain } from "./workspace-data";
import { classifyPrompt, legacyPromptId, type PromptKind, type PromptRecord } from "./prompt-library";

export type MeasurementScope = {
  version: 1;
  market: { country: "US"; language: "en" };
  brand: { name: string; domain: string };
  prompts: { id: string; text: string; kind: PromptKind }[];
  collectors: { engine: Engine; sourceKind: "web-interface" | "model-api"; provider: string; model: string }[];
};
export const MIN_TREND_COVERAGE = 0.9;
const collector = (engine: Engine): MeasurementScope["collectors"][number] => ({
  engine, sourceKind: engine === "perplexity" ? "model-api" : "web-interface",
  provider: engine === "perplexity" ? "dataforseo" : "cloro",
  model: engine === "perplexity" ? "sonar-default-unreported" : "web-interface-default-unreported",
});
export function buildMeasurementScope(input: AuditInput, records?: PromptRecord[]): MeasurementScope {
  return { version: 1, market: { country: "US", language: "en" }, brand: { name: input.brand, domain: normalizeDomain(input.domain) },
    prompts: input.prompts.map((text) => { const record = records?.find((item) => item.text === text); return { id: record?.id ?? legacyPromptId(text), text, kind: record?.kind ?? classifyPrompt(text, input) }; }),
    collectors: [...new Set(input.engines)].map(collector),
  };
}
export function validateMeasurementScope(value: unknown): value is MeasurementScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as MeasurementScope;
  if (scope.version !== 1 || !scope.market || scope.market.country !== "US" || scope.market.language !== "en" || !scope.brand || typeof scope.brand.name !== "string" || !scope.brand.name.trim() || scope.brand.name.length > 100 || typeof scope.brand.domain !== "string" || !scope.brand.domain || scope.brand.domain.length > 300 || !Array.isArray(scope.prompts) || !scope.prompts.length || scope.prompts.length > 8 || !Array.isArray(scope.collectors) || !scope.collectors.length || scope.collectors.length > 4) return false;
  const ids = new Set<string>(), texts = new Set<string>(), engines = new Set<string>();
  return scope.prompts.every((p) => { if (!p || typeof p.id !== "string" || !p.id || p.id.length > 100 || ids.has(p.id) || typeof p.text !== "string" || !p.text.trim() || p.text.length > 500 || texts.has(p.text) || !["neutral", "branded"].includes(p.kind)) return false; ids.add(p.id); texts.add(p.text); return true; }) &&
    scope.collectors.every((c) => { if (!c || !ENGINES.includes(c.engine) || engines.has(c.engine) || !["web-interface", "model-api"].includes(c.sourceKind) || [c.provider, c.model].some((v) => typeof v !== "string" || !v.trim() || v.length > 100)) return false; engines.add(c.engine); return true; });
}

type ScopedRun = SavedRun & { measurement?: MeasurementScope };
export type MeasurementFilter = { engine?: string; kind?: "all" | PromptKind };
export type RunMeasurement = {
  run: SavedRun; scope: MeasurementScope; scopeKey: string; recorded: boolean;
  requested: number; answered: number; missing: number; coverage: number; answers: AnswerResult[];
  mentionRate: number | null; citationRate: number | null; comparable: boolean;
};
function legacyScope(run: SavedRun): MeasurementScope {
  const prompts = [...new Set(run.prompts?.length ? run.prompts : [...run.results.map((r) => r.prompt), ...run.errors.map((r) => r.prompt)])];
  const engines = [...new Set(run.engines?.length ? run.engines : [...run.results.map((r) => r.engine), ...run.errors.map((r) => r.engine).filter((e): e is Engine => ENGINES.includes(e as Engine))])];
  return { ...buildMeasurementScope({ ...run, prompts, engines, competitors: run.competitors ?? [] }), collectors: engines.map((engine) => ({ ...collector(engine), model: "legacy-unrecorded" })) };
}
export function measurementScopeKey(scope: MeasurementScope, filter: MeasurementFilter = {}): string {
  const prompts = scope.prompts.filter((p) => !filter.kind || filter.kind === "all" || p.kind === filter.kind);
  const collectors = scope.collectors.filter((c) => !filter.engine || filter.engine === "all" || c.engine === filter.engine);
  return JSON.stringify({ version: scope.version, market: scope.market, brand: { name: scope.brand.name.toLowerCase(), domain: normalizeDomain(scope.brand.domain) },
    prompts: prompts.map((p) => [p.id, p.text, p.kind]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    collectors: collectors.map((c) => [c.engine, c.sourceKind, c.provider, c.model]).sort((a, b) => a[0].localeCompare(b[0])),
  });
}
function matchingAnswer(result: AnswerResult, scope: MeasurementScope): boolean {
  const c = scope.collectors.find((item) => item.engine === result.engine);
  return Boolean(c && (!result.sourceKind || result.sourceKind === c.sourceKind) && (!result.provider || result.provider === c.provider));
}
export function measureRun(run: ScopedRun, filter: MeasurementFilter = {}): RunMeasurement {
  const recorded = validateMeasurementScope(run.measurement);
  const scope = recorded ? run.measurement! : legacyScope(run);
  const prompts = scope.prompts.filter((p) => !filter.kind || filter.kind === "all" || filter.kind === p.kind);
  const collectors = scope.collectors.filter((c) => !filter.engine || filter.engine === "all" || filter.engine === c.engine);
  const answers: AnswerResult[] = [];
  for (const p of prompts) for (const c of collectors) {
    const answer = run.results.filter((r) => r.prompt === p.text && r.engine === c.engine && r.answer.trim() && matchingAnswer(r, scope)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id))[0];
    if (answer) answers.push(answer);
  }
  const requested = prompts.length * collectors.length, answered = answers.length;
  const ownHost = normalizeDomain(scope.brand.domain);
  return { run, scope, scopeKey: measurementScopeKey(scope, filter), recorded, requested, answered, answers, missing: requested - answered, coverage: requested ? answered / requested : 0,
    mentionRate: answered ? 100 * answers.filter((r) => r.brandMentioned).length / answered : null,
    citationRate: answered ? 100 * answers.filter((r) => r.citations.some((c) => { const host = normalizeDomain(c.url); return host === ownHost || host.endsWith(`.${ownHost}`); })).length / answered : null,
    comparable: recorded && requested > 0 && answered / requested >= MIN_TREND_COVERAGE,
  };
}
export function comparableTrend(runs: SavedRun[], project: Pick<Project, "brand" | "domain">, filter: MeasurementFilter = {}) {
  const measured = runs.filter((run) => run.brand.toLowerCase() === project.brand.toLowerCase() && normalizeDomain(run.domain) === normalizeDomain(project.domain)).map((run) => measureRun(run, filter)).filter((item) => item.requested > 0).sort((a, b) => Date.parse(a.run.completedAt) - Date.parse(b.run.completedAt) || a.run.id.localeCompare(b.run.id));
  const latest = measured.at(-1);
  const cohort = latest ? measured.filter((item) => item.scopeKey === latest.scopeKey) : [];
  const days = new Map<string, RunMeasurement>();
  for (const item of cohort) days.set(new Date(item.run.completedAt).toISOString().slice(0, 10), item);
  const points = [...days.values()];
  const previous = points.length > 1 ? points.at(-2) : undefined;
  const delta = latest?.comparable && previous?.comparable ? { mentions: latest.mentionRate! - previous.mentionRate!, citations: latest.citationRate! - previous.citationRate! } : null;
  return { latest, previous, points, measured, excluded: measured.length - cohort.length, delta };
}

/** Preserve recorded evidence while stripping unknown imported properties. */
export function cleanMeasurementScope(scope: MeasurementScope): MeasurementScope {
  return { version: 1, market: { country: scope.market.country, language: scope.market.language }, brand: { name: scope.brand.name, domain: scope.brand.domain },
    prompts: scope.prompts.map((p) => ({ id: p.id, text: p.text, kind: p.kind })),
    collectors: scope.collectors.map((c) => ({ engine: c.engine, sourceKind: c.sourceKind, provider: c.provider, model: c.model })),
  };
}

/** Only a competitor explicitly configured on a saved audit has an observed identity. */
export function competitorMeasurementIdentity(run: SavedRun, brand: string): string | null {
  const name = brand.trim().toLowerCase();
  if (!run.competitors?.some((candidate) => candidate.trim().toLowerCase() === name)) return null;
  const detail = run.competitorDetails?.find((item) => item.name.trim().toLowerCase() === name);
  return JSON.stringify([name, detail?.domain ? normalizeDomain(detail.domain) : null]);
}

/** Unknown or changed competitor identities form gaps, never invented zeroes. */
export function competitorMentionRate(point: RunMeasurement, reference: RunMeasurement, brand: string): number | null {
  const identity = competitorMeasurementIdentity(reference.run, brand);
  if (!identity || competitorMeasurementIdentity(point.run, brand) !== identity || point.scopeKey !== reference.scopeKey || point.coverage < MIN_TREND_COVERAGE || !point.answered) return null;
  return 100 * point.answers.filter((answer) => answer.mentionedBrands.some((name) => name.trim().toLowerCase() === brand.trim().toLowerCase())).length / point.answered;
}
