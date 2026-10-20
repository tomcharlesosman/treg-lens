import { AeoError, type AuditInput } from "./aeo";
import { buildMeasurementScope } from "./measurement";
import { normalizeDomain, type SavedRun } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";
import { buildPagePlanFollowup } from "./page-plans";

/** Resolve only the caller's saved baseline, before any paid provider call. */
export function followupAuditContext(input: AuditInput, snapshot?: WorkspaceSnapshot | null): Pick<SavedRun, "measurement" | "competitorDetails"> | null {
  if (!input.followupPlanId) return null;
  const plan = snapshot?.pagePlans?.find((item) => item.id === input.followupPlanId);
  if (!plan) throw new AeoError("This saved page plan is unavailable in your workspace.", 404);
  if (plan.updatedAt !== input.followupPlanUpdatedAt)
    throw new AeoError("This page plan changed. Reopen it and review a fresh follow-up estimate.", 409);
  let original: ReturnType<typeof buildPagePlanFollowup>;
  try { original = buildPagePlanFollowup(plan, snapshot!.runs); }
  catch (error) { throw new AeoError(error instanceof Error ? error.message : "The original collection settings are unavailable.", 409); }
  const selected = (value: AuditInput) => JSON.stringify({
    brand: value.brand.trim().toLowerCase(), domain: normalizeDomain(value.domain),
    competitors: [...value.competitors].sort(), prompts: [...value.prompts].sort(), engines: [...value.engines].sort(),
  });
  if (selected(input) !== selected(original.input))
    throw new AeoError("Follow-up questions, engines and brand must match the saved baseline. Start a separate audit to change scope.", 409);
  return { measurement: original.measurement, competitorDetails: original.competitorDetails };
}

/** Capture only identities reviewed for this brand and selected in this audit. */
export function auditContext(input: AuditInput, snapshot?: WorkspaceSnapshot | null): Pick<SavedRun, "measurement" | "competitorDetails"> {
  const sameProject = snapshot && snapshot.project.brand.trim().toLowerCase() === input.brand.trim().toLowerCase() &&
    normalizeDomain(snapshot.project.domain) === normalizeDomain(input.domain);
  const details = sameProject ? snapshot.project.competitorDetails ?? [] : [];
  return {
    measurement: buildMeasurementScope(input, sameProject ? snapshot.promptRecords : undefined),
    competitorDetails: input.competitors.map((name) => {
      const detail = details.find((item) => item.name.toLowerCase() === name.toLowerCase());
      return { name, ...(detail?.domain ? { domain: normalizeDomain(detail.domain) } : {}) };
    }),
  };
}
