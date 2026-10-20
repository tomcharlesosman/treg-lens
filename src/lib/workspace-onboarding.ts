import { DEFAULT_PROJECT, DEFAULT_PROMPTS, normalizeDomain, type OnboardingResearch, type Project } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";
import { cleanResearchReceipt, isResearchReceipt, MAX_RESEARCH_RECEIPTS, normalizeProjectMetadata } from "./workspace-profile";

/** Original receipts remain separate from reviewed/selected profile fields. */
export function appendResearchReceipt(
  previous: OnboardingResearch[] | undefined,
  research: OnboardingResearch,
): OnboardingResearch[] {
  const history = (previous ?? []).filter(isResearchReceipt);
  if (!isResearchReceipt(research)) return history.slice(-MAX_RESEARCH_RECEIPTS).map(cleanResearchReceipt);
  // Applying the same returned receipt twice must not evict useful older research.
  const identity = (receipt: OnboardingResearch) =>
    JSON.stringify([receipt.url, receipt.completedAt, receipt.callIds]);
  return [...history.filter((receipt) => identity(receipt) !== identity(research)), research]
    .slice(-MAX_RESEARCH_RECEIPTS).map(cleanResearchReceipt);
}

/** Older, deliberately configured workspaces keep opening directly to their dashboard. */
export function needsBrandOnboarding(snapshot: WorkspaceSnapshot): boolean {
  if (snapshot.project.onboardingCompletedAt || snapshot.runs.length) return false;
  if (!snapshot.project.brand.trim() || !snapshot.project.domain.trim()) return true;
  return isExampleProfile(snapshot) &&
    !snapshot.done.length && !Object.keys(snapshot.sourceResearch).length;
}

export function isExampleProfile(snapshot: WorkspaceSnapshot): boolean {
  return JSON.stringify(snapshot.project) === JSON.stringify(DEFAULT_PROJECT) &&
    JSON.stringify(snapshot.prompts) === JSON.stringify(DEFAULT_PROMPTS) &&
    !snapshot.runs.length;
}

/** Descriptions belong to a particular brand, not a different brand selected by an audit. */
export function updateProjectProfile(previous: Project, next: Project): Project {
  const sameBrand = previous.brand.trim().toLowerCase() === next.brand.trim().toLowerCase() &&
    normalizeDomain(previous.domain) === normalizeDomain(next.domain);
  return normalizeProjectMetadata({
    ...next,
    ...(sameBrand && next.description === undefined && previous.description !== undefined
      ? { description: previous.description } : {}),
    ...(sameBrand && next.audience === undefined && previous.audience !== undefined
      ? { audience: previous.audience } : {}),
    ...(sameBrand && next.strategy === undefined && previous.strategy !== undefined
      ? { strategy: previous.strategy } : {}),
    ...(sameBrand && next.market === undefined && previous.market !== undefined
      ? { market: previous.market } : {}),
    ...(sameBrand && next.competitorDetails === undefined && previous.competitorDetails !== undefined
      ? { competitorDetails: previous.competitorDetails } : {}),
    ...(sameBrand && next.buyerQuestions === undefined && previous.buyerQuestions !== undefined
      ? { buyerQuestions: previous.buyerQuestions } : {}),
    ...(next.researchReceipts === undefined && previous.researchReceipts !== undefined
      ? { researchReceipts: previous.researchReceipts } : {}),
    ...(previous.onboardingCompletedAt && !next.onboardingCompletedAt
      ? { onboardingCompletedAt: previous.onboardingCompletedAt } : {}),
  });
}
