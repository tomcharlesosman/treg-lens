import {
  BUYER_QUESTION_INTENTS, normalizeDomain,
  type BuyerQuestion, type CompetitorDetail, type MeasurementMarket,
  type OnboardingResearch, type Project, type ProjectStrategy,
} from "./workspace-data";

/** Browser-safe bounds shared by drafts, storage and the server sanitizer. */
export const MAX_AUDIENCE_LENGTH = 600;
export const MAX_BUYER_QUESTIONS = 16;
export const MAX_RESEARCH_RECEIPTS = 5;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const bounded = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
const date = (value: unknown) => bounded(value, 40) && Number.isFinite(Date.parse(value as string));
const cost = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const sameText = (value: string) => value.trim().toLowerCase();

export function isSupportedMarket(value: unknown): value is MeasurementMarket {
  return record(value) && value.country === "US" && value.language === "en" &&
    Object.keys(value).every((key) => key === "country" || key === "language");
}

/** Evidence links cannot carry credentials, private hosts or non-web protocols. No DNS/network work. */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port)) || !host.includes(".") ||
      /\.(localhost|local|internal|lan|home|test|invalid|example)$/i.test(host) ||
      /^[\d.]+$/.test(host) || host.includes(":") ||
      host.split(".").some((part) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(part)) ||
      /%(?:00|0a|0d|5c)/i.test(url.pathname + url.search)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function evidenceMatchesDomain(url: string, domain: string): boolean {
  const safe = safeEvidenceUrl(url);
  const website = safeEvidenceUrl(domain.includes("://") ? domain : `https://${domain}`);
  if (!safe || !website) return false;
  const host = normalizeDomain(safe), competitor = normalizeDomain(website);
  return host === competitor || host.endsWith(`.${competitor}`);
}

function detail(value: unknown): value is CompetitorDetail {
  return record(value) && bounded(value.name, 100) && Boolean((value.name as string).trim()) &&
    optional(value.domain, (v) => bounded(v, 253) &&
      (v === "" || Boolean(safeEvidenceUrl(String(v).includes("://") ? v : `https://${v}`)))) &&
    optional(value.reason, (v) => bounded(v, 240)) &&
    optional(value.sourceUrl, (v) => Boolean(safeEvidenceUrl(v)));
}

export function isBuyerQuestion(value: unknown): value is BuyerQuestion {
  return record(value) && bounded(value.text, 500) && Boolean((value.text as string).trim()) &&
    BUYER_QUESTION_INTENTS.includes(value.intent as BuyerQuestion["intent"]) &&
    ["generated", "manual", "discovered"].includes(value.provenance as string) &&
    optional(value.reason, (v) => bounded(v, 240));
}

export function isResearchReceipt(value: unknown): value is OnboardingResearch {
  if (!record(value)) return false;
  return value.kind === "research" &&
    optional(value.input, (v) => record(v) && Boolean(safeEvidenceUrl(v.url)) &&
      optional(v.audience, (a) => bounded(a, MAX_AUDIENCE_LENGTH)) && isSupportedMarket(v.market)) &&
    Boolean(safeEvidenceUrl(value.url)) &&
    bounded(value.domain, 253) && bounded(value.brand, 100) && bounded(value.description, 600) &&
    optional(value.audience, (v) => bounded(v, MAX_AUDIENCE_LENGTH)) &&
    optional(value.market, isSupportedMarket) &&
    Array.isArray(value.competitors) && value.competitors.length <= 5 && value.competitors.every(detail) &&
    Array.isArray(value.questions) && value.questions.length <= 8 && value.questions.every((v) => bounded(v, 500)) &&
    optional(value.buyerQuestions, (v) => Array.isArray(v) && v.length <= MAX_BUYER_QUESTIONS && v.every(isBuyerQuestion)) &&
    Array.isArray(value.sources) && value.sources.length <= 12 &&
    value.sources.every((v) => record(v) && bounded(v.title, 200) && Boolean(safeEvidenceUrl(v.url))) &&
    (value.totalCostUsd === null || cost(value.totalCostUsd)) && cost(value.knownCostUsd) &&
    typeof value.costKnown === "boolean" && (value.costKnown ? cost(value.totalCostUsd) : value.totalCostUsd === null) &&
    Array.isArray(value.errors) && value.errors.length <= 12 &&
    value.errors.every((v) => record(v) && v.step === "research" && bounded(v.error, 1200)) &&
    Array.isArray(value.callIds) && value.callIds.length <= 8 && value.callIds.every((v) => bounded(v, 200)) &&
    date(value.completedAt);
}

export function validateProjectMetadata(value: Record<string, unknown>): boolean {
  return optional(value.audience, (v) => bounded(v, MAX_AUDIENCE_LENGTH)) &&
    optional(value.market, isSupportedMarket) &&
    optional(value.competitorDetails, (v) => Array.isArray(v) && v.length <= 8 && v.every(detail)) &&
    optional(value.buyerQuestions, (v) => Array.isArray(v) && v.length <= MAX_BUYER_QUESTIONS && v.every(isBuyerQuestion)) &&
    optional(value.researchReceipts, (v) => Array.isArray(v) && v.length <= MAX_RESEARCH_RECEIPTS && v.every(isResearchReceipt)) &&
    optional(value.strategy, (v) => validateProjectStrategy(v, typeof value.domain === "string" ? value.domain : undefined));
}

export function validateProjectStrategy(value: unknown, domain?: string): value is ProjectStrategy {
  return record(value) && optional(value.goal, (v) => bounded(v, 600)) &&
    optional(value.timeframe, (v) => bounded(v, 120)) &&
    optional(value.differentiators, (v) => bounded(v, 1200)) &&
    optional(value.writingPreferences, (v) => bounded(v, 1200)) &&
    optional(value.keyPages, (v) => Array.isArray(v) && v.length <= 12 &&
      v.every((url) => Boolean(safeEvidenceUrl(url)) && (!domain || evidenceMatchesDomain(url, domain))));
}

export function cleanProjectStrategy(value: ProjectStrategy): ProjectStrategy {
  return {
    ...(value.goal !== undefined ? { goal: value.goal } : {}),
    ...(value.timeframe !== undefined ? { timeframe: value.timeframe } : {}),
    ...(value.differentiators !== undefined ? { differentiators: value.differentiators } : {}),
    ...(value.keyPages !== undefined ? { keyPages: [...value.keyPages] } : {}),
    ...(value.writingPreferences !== undefined ? { writingPreferences: value.writingPreferences } : {}),
  };
}

function cleanQuestion(value: BuyerQuestion): BuyerQuestion {
  return { text: value.text, intent: value.intent, provenance: value.provenance,
    ...(value.reason !== undefined ? { reason: value.reason } : {}) };
}

function cleanDetail(value: CompetitorDetail, receipts: OnboardingResearch[]): CompetitorDetail {
  const sourceUrl = value.domain && value.sourceUrl && evidenceMatchesDomain(value.sourceUrl, value.domain) &&
    receipts.some((receipt) => receipt.sources.some((source) => source.url === value.sourceUrl) &&
      receipt.competitors.some((competitor) => sameText(competitor.name) === sameText(value.name) &&
        competitor.domain && normalizeDomain(competitor.domain) === normalizeDomain(value.domain!)));
  return { name: value.name, ...(value.domain !== undefined ? { domain: value.domain } : {}),
    ...(value.reason !== undefined ? { reason: value.reason } : {}),
    ...(sourceUrl ? { sourceUrl: value.sourceUrl } : {}) };
}

/** Explicit field projection: nested extra fields cannot smuggle credentials into exports. */
export function cleanResearchReceipt(value: OnboardingResearch): OnboardingResearch {
  const sources = value.sources.map(({ title, url }) => ({ title, url }));
  return {
    kind: "research", url: value.url, domain: value.domain, brand: value.brand, description: value.description,
    ...(value.input ? { input: { url: value.input.url,
      ...(value.input.audience !== undefined ? { audience: value.input.audience } : {}),
      market: { country: value.input.market.country, language: value.input.market.language } } } : {}),
    ...(value.audience !== undefined ? { audience: value.audience } : {}),
    ...(value.market ? { market: { country: value.market.country, language: value.market.language } } : {}),
    competitors: value.competitors.map((item) => cleanDetail(item, [value])),
    questions: [...value.questions],
    ...(value.buyerQuestions ? { buyerQuestions: value.buyerQuestions.map(cleanQuestion) } : {}),
    sources, totalCostUsd: value.totalCostUsd, knownCostUsd: value.knownCostUsd, costKnown: value.costKnown,
    errors: value.errors.map(({ step, error }) => ({ step, error })), callIds: [...value.callIds], completedAt: value.completedAt,
  };
}

/** Keep old canonical name/prompt arrays authoritative while retaining unselected reviewed ideas. */
export function normalizeProjectMetadata(project: Project, prompts?: string[]): Project {
  const receipts = project.researchReceipts?.slice(-MAX_RESEARCH_RECEIPTS).map(cleanResearchReceipt);
  const names = new Set(project.competitors.map(sameText));
  const details = project.competitorDetails?.filter((item) => names.has(sameText(item.name)))
    .filter((item, index, all) => all.findIndex((row) => sameText(row.name) === sameText(item.name)) === index)
    .map((item) => cleanDetail(item, receipts ?? []));
  const questions = project.buyerQuestions?.filter((item, index, all) =>
    all.findIndex((row) => sameText(row.text) === sameText(item.text)) === index).map(cleanQuestion);
  if (questions && prompts) {
    for (const prompt of prompts) {
      if (!questions.some((item) => sameText(item.text) === sameText(prompt)))
        questions.unshift({ text: prompt, intent: "other", provenance: "manual" });
    }
    const selected = new Set(prompts.map(sameText));
    questions.sort((a, b) => Number(selected.has(sameText(b.text))) - Number(selected.has(sameText(a.text))));
  }
  return {
    brand: project.brand, domain: project.domain, competitors: [...project.competitors],
    ...(project.description !== undefined ? { description: project.description } : {}),
    ...(project.onboardingCompletedAt !== undefined ? { onboardingCompletedAt: project.onboardingCompletedAt } : {}),
    ...(project.audience !== undefined ? { audience: project.audience } : {}),
    ...(project.market ? { market: { country: project.market.country, language: project.market.language } } : {}),
    ...(details ? { competitorDetails: details } : {}),
    ...(questions ? { buyerQuestions: questions.slice(0, MAX_BUYER_QUESTIONS) } : {}),
    ...(receipts ? { researchReceipts: receipts } : {}),
    ...(project.strategy ? { strategy: cleanProjectStrategy(project.strategy) } : {}),
  };
}
