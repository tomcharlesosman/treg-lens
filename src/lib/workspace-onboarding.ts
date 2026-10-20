import { DEFAULT_PROJECT, DEFAULT_PROMPTS, normalizeDomain, type Project } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";

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
  return {
    ...next,
    ...(sameBrand && next.description === undefined && previous.description !== undefined
      ? { description: previous.description } : {}),
    ...(previous.onboardingCompletedAt && !next.onboardingCompletedAt
      ? { onboardingCompletedAt: previous.onboardingCompletedAt } : {}),
  };
}
