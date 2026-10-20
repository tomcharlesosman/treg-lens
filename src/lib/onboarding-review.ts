import type { BuyerQuestionIntent, CompetitorDetail } from "./workspace-data";

export const QUESTION_INTENT_LABELS: Record<BuyerQuestionIntent, string> = {
  category: "Category discovery",
  comparison: "Alternatives & comparisons",
  "use-case": "Use cases",
  purchase: "Purchase criteria",
  branded: "Your brand",
  other: "Other questions",
};

export function inferQuestionIntent(value: string, brand = ""): BuyerQuestionIntent {
  const question = value.toLowerCase();
  if (/\b(alternative|alternatives|versus|vs|compare|compared|comparison)\b/.test(question)) return "comparison";
  if (/\b(price|pricing|cost|budget|buy|purchase|affordable|pay-as-you-go)\b/.test(question)) return "purchase";
  if (brand.trim() && question.includes(brand.trim().toLowerCase())) return "branded";
  if (/\b(how|for|help|use case|using)\b/.test(question)) return "use-case";
  if (/\b(best|which|what|tools|platforms|software|services)\b/.test(question)) return "category";
  return "other";
}

/** Prefer three distinct buyer intents; never count blank or duplicate wording. */
export function starterQuestionIndexes(questions: { text: string; intent: BuyerQuestionIntent }[]): number[] {
  const candidates = questions.map((question, index) => ({ ...question, index }))
    .filter((question, index, rows) => question.text.trim() &&
      rows.findIndex((row) => row.text.trim().toLowerCase() === question.text.trim().toLowerCase()) === index);
  const selected: number[] = [];
  for (const intent of ["category", "comparison", "use-case", "purchase", "branded", "other"] as const) {
    const candidate = candidates.find((question) => question.intent === intent);
    if (candidate) selected.push(candidate.index);
    if (selected.length === 3) return selected;
  }
  for (const candidate of candidates) {
    if (!selected.includes(candidate.index)) selected.push(candidate.index);
    if (selected.length === 3) break;
  }
  return selected;
}

/** Identity edits invalidate supporting evidence, not the independently entered website. */
export function editCompetitor<T extends CompetitorDetail>(competitor: T, change: Pick<Partial<T>, "name" | "domain">): T {
  const next = { ...competitor, ...change };
  delete next.reason;
  delete next.sourceUrl;
  return next;
}

/** Fast client feedback only. The server independently validates the public destination. */
export function onboardingWebsite(value: string) {
  const candidate = value.trim();
  if (!candidate || candidate.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(candidate))
    throw new Error("Enter a website such as yourbrand.com, without spaces.");
  let parsed: URL;
  try { parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`); }
  catch { throw new Error("Enter a website such as yourbrand.com."); }
  const host = parsed.hostname.toLowerCase();
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      !host.includes(".") || host.length > 200 || /^\d+(?:\.\d+){3}$/.test(host) ||
      /\.(localhost|local|internal|lan|home|test|invalid|example)$/i.test(host) ||
      (parsed.port && !["80", "443"].includes(parsed.port))) {
    throw new Error("Use a public website without credentials or a private address.");
  }
  if (/%(?:00|0a|0d|5c)/i.test(parsed.pathname + parsed.search))
    throw new Error("This website URL contains an invalid path.");
  parsed.hash = "";
  parsed.search = "";
  return { url: parsed.toString(), domain: host.replace(/^www\./, "") };
}
