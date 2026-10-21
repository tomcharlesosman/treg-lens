import { comparePagePlanRuns, pagePlanMatchesProject, pagePlanOpportunities } from "./page-plans";
import { measureRun, MIN_TREND_COVERAGE } from "./measurement";
import { normalizeDomain, type Project } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";
import { legacyPromptId } from "./prompt-library";

export const MAX_DISMISSED_STEPS = 128;
export const MAX_RECENT_WORK = 12;
export type ContinuityPreferences = {
  version: 1;
  dismissed: { brand: { name: string; domain: string }; stepId: string; dismissedAt: string }[];
};
export type ContinuityAction = { kind: "audit" | "plans" } | { kind: "reports" | "research"; id?: string } |
  { kind: "run" | "plan" | "report" | "discovery"; id: string };
export type NextStep = { id: string; title: string; detail: string; actionLabel: string; action: ContinuityAction };
export type RecentWork = { id: string; title: string; detail: string; at: string; action: ContinuityAction };
const identity = (name: string, domain: string) => JSON.stringify([name.trim().toLowerCase(), normalizeDomain(domain)]);
const matches = (brand: { name: string; domain: string }, project: Pick<Project, "brand" | "domain">) => identity(brand.name, brand.domain) === identity(project.brand, project.domain);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= max;

/** Optional, bounded preferences; older snapshots need no migration. Unknown fields never persist. */
export function parseContinuityPreferences(value: unknown): ContinuityPreferences | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.dismissed) || value.dismissed.length > MAX_DISMISSED_STEPS) return null;
  const dismissed: ContinuityPreferences["dismissed"] = [], seen = new Set<string>();
  for (const entry of value.dismissed) {
    if (!record(entry) || !record(entry.brand) || !text(entry.brand.name, 200) || !text(entry.brand.domain, 300) || !text(entry.stepId, 600) || !text(entry.dismissedAt, 40) || !Number.isFinite(Date.parse(entry.dismissedAt))) return null;
    const key = JSON.stringify([identity(entry.brand.name, entry.brand.domain), entry.stepId]);
    if (seen.has(key)) return null;
    seen.add(key);
    dismissed.push({ brand: { name: entry.brand.name.trim(), domain: normalizeDomain(entry.brand.domain) }, stepId: entry.stepId, dismissedAt: entry.dismissedAt });
  }
  return { version: 1, dismissed };
}

/** Hiding a recommendation is never a claim that its underlying work completed. */
export function setStepDismissed(snapshot: WorkspaceSnapshot, stepId: string | null, now = new Date().toISOString()): ContinuityPreferences {
  const previous = snapshot.continuity?.dismissed ?? [];
  const dismissed = previous.filter((item) => !matches(item.brand, snapshot.project) || (stepId !== null && item.stepId !== stepId));
  if (stepId !== null) dismissed.push({ brand: { name: snapshot.project.brand, domain: snapshot.project.domain }, stepId, dismissedAt: now });
  const parsed = parseContinuityPreferences({ version: 1, dismissed: dismissed.slice(-MAX_DISMISSED_STEPS) });
  if (!parsed) throw new Error("The suggestion preference could not be saved.");
  return parsed;
}

/** Pure projection of evidence, not an event log or a provider call. All actions require a deliberate UI review. */
export function deriveWorkspaceContinuity(snapshot: WorkspaceSnapshot): { steps: NextStep[]; recent: RecentWork[]; dismissedCount: number } {
  const { project } = snapshot;
  const runs = snapshot.runs.filter((run) => matches({ name: run.brand, domain: run.domain }, project))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || a.id.localeCompare(b.id));
  const plans = (snapshot.pagePlans ?? []).filter((plan) => pagePlanMatchesProject(plan, project))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const reports = (snapshot.reports ?? []).filter((report) => !report.demo && matches({ name: report.project.brand, domain: report.project.domain }, project));
  const discoveries = (snapshot.discoveryResearch ?? []).filter((receipt) => matches({ name: receipt.input.brand, domain: receipt.input.domain }, project))
    .sort((a, b) => Date.parse(b.result.completedAt) - Date.parse(a.result.completedAt) || a.id.localeCompare(b.id));
  const research = (project.researchReceipts ?? []).filter((receipt) => matches({ name: receipt.brand, domain: receipt.domain }, project))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const steps: NextStep[] = [], recent: RecentWork[] = [];
  for (const run of runs) {
    const measurement = measureRun(run);
    recent.push({ id: `run:${run.id}`, title: "Audit saved", detail: `${measurement.answered}/${measurement.requested} checks answered${run.totalCostKnown !== true ? " · Billing unknown" : ""}${run.errors.length ? " · Errors retained" : ""}.`, at: run.completedAt, action: { kind: "run", id: run.id } });
  }
  for (const receipt of discoveries) recent.push({ id: `discovery:${receipt.id}`, title: "Buyer-question research saved", detail: `${receipt.result.candidates.length} suggestions · ${receipt.selectedCandidateIds.length} selected${!receipt.result.totalCostKnown ? " · Billing unknown" : ""}${receipt.result.errors.length ? " · Partial results" : ""}.`, at: receipt.result.completedAt, action: { kind: "discovery", id: receipt.id } });
  for (const receipt of research) recent.push({ id: `research:${receipt.completedAt}:${receipt.url}`, title: "Brand research saved", detail: `${receipt.domain}${!receipt.costKnown ? " · Billing unknown" : ""}${receipt.errors.length ? " · Partial results" : ""}. Generated questions remain suggestions.`, at: receipt.completedAt, action: { kind: "research", id: `${receipt.completedAt}:${receipt.url}` } });
  for (const plan of plans) recent.push({ id: `plan:${plan.id}`, title: "Page plan saved", detail: `${plan.question.text} · ${plan.status}${plan.publishedAt ? ` · Owner-reported publication ${plan.publishedAt}` : ""}`, at: plan.updatedAt, action: { kind: "plan", id: plan.id } });
  for (const report of reports) recent.push({ id: `report:${report.id}`, title: "Report saved", detail: `${report.title} · Frozen evidence and prepared agent instructions; no agent execution is recorded.`, at: report.createdAt, action: { kind: "report", id: report.id } });

  const latest = runs[0], discovery = discoveries[0], receipt = research[0];
  for (const run of runs) {
    const measurement = measureRun(run);
    if (run.totalCostKnown !== true || (run.id === latest?.id && (run.errors.length || measurement.coverage < MIN_TREND_COVERAGE))) steps.push({
      id: `review-run:${run.id}`,
      title: run.id === latest?.id ? "Review the latest audit's incomplete evidence" : "Review an audit with unknown billing",
      detail: `${measurement.answered}/${measurement.requested} checks answered. ${run.totalCostKnown !== true ? "Billing is unknown; check Treg activity before approving another collection. " : ""}Inspect original answers and errors. Missing answers are not brand absence.`,
      actionLabel: "Review saved audit", action: { kind: "run", id: run.id },
    });
  }
  for (const saved of discoveries) if (!saved.result.totalCostKnown || (saved.id === discovery?.id && saved.result.errors.length)) steps.push({
    id: `review-discovery:${saved.id}`, title: "Review the saved research receipt",
    detail: "Research has partial results or unknown billing. Inspect its receipt and Treg activity before deliberately approving more research.",
    actionLabel: "Review saved research", action: { kind: "discovery", id: saved.id },
  });
  for (const saved of research) if (!saved.costKnown || (saved === receipt && saved.errors.length)) steps.push({
    id: `review-research:${legacyPromptId(JSON.stringify([saved.completedAt, saved.url]))}`, title: "Review the brand research receipt",
    detail: "Brand research has partial results or unknown billing. Its sources and original receipt remain available; no research will repeat automatically.",
    actionLabel: "Review brand research", action: { kind: "research", id: `${saved.completedAt}:${saved.url}` },
  });
  if (!runs.some((run) => measureRun(run).answered > 0)) steps.push({ id: latest ? `first-audit:${latest.id}` : "first-audit", title: "Review your first usable audit", detail: "Choose the buyer questions and engines, then review a fresh estimate. Collection starts only after your separate approval.", actionLabel: "Review first audit", action: { kind: "audit" } });
  for (const plan of plans) {
    if (plan.status === "dismissed") continue;
    const comparison = comparePagePlanRuns(plan, runs);
    const id = `plan:${plan.id}:${plan.updatedAt}:${plan.followupRunId ?? "none"}`;
    if (plan.followupRunId && !comparison.comparable) {
      steps.push({ id, title: "Review the follow-up's comparison limits", detail: `${plan.question.text} — ${comparison.reasons.join(" ")} No comparable delta is available.`, actionLabel: "Inspect page-plan evidence", action: { kind: "plan", id: plan.id } });
    } else if (plan.followupRunId && comparison.comparable) {
      if (plan.status !== "measured") steps.push({ id, title: "Review the follow-up comparison", detail: `${plan.question.text} — Comparable saved evidence is ready. Review the observations before marking this plan measured; a change does not establish causation.`, actionLabel: "Review comparison", action: { kind: "plan", id: plan.id } });
      else if (!reports.some((report) => report.runIds.includes(plan.baselineRunId) && report.runIds.includes(plan.followupRunId!) && report.plans.some((saved) => saved.id === plan.id && saved.updatedAt === plan.updatedAt))) steps.push({ id: `report:${id}`, title: "Capture the measured plan in a report", detail: "Save the baseline, follow-up and this page plan together. The report preserves evidence and prepares a handoff for your agent; it does not run the agent.", actionLabel: "Prepare evidence report", action: { kind: "reports", id: plan.id } });
    } else if (plan.status === "published" || plan.status === "measured") steps.push({ id, title: "Review a follow-up measurement", detail: `${plan.question.text} — Your publication date is owner-reported. Open the plan to inspect its original scope and review a separate quote before collection.`, actionLabel: "Open published plan", action: { kind: "plan", id: plan.id } });
    else steps.push({ id, title: "Continue your page plan", detail: `${plan.question.text} — Resume the target page and writing brief. Saved work stays in place until you deliberately update it.`, actionLabel: "Resume page plan", action: { kind: "plan", id: plan.id } });
  }
  const opportunity = pagePlanOpportunities(runs, project).find((item) => item.answered > 0 && item.absent > 0 && !plans.some((plan) => plan.question.id === item.question.id && (plan.status !== "dismissed" || plan.baselineRunId === item.runId)));
  if (opportunity) steps.push({ id: `opportunity:${opportunity.id}`, title: "Turn saved evidence into a page decision", detail: `${opportunity.question.text} — ${opportunity.reason} Review the answers before choosing a page.`, actionLabel: "Review page opportunities", action: { kind: "plans" } });
  if (discovery && !discovery.selectedCandidateIds.length && discovery.result.candidates.length) steps.push({ id: `select-discovery:${discovery.id}`, title: "Review your saved buyer-question suggestions", detail: "Choose the questions that fit your buyers. Adding selected questions to your inventory does not collect answers or start an audit.", actionLabel: "Review suggested questions", action: { kind: "discovery", id: discovery.id } });
  const hidden = new Set((snapshot.continuity?.dismissed ?? []).filter((item) => matches(item.brand, project)).map((item) => item.stepId));
  return { steps: steps.filter((step) => !hidden.has(step.id)), dismissedCount: hidden.size,
    recent: recent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id)).slice(0, MAX_RECENT_WORK) };
}
