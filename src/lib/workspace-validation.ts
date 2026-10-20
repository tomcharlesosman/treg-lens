import { parseWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace-storage";
import type { SavedRun } from "./workspace-data";
import { normalizeProjectMetadata } from "./workspace-profile";

export const MAX_WORKSPACE_BYTES = 8 * 1024 * 1024;
export class WorkspaceValidationError extends Error {
  constructor(message = "Send a valid workspace snapshot and non-negative revision.") {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}

function cleanRun(run: SavedRun): SavedRun {
  return {
    id: run.id, brand: run.brand, domain: run.domain,
    ...(run.prompts ? { prompts: [...run.prompts] } : {}),
    ...(run.competitors ? { competitors: [...run.competitors] } : {}),
    ...(run.engines ? { engines: [...run.engines] } : {}),
    results: run.results.map((answer) => ({
      id: answer.id, prompt: answer.prompt, engine: answer.engine, answer: answer.answer,
      citations: answer.citations.map(({ url, title, domain }) => ({ url, title, domain })),
      mentionedBrands: [...answer.mentionedBrands], brandMentioned: answer.brandMentioned,
      position: answer.position, costUsd: answer.costUsd, completedAt: answer.completedAt,
      ...(answer.costKnown !== undefined ? { costKnown: answer.costKnown } : {}),
      ...(answer.sourceKind ? { sourceKind: answer.sourceKind } : {}),
      ...(typeof answer.provider === "string" ? { provider: answer.provider } : {}),
    })),
    errors: run.errors.map((issue) => {
      const cost = issue as typeof issue & { costUsd?: number; costKnown?: boolean };
      return {
        prompt: issue.prompt, engine: issue.engine, error: issue.error,
        ...(typeof cost.costUsd === "number" && Number.isFinite(cost.costUsd) && cost.costUsd >= 0 ? { costUsd: cost.costUsd } : {}),
        ...(typeof cost.costKnown === "boolean" ? { costKnown: cost.costKnown } : {}),
      };
    }),
    totalCostUsd: run.totalCostUsd, completedAt: run.completedAt,
    ...(run.totalCostKnown !== undefined ? { totalCostKnown: run.totalCostKnown } : {}),
  };
}

/** Validate the browser schema, then persist only known data fields, never keys. */
export function sanitizeWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  let raw: string;
  try { raw = JSON.stringify(value); } catch { throw new WorkspaceValidationError(); }
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES)
    throw new WorkspaceValidationError("Workspace data exceeds the 8 MiB storage limit.");
  const snapshot = parseWorkspaceSnapshot(raw);
  if (!snapshot) throw new WorkspaceValidationError();
  const ids = snapshot.runs.map((run) => run.id);
  if (ids.some((id) => !id.trim() || id.length > 200) || new Set(ids).size !== ids.length)
    throw new WorkspaceValidationError("Audit run IDs must be nonempty and unique.");
  return {
    project: normalizeProjectMetadata(snapshot.project, snapshot.prompts),
    prompts: [...snapshot.prompts], runs: snapshot.runs.map(cleanRun), done: [...snapshot.done],
    sourceResearch: Object.fromEntries(Object.entries(snapshot.sourceResearch).map(([key, source]) => [key, {
      kind: source.kind, url: source.url, domain: source.domain, brand: source.brand,
      title: source.title, excerpt: source.excerpt, contentCharacters: source.contentCharacters,
      brandMentioned: source.brandMentioned, brandOccurrences: source.brandOccurrences,
      brandExcerpts: [...source.brandExcerpts], author: source.author, publishedAt: source.publishedAt,
      contactRoutes: source.contactRoutes.map(({ label, url, kind }) => ({ label, url, kind })),
      metrics: {
        domainAuthority: source.metrics.domainAuthority, pageAuthority: source.metrics.pageAuthority,
        spamScore: source.metrics.spamScore, referringDomains: source.metrics.referringDomains,
        externalLinks: source.metrics.externalLinks, lastCrawled: source.metrics.lastCrawled,
      },
      provenance: {
        metricsProvider: source.provenance.metricsProvider, contentProvider: source.provenance.contentProvider,
        contentFreshness: source.provenance.contentFreshness,
      },
      totalCostUsd: source.totalCostUsd, knownCostUsd: source.knownCostUsd, costKnown: source.costKnown,
      callIds: [...source.callIds], errors: source.errors.map(({ step, error }) => ({ step, error })),
      completedAt: source.completedAt,
    }])),
  };
}

