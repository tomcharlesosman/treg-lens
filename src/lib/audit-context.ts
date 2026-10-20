import type { AuditInput } from "./aeo";
import { buildMeasurementScope } from "./measurement";
import { normalizeDomain, type SavedRun } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";

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
