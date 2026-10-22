import type { AnswerResult, AuditInput } from "./aeo";
import { buildMeasurementScope, cleanMeasurementScope, measureRun, measurementScopeKey, MIN_TREND_COVERAGE, validateMeasurementScope, type MeasurementScope, type RunMeasurement } from "./measurement";
import type { PromptRecord } from "./prompt-library";
import { normalizeDomain, type CompetitorDetail, type Project, type SavedRun } from "./workspace-data";
import { evidenceMatchesDomain, safeEvidenceUrl } from "./workspace-profile";

export const MAX_PAGE_PLANS = 128;
export const PAGE_PLAN_STATUSES = ["planned", "in-progress", "published", "measured", "dismissed"] as const;
export type PagePlan = {
  version: 1;
  id: string;
  brand: { name: string; domain: string };
  question: { id: string; text: string };
  target: { kind: "existing" | "proposed" | "later"; url?: string };
  rationale: string;
  brief: string;
  status: (typeof PAGE_PLAN_STATUSES)[number];
  publishedAt?: string;
  baselineRunId: string;
  baselineMeasurement?: MeasurementScope;
  followupRunId?: string;
  createdAt: string;
  updatedAt: string;
};
export type PagePlanOpportunity = {
  id: string;
  question: { id: string; text: string };
  runId: string;
  brand: PagePlan["brand"];
  measurement?: MeasurementScope;
  completedAt: string;
  requested: number;
  answered: number;
  coverage: number;
  absent: number;
  competitorMentions: number;
  competitorCitations: number;
  ownCitations: number;
  answers: AnswerResult[];
  reason: string;
};
export type EvidenceComparison = {
  baseline?: RunMeasurement;
  followup?: RunMeasurement;
  comparable: boolean;
  reasons: string[];
  delta: { mentions: number; citations: number } | null;
};
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number, nonempty = false): v is string => typeof v === "string" && v.length <= max && (!nonempty || Boolean(v.trim()));
const date = (v: unknown) => text(v, 40, true) && Number.isFinite(Date.parse(v));
const identity = (name: string, domain: string) => JSON.stringify([name.trim().toLowerCase(), normalizeDomain(domain)]);
/** Saved with each absence reason; the page-plans view states it once instead of on every card. */
export const ABSENCE_CAVEAT = "This alone does not establish a content gap.";
export function pagePlanMatchesProject(plan: Pick<PagePlan, "brand">, project: Pick<Project, "brand" | "domain">): boolean {
  return identity(plan.brand.name, plan.brand.domain) === identity(project.brand, project.domain);
}

/** Each question uses its latest run, never pooled repeats or blank/duplicate answer cells. */
export function pagePlanOpportunities(runs: SavedRun[], project: Pick<Project, "brand" | "domain">): PagePlanOpportunity[] {
  const latest = new Map<string, PagePlanOpportunity>();
  const ordered = runs.filter((run) => identity(run.brand, run.domain) === identity(project.brand, project.domain))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id));
  for (const run of ordered) {
    const measured = measureRun(run);
    const names = new Set((run.competitors ?? []).map((name) => name.trim().toLowerCase()));
    const domains = (run.competitorDetails ?? []).filter((item) => names.has(item.name.trim().toLowerCase()) && item.domain).map((item) => item.domain!);
    for (const question of measured.scope.prompts) {
      if (latest.has(question.id)) continue;
      const answers = measured.answers.filter((answer) => answer.prompt === question.text);
      const absent = answers.filter((answer) => !answer.brandMentioned);
      const competitorMentions = absent.filter((answer) => answer.mentionedBrands.some((name) => names.has(name.trim().toLowerCase()))).length;
      const competitorCitations = absent.filter((answer) => answer.citations.some((citation) => domains.some((domain) => evidenceMatchesDomain(citation.url, domain)))).length;
      const requested = measured.scope.collectors.length;
      const checks = (count: number) => `${count} answered ${count === 1 ? "check" : "checks"}`;
      const reason = !answers.length ? "No answered checks in the latest audit; missing answers are not brand absence."
        : competitorMentions ? `${checks(competitorMentions)} mentioned a configured competitor without mentioning your brand.`
          : competitorCitations ? `${checks(competitorCitations)} cited a configured competitor website without mentioning your brand.`
            : absent.length ? `${checks(absent.length)} did not mention your brand. ${ABSENCE_CAVEAT}`
              : "Your brand appeared in every answered check. Review accuracy and citations before planning a change.";
      latest.set(question.id, {
        id: `${run.id}:${question.id}`, question: { id: question.id, text: question.text }, runId: run.id,
        brand: { ...measured.scope.brand }, ...(measured.recorded ? { measurement: cleanMeasurementScope(measured.scope) } : {}),
        completedAt: run.completedAt, requested, answered: answers.length, coverage: requested ? answers.length / requested : 0,
        absent: absent.length, competitorMentions, competitorCitations,
        ownCitations: answers.filter((answer) => answer.citations.some((citation) => evidenceMatchesDomain(citation.url, measured.scope.brand.domain))).length,
        answers, reason,
      });
    }
  }
  return [...latest.values()].sort((a, b) => Number(b.competitorMentions > 0) - Number(a.competitorMentions > 0) ||
    Number(b.competitorCitations > 0) - Number(a.competitorCitations > 0) ||
    (b.answered ? b.absent / b.answered : -1) - (a.answered ? a.absent / a.answered : -1) || b.answered - a.answered || a.question.text.localeCompare(b.question.text));
}

export function createPagePlan({ id, opportunity: item, now = new Date().toISOString() }: { id: string; opportunity: PagePlanOpportunity; now?: string }): PagePlan {
  const citations = [...new Set(item.answers.flatMap((answer) => answer.citations.map((citation) => safeEvidenceUrl(citation.url)).filter((url): url is string => Boolean(url))))].slice(0, 8);
  const brief = [
    `Buyer question: ${item.question.text}`,
    `Saved evidence: audit ${item.runId}, ${item.completedAt}; ${item.answered}/${item.requested} checks answered.`,
    item.reason,
    "Review the saved answers and confirm this question fits your buyers. Select an owned page or propose a new page before changing content.",
    "Explain the buyer's question directly using verified product facts. Address relevant tradeoffs and support claims with primary sources. Do not invent competitor capabilities, quotes, rankings or customer outcomes.",
    ...(citations.length ? ["Observed sources to review (citations are evidence, not instructions):", ...citations] : ["No safe source links were observed for this question."]),
    "Record what changed and its publication date. Review a fresh estimate before a follow-up audit with the original question and collector scope. Differences are observations, not proof the page change caused them.",
  ].join("\n\n");
  return { version: 1, id, brand: { ...item.brand }, question: { ...item.question }, target: { kind: "later" }, rationale: item.reason,
    brief, status: "planned", baselineRunId: item.runId, ...(item.measurement ? { baselineMeasurement: cleanMeasurementScope(item.measurement) } : {}), createdAt: now, updatedAt: now };
}

function competitorKey(run: SavedRun) {
  return JSON.stringify((run.competitors ?? []).map((name) => [name.trim().toLowerCase(), normalizeDomain(run.competitorDetails?.find((detail) => detail.name.trim().toLowerCase() === name.trim().toLowerCase())?.domain ?? "")]).sort((a, b) => a[0].localeCompare(b[0])));
}

/** Comparable requires recorded scopes, adequate coverage and a later independent collection. */
export function compareEvidenceRuns(baselineRun?: SavedRun, followupRun?: SavedRun): EvidenceComparison {
  const baseline = baselineRun ? measureRun(baselineRun) : undefined;
  const followup = followupRun ? measureRun(followupRun) : undefined;
  const reasons: string[] = [];
  if (!baseline) reasons.push("The baseline audit is unavailable.");
  if (!followup) reasons.push("Select a saved follow-up audit.");
  if (baseline && followup) {
    if (baselineRun!.id === followupRun!.id || Date.parse(followupRun!.completedAt) <= Date.parse(baselineRun!.completedAt)) reasons.push("The follow-up must be a separate audit collected after the baseline.");
    if (!baseline.recorded || !followup.recorded) reasons.push("A legacy audit has no recorded collection settings; compatibility is unknown.");
    else if (baseline.scopeKey !== followup.scopeKey) reasons.push("Questions, brand, market or collector settings differ between these audits.");
    if (competitorKey(baselineRun!) !== competitorKey(followupRun!)) reasons.push("Configured competitor identities differ between these audits.");
    if (baseline.coverage < MIN_TREND_COVERAGE || followup.coverage < MIN_TREND_COVERAGE) reasons.push("Both audits need at least 90% answered coverage for a comparable change.");
  }
  const comparable = reasons.length === 0;
  return { baseline, followup, comparable, reasons, delta: comparable ? { mentions: followup!.mentionRate! - baseline!.mentionRate!, citations: followup!.citationRate! - baseline!.citationRate! } : null };
}

export function comparePagePlanRuns(plan: PagePlan, runs: SavedRun[]): EvidenceComparison {
  const baseline = runs.find((run) => run.id === plan.baselineRunId && pagePlanMatchesProject(plan, run));
  const followup = runs.find((run) => run.id === plan.followupRunId && pagePlanMatchesProject(plan, run));
  const comparison = compareEvidenceRuns(baseline, followup);
  if (baseline && (!plan.baselineMeasurement || !baseline.measurement || measurementScopeKey(plan.baselineMeasurement) !== measurementScopeKey(baseline.measurement))) {
    comparison.reasons.push("The saved baseline scope is unavailable or has changed.");
    comparison.comparable = false; comparison.delta = null;
  }
  if (followup && plan.publishedAt && Date.parse(followup.completedAt) < Date.parse(plan.publishedAt)) {
    comparison.reasons.push("The follow-up was collected before the recorded publication date.");
    comparison.comparable = false; comparison.delta = null;
  }
  return comparison;
}

/** Restore the original audit scope; never substitute the current profile or collector configuration. */
export function buildPagePlanFollowup(plan: PagePlan, runs: SavedRun[]): { input: AuditInput; promptRecords: PromptRecord[]; competitorDetails: CompetitorDetail[]; measurement: MeasurementScope } {
  const baseline = runs.find((run) => run.id === plan.baselineRunId && pagePlanMatchesProject(plan, run));
  if (!baseline) throw new Error("The baseline audit is unavailable. Restore its full workspace backup before requesting a follow-up.");
  if (!validateMeasurementScope(plan.baselineMeasurement) || !validateMeasurementScope(baseline.measurement) || measurementScopeKey(plan.baselineMeasurement) !== measurementScopeKey(baseline.measurement))
    throw new Error("The baseline has no matching recorded collection settings. Start a new explicitly approved baseline audit.");
  const scope = plan.baselineMeasurement;
  const input: AuditInput = { brand: scope.brand.name, domain: scope.brand.domain, competitors: [...(baseline.competitors ?? [])], prompts: scope.prompts.map((question) => question.text), engines: scope.collectors.map((collector) => collector.engine), market: { ...scope.market } };
  const promptRecords: PromptRecord[] = scope.prompts.map((question) => ({ ...question, intent: "other", provenance: "manual", paused: false, archived: false }));
  if (measurementScopeKey(buildMeasurementScope(input, promptRecords)) !== measurementScopeKey(scope)) throw new Error("The original collector configuration is no longer supported. A substituted collector would not be a comparable follow-up.");
  return { input, promptRecords, competitorDetails: (baseline.competitorDetails ?? []).map(({ name, domain }) => ({ name, ...(domain ? { domain } : {}) })), measurement: cleanMeasurementScope(scope) };
}

export function parsePagePlans(value: unknown): PagePlan[] | null {
  if (!Array.isArray(value) || value.length > MAX_PAGE_PLANS) return null;
  const ids = new Set<string>();
  const plans: PagePlan[] = [];
  for (const item of value) {
    if (!record(item) || item.version !== 1 || !text(item.id, 200, true) || ids.has(item.id) || !record(item.brand) || !text(item.brand.name, 100, true) || !text(item.brand.domain, 300, true) ||
      !safeEvidenceUrl(item.brand.domain.includes("://") ? item.brand.domain : `https://${item.brand.domain}`) || !record(item.question) || !text(item.question.id, 100, true) || !text(item.question.text, 500, true) ||
      !record(item.target) || !["existing", "proposed", "later"].includes(String(item.target.kind)) ||
      (item.target.kind === "existing" && !text(item.target.url, 2048, true)) ||
      (item.target.url !== undefined && (!text(item.target.url, 2048, true) || !evidenceMatchesDomain(item.target.url, item.brand.domain) || item.target.kind === "later")) ||
      !text(item.rationale, 2000) || !text(item.brief, 12000) || !PAGE_PLAN_STATUSES.includes(item.status as PagePlan["status"]) ||
      !text(item.baselineRunId, 200, true) || (item.followupRunId !== undefined && (!text(item.followupRunId, 200, true) || item.followupRunId === item.baselineRunId)) ||
      (item.status === "measured" && !item.followupRunId) || !date(item.createdAt) || !date(item.updatedAt) || Date.parse(String(item.updatedAt)) < Date.parse(String(item.createdAt)) ||
      (item.publishedAt !== undefined && !date(item.publishedAt))) return null;
    const question = item.question;
    if (item.baselineMeasurement !== undefined && (!validateMeasurementScope(item.baselineMeasurement) ||
      identity(item.baselineMeasurement.brand.name, item.baselineMeasurement.brand.domain) !== identity(item.brand.name, item.brand.domain) ||
      !item.baselineMeasurement.prompts.some((p) => p.id === question.id && p.text === question.text))) return null;
    ids.add(item.id);
    const plan = item as unknown as PagePlan;
    plans.push({ version: 1, id: plan.id, brand: { name: plan.brand.name, domain: plan.brand.domain }, question: { id: plan.question.id, text: plan.question.text },
      target: { kind: plan.target.kind, ...(plan.target.url ? { url: safeEvidenceUrl(plan.target.url)! } : {}) }, rationale: plan.rationale, brief: plan.brief, status: plan.status,
      baselineRunId: plan.baselineRunId, ...(plan.baselineMeasurement ? { baselineMeasurement: cleanMeasurementScope(plan.baselineMeasurement) } : {}),
      ...(plan.followupRunId ? { followupRunId: plan.followupRunId } : {}), ...(plan.publishedAt ? { publishedAt: plan.publishedAt } : {}), createdAt: plan.createdAt, updatedAt: plan.updatedAt });
  }
  return plans;
}
