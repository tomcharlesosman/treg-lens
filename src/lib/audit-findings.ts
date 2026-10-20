import type { AnswerResult } from "./aeo";
import { normalizeDomain, type SavedRun } from "./workspace-data";
import { safeEvidenceUrl } from "./workspace-profile";

export type AuditFinding = {
  kind: "competitor" | "source" | "question" | "presence";
  title: string;
  detail: string;
  nextStep: string;
  answer: AnswerResult;
  sourceUrl?: string;
};

/** Findings use only this run's saved observations; no new research or causal claims. */
export function auditFindings(run: SavedRun) {
  const observed = new Set<string>();
  const answers = run.results.filter((answer) => {
    const key = JSON.stringify([answer.prompt, answer.engine]);
    if (!answer.answer.trim() || observed.has(key)) return false;
    observed.add(key);
    return true;
  });
  const cells = new Set([
    ...run.results.map((answer) => JSON.stringify([answer.prompt, answer.engine])),
    ...run.errors.map((issue) => JSON.stringify([issue.prompt, issue.engine])),
  ]);
  const declared = new Set(run.prompts ?? []).size * new Set(run.engines ?? []).size;
  const requested = Math.max(declared, cells.size);
  const mentioned = answers.filter((answer) => answer.brandMentioned).length;
  const findings: AuditFinding[] = [];
  const competitors = new Map((run.competitors ?? []).map((name) => [name.toLowerCase(), name]));
  const gaps = new Map<string, AnswerResult[]>();
  for (const answer of answers.filter((row) => !row.brandMentioned)) {
    for (const key of new Set(answer.mentionedBrands.map((name) => name.toLowerCase()))) {
      if (competitors.has(key)) gaps.set(key, [...(gaps.get(key) ?? []), answer]);
    }
  }
  const gap = [...gaps].sort((a, b) => b[1].length - a[1].length)[0];
  if (gap) findings.push({
    kind: "competitor", title: competitors.get(gap[0]) + " appeared where " + run.brand + " did not",
    detail: "Observed in " + gap[1].length + " of " + answers.length + " answered checks in this audit.",
    nextStep: "Read the answer and compare the buyer need it describes with your own product.",
    answer: gap[1][0],
  });
  const sources = new Map<string, { url: string; domain: string; answers: AnswerResult[] }>();
  for (const answer of answers) {
    const seen = new Set<string>();
    for (const citation of answer.citations) {
      const url = safeEvidenceUrl(citation.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const domain = normalizeDomain(url);
      if (domain === normalizeDomain(run.domain)) continue;
      const current = sources.get(url) ?? { url, domain, answers: [] };
      current.answers.push(answer);
      sources.set(url, current);
    }
  }
  const source = [...sources.values()].sort((a, b) => b.answers.length - a.answers.length)[0];
  if (source) findings.push({
    kind: "source", title: source.domain + " is a source to investigate",
    detail: "This page was cited in " + source.answers.length + " answered " + (source.answers.length === 1 ? "check" : "checks") + ". A citation is not an endorsement or proof of a business competitor.",
    nextStep: "Inspect what the page explains and whether its information about your category is accurate.",
    answer: source.answers[0], sourceUrl: source.url,
  });
  const unansweredBrand = answers.find((answer) => !answer.brandMentioned && answer.id !== findings[0]?.answer.id);
  if (unansweredBrand) findings.push({
    kind: "question", title: "A buyer question with no brand mention",
    detail: unansweredBrand.prompt,
    nextStep: "Check whether this question fits your buyers before deciding to investigate a content gap.",
    answer: unansweredBrand,
  });
  if (!gaps.size && mentioned && findings.length < 3) findings.push({
    kind: "presence", title: run.brand + " appeared in " + mentioned + " of " + answers.length + " answered checks",
    detail: "This is a sample of the selected questions and engines, not all AI conversations.",
    nextStep: "Review the wording and source evidence for accuracy before relying on the recommendation.",
    answer: answers.find((answer) => answer.brandMentioned)!,
  });
  return { requested, answered: answers.length, missing: Math.max(0, requested - answers.length), mentioned, findings: findings.slice(0, 3) };
}
