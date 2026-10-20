import type { BuyerQuestionIntent, BuyerQuestionProvenance, Project } from "./workspace-data";
import { BUYER_QUESTION_INTENTS, normalizeDomain } from "./workspace-data";

export type PromptKind = "neutral" | "branded";
export type PromptRecord = {
  id: string;
  text: string;
  intent: BuyerQuestionIntent;
  kind: PromptKind;
  provenance: BuyerQuestionProvenance;
  topic?: string;
  paused: boolean;
  archived: boolean;
  evidence?: { discoveryId: string; candidateId: string };
};

/** A portable identity for pre-inventory wording. Exact wording remains significant. */
export function legacyPromptId(text: string): string {
  const wording = text.trim();
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = 0xdeadbeef;
  for (let i = 0; i < wording.length; i++) {
    const n = wording.charCodeAt(i);
    a = Math.imul(a ^ n, 0x85ebca6b); b = Math.imul(b ^ n, 0xc2b2ae35);
    c = Math.imul(c ^ n, 0x27d4eb2f); d = Math.imul(d ^ n, 0x165667b1);
  }
  return `prompt-${[a, b, c, d].map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("")}`;
}

function containsName(text: string, name: string) {
  if (!name.trim()) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** Branded includes the configured brand, its domain, or a named competitor. */
export function classifyPrompt(text: string, project: Pick<Project, "brand" | "domain" | "competitors">): PromptKind {
  return [project.brand, normalizeDomain(project.domain), ...project.competitors].some((name) => containsName(text, name)) ? "branded" : "neutral";
}

export function createPromptRecord(text: string, project: Project): PromptRecord {
  const cleaned = text.trim();
  const suggestion = project.buyerQuestions?.find((question) => question.text === cleaned);
  return {
    id: legacyPromptId(cleaned), text: cleaned,
    intent: suggestion?.intent ?? "other", kind: classifyPrompt(cleaned, project),
    provenance: suggestion?.provenance ?? "manual", paused: false, archived: false,
  };
}

/** Reconcile the compatibility string list without erasing historical inventory. */
export function syncPromptRecords(existing: PromptRecord[] | undefined, prompts: string[], project: Project): PromptRecord[] {
  const unique = [...new Set(prompts.map((prompt) => prompt.trim()).filter(Boolean))];
  const requested = new Set(unique);
  const records = (existing ?? []).map((record) => ({ ...record,
    archived: requested.has(record.text) ? false : record.paused ? record.archived : true,
  }));
  for (const text of unique) {
    const index = records.findIndex((record) => record.text === text);
    if (index >= 0) records[index] = { ...records[index], archived: false };
    else records.push(createPromptRecord(text, project));
  }
  return records;
}

export function activePromptTexts(records: PromptRecord[]): string[] {
  return records.filter((record) => !record.archived && !record.paused).map((record) => record.text);
}

/** Editing wording creates a new cohort identity and retains the original record. */
export function editPromptRecord(records: PromptRecord[], id: string, text: string, project: Project): PromptRecord[] {
  const previous = records.find((record) => record.id === id);
  const cleaned = text.trim();
  if (!previous || !cleaned || cleaned.length > 500 || previous.text === cleaned) return records;
  const existing = records.find((record) => record.id !== id && record.text.toLowerCase() === cleaned.toLowerCase() && !record.archived);
  if (existing) return records;
  const replacement = { ...createPromptRecord(cleaned, project), provenance: "manual" as const, intent: previous.intent, topic: previous.topic, paused: previous.paused };
  const restored = records.find((record) => record.text === cleaned);
  return records.map((record) => record.id === id ? { ...record, archived: true } : restored && record.id === restored.id ? { ...restored, archived: false, paused: previous.paused } : record)
    .concat(restored ? [] : [replacement]);
}

export function validatePromptRecords(value: unknown): value is PromptRecord[] {
  if (!Array.isArray(value) || value.length > 512) return false;
  const ids = new Set<string>(), texts = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || r.id.length > 100 || ids.has(r.id) || typeof r.text !== "string" || !r.text.trim() || r.text !== r.text.trim() || r.text.length > 500 || texts.has(r.text) ||
      !BUYER_QUESTION_INTENTS.includes(r.intent as BuyerQuestionIntent) || !["neutral", "branded"].includes(String(r.kind)) || !["manual", "generated", "discovered"].includes(String(r.provenance)) ||
      typeof r.paused !== "boolean" || typeof r.archived !== "boolean" || (r.topic !== undefined && (typeof r.topic !== "string" || r.topic.length > 100))) return false;
    if (r.evidence !== undefined) {
      const e = r.evidence as Record<string, unknown>;
      if (!e || typeof e !== "object" || Array.isArray(e) || [e.discoveryId, e.candidateId].some((v) => typeof v !== "string" || !v || v.length > 200)) return false;
    }
    ids.add(r.id); texts.add(r.text); return true;
  });
}

/** Copy only the public inventory contract, never arbitrary imported properties. */
export function cleanPromptRecords(records: PromptRecord[]): PromptRecord[] {
  return records.map((record) => ({ id: record.id, text: record.text, intent: record.intent, kind: record.kind, provenance: record.provenance,
    paused: record.paused, archived: record.archived, ...(record.topic !== undefined ? { topic: record.topic } : {}),
    ...(record.evidence ? { evidence: { discoveryId: record.evidence.discoveryId, candidateId: record.evidence.candidateId } } : {}),
  }));
}
