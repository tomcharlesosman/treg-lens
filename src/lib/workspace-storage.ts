import type { AnswerResult } from "./aeo";
import type { SourceResearch } from "./source-research";
import { normalizeDomain, type Project, type SavedRun } from "./workspace-data";
import { normalizeProjectMetadata, validateProjectMetadata } from "./workspace-profile";
import { validatePromptRecords, cleanPromptRecords, type PromptRecord } from "./prompt-library";
import { validateMeasurementScope } from "./measurement";
import { parseDiscoveryResearch, type SavedDiscovery } from "./discovery-research";
import { parsePagePlans, type PagePlan } from "./page-plans";
import { parseEvidenceReports, type EvidenceReport } from "./evidence-reports";
import { parseContinuityPreferences, type ContinuityPreferences } from "./workspace-continuity";

export type WorkspaceSnapshot = {
  project: Project;
  prompts: string[];
  runs: SavedRun[];
  done: string[];
  sourceResearch: Record<string, SourceResearch>;
  promptRecords?: PromptRecord[];
  discoveryResearch?: SavedDiscovery[];
  pagePlans?: PagePlan[];
  reports?: EvidenceReport[];
  continuity?: ContinuityPreferences;
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const text = (value: unknown) => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableNumber = (value: unknown) => value === null || number(value);
const date = (value: unknown) =>
  text(value) && Number.isFinite(Date.parse(value as string));
const engine = (value: unknown) =>
  ["chatgpt", "perplexity", "gemini", "google"].includes(value as string);
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);

function answer(value: unknown): value is AnswerResult {
  return (
    record(value) &&
    [value.id, value.prompt, value.answer].every(text) &&
    engine(value.engine) &&
    date(value.completedAt) &&
    strings(value.mentionedBrands) &&
    typeof value.brandMentioned === "boolean" &&
    (value.position === null ||
      (number(value.position) && Number(value.position) > 0)) &&
    number(value.costUsd) &&
    optional(value.costKnown, (v) => typeof v === "boolean") &&
    optional(value.provider, (v) => typeof v === "string" && v.length <= 100) &&
    optional(
      value.sourceKind,
      (v) => v === "web-interface" || v === "model-api",
    ) &&
    Array.isArray(value.citations) &&
    value.citations.every(
      (citation) =>
        record(citation) &&
        [citation.url, citation.title, citation.domain].every(text),
    )
  );
}

function measurementMatchesRun(value: Record<string, unknown>): boolean {
  if (value.measurement === undefined) return true;
  if (!validateMeasurementScope(value.measurement)) return false;
  const scope = value.measurement;
  if (scope.brand.name.trim().toLowerCase() !== String(value.brand).trim().toLowerCase() ||
    normalizeDomain(scope.brand.domain) !== normalizeDomain(String(value.domain))) return false;
  const same = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
  return (!strings(value.prompts) || same(value.prompts, scope.prompts.map((item) => item.text))) &&
    (!strings(value.engines) || same(value.engines, scope.collectors.map((item) => item.engine)));
}

function run(value: unknown): value is SavedRun {
  return (
    record(value) &&
    [value.id, value.brand, value.domain].every(text) &&
    date(value.completedAt) &&
    optional(value.prompts, strings) &&
    optional(value.competitors, strings) &&
    optional(value.engines, (v) => Array.isArray(v) && v.every(engine)) &&
    measurementMatchesRun(value) &&
    validateProjectMetadata({ competitorDetails: value.competitorDetails }) &&
    number(value.totalCostUsd) &&
    optional(value.totalCostKnown, (v) => typeof v === "boolean") &&
    Array.isArray(value.results) &&
    value.results.every(answer) &&
    Array.isArray(value.errors) &&
    value.errors.every(
      (error) =>
        record(error) && [error.prompt, error.engine, error.error].every(text),
    )
  );
}

function source(value: unknown): value is SourceResearch {
  if (!record(value) || !record(value.metrics) || !record(value.provenance))
    return false;
  return (
    value.kind === "research" &&
    [value.url, value.domain, value.brand].every(text) &&
    date(value.completedAt) &&
    [value.title, value.excerpt, value.author, value.publishedAt].every(
      nullableText,
    ) &&
    number(value.contentCharacters) &&
    nullableNumber(value.brandOccurrences) &&
    (value.brandMentioned === null ||
      typeof value.brandMentioned === "boolean") &&
    strings(value.brandExcerpts) &&
    strings(value.callIds) &&
    nullableNumber(value.totalCostUsd) &&
    number(value.knownCostUsd) &&
    typeof value.costKnown === "boolean" &&
    [
      value.metrics.domainAuthority,
      value.metrics.pageAuthority,
      value.metrics.spamScore,
      value.metrics.referringDomains,
      value.metrics.externalLinks,
    ].every(nullableNumber) &&
    nullableText(value.metrics.lastCrawled) &&
    [
      value.provenance.metricsProvider,
      value.provenance.contentProvider,
      value.provenance.contentFreshness,
    ].every(nullableText) &&
    Array.isArray(value.contactRoutes) &&
    value.contactRoutes.every(
      (route) =>
        record(route) &&
        text(route.label) &&
        text(route.url) &&
        ["page", "email", "profile"].includes(route.kind as string),
    ) &&
    Array.isArray(value.errors) &&
    value.errors.every(
      (error) =>
        record(error) &&
        text(error.error) &&
        ["metrics", "extract"].includes(error.step as string),
    )
  );
}

/** Browser storage can be interrupted, edited, or left by an older release. */
export function parseWorkspaceSnapshot(
  raw: string | null,
): WorkspaceSnapshot | null {
  try {
    const saved: unknown = JSON.parse(raw || "null");
    if (
      !record(saved) ||
      !record(saved.project) ||
      !text(saved.project.brand) ||
      !text(saved.project.domain) ||
      !strings(saved.project.competitors) ||
      !optional(saved.project.description, (v) => typeof v === "string" && v.length <= 1200) ||
      !optional(saved.project.onboardingCompletedAt, date) ||
      !validateProjectMetadata(saved.project) ||
      !strings(saved.prompts) ||
      !optional(saved.promptRecords, validatePromptRecords) ||
      !optional(saved.discoveryResearch, (v) => parseDiscoveryResearch(v) !== null) ||
      !optional(saved.pagePlans, (v) => parsePagePlans(v) !== null) ||
      !optional(saved.reports, (v) => parseEvidenceReports(v) !== null) ||
      !optional(saved.continuity, (v) => parseContinuityPreferences(v) !== null) ||
      !Array.isArray(saved.runs) ||
      !saved.runs.every(run)
    )
      return null;
    return {
      project: normalizeProjectMetadata(saved.project as Project, saved.prompts),
      prompts: saved.prompts,
      ...(saved.promptRecords !== undefined ? { promptRecords: cleanPromptRecords(saved.promptRecords as PromptRecord[]) } : {}),
      ...(saved.discoveryResearch !== undefined ? { discoveryResearch: parseDiscoveryResearch(saved.discoveryResearch)! } : {}),
      ...(saved.pagePlans !== undefined ? { pagePlans: parsePagePlans(saved.pagePlans)! } : {}),
      ...(saved.reports !== undefined ? { reports: parseEvidenceReports(saved.reports)! } : {}),
      ...(saved.continuity !== undefined ? { continuity: parseContinuityPreferences(saved.continuity)! } : {}),
      runs: saved.runs,
      done: strings(saved.done) ? saved.done : [],
      sourceResearch: record(saved.sourceResearch)
        ? Object.fromEntries(
            Object.entries(saved.sourceResearch).filter(
              (entry): entry is [string, SourceResearch] => source(entry[1]),
            ),
          )
        : {},
    };
  } catch {
    return null;
  }
}
