import type { DiscoveryCandidate, DiscoveryEstimate, DiscoveryResult } from "./discovery";
import type { Project } from "./workspace-data";

export const MAX_DISCOVERY_RESEARCH = 20;
export interface SavedDiscovery {
  id: string;
  input: { brand: string; domain: string; seeds: string[] };
  estimate: DiscoveryEstimate;
  result: DiscoveryResult;
  selectedCandidateIds: string[];
}
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && v.trim().length >= min && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const cost = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const date = (v: unknown): v is string => text(v, 40, 1) && Number.isFinite(Date.parse(v));
const strings = (v: unknown, max: number, length: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((item) => text(item, length, 1));
const endpoint = (v: unknown) => v === "treg.google.keywords.ideas" || v === "cloro.google.serp.organic";

/** Contextual starting points only; no generated text, provider call or generic business defaults. */
export function suggestedDiscoverySeeds(project: Project): string[] {
  const options = [
    ...(project.buyerQuestions ?? []).filter((q) => q.intent !== "branded" && q.intent !== "other").map((q) => q.text),
    project.description?.split(/[.!\n]/)[0],
    project.audience,
    ...(project.buyerQuestions ?? []).filter((q) => q.intent === "other").map((q) => q.text),
  ];
  const seeds: string[] = [];
  for (const option of options) {
    const candidate = option?.replace(/\s+/g, " ").trim().slice(0, 100).trim();
    if (candidate && candidate.length >= 2 && !seeds.some((seed) => seed.toLowerCase() === candidate.toLowerCase())) seeds.push(candidate);
    if (seeds.length === 2) break;
  }
  return [...seeds, ...Array(Math.max(0, 2 - seeds.length)).fill("")];
}

/** Bounded, allowlisted receipt parsing also strips unknown credential/configuration fields. */
export function parseSavedDiscovery(value: unknown): SavedDiscovery | null {
  if (!record(value) || !text(value.id, 100, 1) || !record(value.input) || !record(value.estimate) || !record(value.result)) return null;
  const input = value.input, estimate = value.estimate, result = value.result;
  if (!text(input.brand, 100) || !text(input.domain, 253) || !strings(input.seeds, 3, 100) || input.seeds.length < 2 || input.seeds.some((s) => s.trim().length < 2) || new Set(input.seeds.map((s) => s.trim().toLowerCase())).size !== input.seeds.length) return null;
  if (estimate.currency !== "USD" || !cost(estimate.totalCostUsd) || estimate.totalCostUsd > 0.1 || !Number.isInteger(estimate.maxCalls) || Number(estimate.maxCalls) < 2 || Number(estimate.maxCalls) > 6 || !date(estimate.pricedAt) || !text(estimate.note, 1500) || !Array.isArray(estimate.breakdown) || estimate.breakdown.length > 2) return null;
  const breakdown: DiscoveryEstimate["breakdown"] = [];
  for (const row of estimate.breakdown) {
    if (!record(row) || !text(row.label, 100) || !endpoint(row.endpointId) || !Number.isInteger(row.calls) || Number(row.calls) < 0 || Number(row.calls) > 3 || !cost(row.costPerCallUsd) || !cost(row.subtotalUsd)) return null;
    breakdown.push({ label: row.label, endpointId: row.endpointId as string, calls: row.calls as number, costPerCallUsd: row.costPerCallUsd, subtotalUsd: row.subtotalUsd });
  }
  if (!Array.isArray(result.candidates) || result.candidates.length > 54 || !cost(result.totalCostUsd) || typeof result.totalCostKnown !== "boolean" || !cost(result.reservedCostUsd) || !date(result.completedAt) || !record(result.locale) || result.locale.country !== "US" || result.locale.language !== "en" || !Array.isArray(result.errors) || result.errors.length > 6 || (result.callIds !== undefined && !strings(result.callIds, 6, 200))) return null;
  const candidates: DiscoveryCandidate[] = [];
  for (const row of result.candidates) {
    if (!record(row) || !text(row.id, 100, 1) || !text(row.text, 500, 1) || !text(row.seed, 100, 1) || !text(row.keyword, 500, 1) || !text(row.provider, 100, 1) || !["question", "keyword"].includes(row.kind as string) || row.origin !== (row.kind === "question" ? "People Also Ask" : "Keyword idea") || (row.searchVolume !== null && (typeof row.searchVolume !== "number" || !Number.isFinite(row.searchVolume) || row.searchVolume < 0 || row.kind === "question"))) return null;
    candidates.push({ id: row.id, text: row.text, kind: row.kind as DiscoveryCandidate["kind"], origin: row.origin as DiscoveryCandidate["origin"], seed: row.seed, keyword: row.keyword, searchVolume: row.searchVolume as number | null, provider: row.provider });
  }
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length || result.keywordCount !== candidates.filter((c) => c.kind === "keyword").length || result.questionCount !== candidates.filter((c) => c.kind === "question").length || !strings(value.selectedCandidateIds, 8, 100) || new Set(value.selectedCandidateIds).size !== value.selectedCandidateIds.length || value.selectedCandidateIds.some((id) => !candidates.some((c) => c.id === id))) return null;
  const errors: DiscoveryResult["errors"] = [];
  for (const row of result.errors) {
    if (!record(row) || !["keywords", "questions"].includes(row.stage as string) || !text(row.seed, 500) || !text(row.error, 2000)) return null;
    errors.push({ stage: row.stage as "keywords" | "questions", seed: row.seed, error: row.error });
  }
  return {
    id: value.id,
    input: { brand: input.brand, domain: input.domain, seeds: [...input.seeds] },
    estimate: { currency: "USD", totalCostUsd: estimate.totalCostUsd, maxCalls: estimate.maxCalls as number, breakdown, note: estimate.note, pricedAt: estimate.pricedAt },
    result: { candidates, keywordCount: result.keywordCount as number, questionCount: result.questionCount as number, totalCostUsd: result.totalCostUsd, totalCostKnown: result.totalCostKnown, reservedCostUsd: result.reservedCostUsd, completedAt: result.completedAt, locale: { country: "US", language: "en" }, callIds: [...(result.callIds as string[] ?? [])], errors },
    selectedCandidateIds: [...value.selectedCandidateIds],
  };
}

export const sanitizeSavedDiscovery = parseSavedDiscovery;
export function parseDiscoveryResearch(value: unknown): SavedDiscovery[] | null {
  if (!Array.isArray(value) || value.length > MAX_DISCOVERY_RESEARCH) return null;
  const receipts = value.map(parseSavedDiscovery);
  if (receipts.some((item) => item === null) || new Set(receipts.map((item) => item?.id)).size !== receipts.length) return null;
  return receipts as SavedDiscovery[];
}

export function createSavedDiscovery(project: Pick<Project, "brand" | "domain">, seeds: string[], estimate: DiscoveryEstimate, result: DiscoveryResult): SavedDiscovery {
  const receipt = parseSavedDiscovery({ id: crypto.randomUUID(), input: { brand: project.brand, domain: project.domain, seeds }, estimate, result, selectedCandidateIds: [] });
  if (!receipt) throw new Error("Discovery returned an invalid result. Keep this window open and check Treg activity before another paid request.");
  return receipt;
}
