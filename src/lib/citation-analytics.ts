import type { AnswerResult, Engine } from "./aeo";
import { normalizeDomain, type SavedRun } from "./workspace-data";
import { evidenceMatchesDomain, safeEvidenceUrl } from "./workspace-profile";

export type CitationOwnership = "owned" | "competitor" | "other" | "unknown";
export type CitationEvidence = {
  key: string;
  runId: string;
  answer: AnswerResult;
  ownership: CitationOwnership;
  owner?: string;
};
export type CitationPage = {
  url: string;
  domain: string;
  title: string;
  evidence: CitationEvidence[];
  ownerships: CitationOwnership[];
  answerCount: number;
  promptCount: number;
  engineCounts: Partial<Record<Engine, number>>;
  coverage: number;
};
export type CitationDomain = Omit<CitationPage, "url" | "title"> & { pages: CitationPage[] };
export type CitationBrand = {
  key: string;
  name: string;
  role: "owned" | "competitor";
  domain: string | null;
  answered: number;
  mentioned: number;
  cited: number | null;
  mentionRate: number;
  citationRate: number | null;
};

/** Only accepted web URLs participate. The upstream citation.domain label is not trusted. */
export function citationOwnership(url: string, run: SavedRun): { ownership: CitationOwnership; owner?: string } {
  if (evidenceMatchesDomain(url, run.domain)) return { ownership: "owned", owner: run.brand };
  const names = new Set((run.competitors ?? []).map((name) => name.trim().toLowerCase()));
  const details = run.competitorDetails?.filter((detail) => names.has(detail.name.trim().toLowerCase())) ?? [];
  const match = details.filter((detail) => detail.domain && evidenceMatchesDomain(url, detail.domain))
    .sort((a, b) => (b.domain?.length ?? 0) - (a.domain?.length ?? 0))[0];
  if (match) return { ownership: "competitor", owner: match.name };
  // Current settings cannot fill gaps in a historical run's identity snapshot.
  const complete = run.competitors !== undefined && [...names].every((name) =>
    details.some((detail) => detail.name.trim().toLowerCase() === name && detail.domain &&
      Boolean(safeEvidenceUrl(detail.domain.includes("://") ? detail.domain : `https://${detail.domain}`))));
  return { ownership: complete ? "other" : "unknown" };
}

function distinctEvidence(rows: CitationEvidence[]) {
  return [...new Map(rows.map((row) => [row.key, row])).values()];
}

function counts(evidence: CitationEvidence[], denominator: number) {
  const engineCounts: Partial<Record<Engine, number>> = {};
  for (const row of evidence) engineCounts[row.answer.engine] = (engineCounts[row.answer.engine] ?? 0) + 1;
  return {
    evidence,
    ownerships: [...new Set(evidence.map((row) => row.ownership))],
    answerCount: evidence.length,
    // Wording is retained in legacy observations; distinct strings are not inferred to be one prompt.
    promptCount: new Set(evidence.map((row) => row.answer.prompt)).size,
    engineCounts,
    coverage: denominator ? evidence.length / denominator * 100 : 0,
  };
}

/** Saved evidence only. Blank/duplicate answer cells and repeated links cannot inflate coverage. */
export function citationAnalytics(runs: SavedRun[], ownership: CitationOwnership | "all" = "all") {
  const observations: Array<{ run: SavedRun; evidence: CitationEvidence }> = [];
  let emptyAnswers = 0;
  for (const run of runs) {
    const cells = new Map<string, AnswerResult>();
    for (const answer of run.results) {
      if (!answer.answer.trim()) { emptyAnswers++; continue; }
      const cell = JSON.stringify([answer.prompt, answer.engine]);
      const previous = cells.get(cell);
      if (!previous || Date.parse(answer.completedAt) > Date.parse(previous.completedAt) ||
        (Date.parse(answer.completedAt) === Date.parse(previous.completedAt) && answer.id.localeCompare(previous.id) > 0)) cells.set(cell, answer);
    }
    for (const [cell, answer] of cells) {
      observations.push({ run, evidence: {
        key: JSON.stringify([run.id, cell]), runId: run.id, answer, ownership: "unknown",
      } });
    }
  }
  const pageMap = new Map<string, { url: string; domain: string; title: string; evidence: CitationEvidence[] }>();
  const brands = new Map<string, CitationBrand>();
  let unsafeCitations = 0;
  for (const { run, evidence } of observations) {
    const urls = [...new Set(evidence.answer.citations.flatMap((citation) => {
      const url = safeEvidenceUrl(citation.url);
      if (!url) { unsafeCitations++; return []; }
      return [url];
    }))];
    const identities: Array<{ name: string; role: "owned" | "competitor"; domain: string | null }> = [
      { name: run.brand, role: "owned", domain: normalizeDomain(run.domain) },
      ...[...new Map((run.competitors ?? []).map((name) => [name.trim().toLowerCase(), name])).values()].map((name) => {
        const detail = run.competitorDetails?.find((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase());
        const domain = detail?.domain && safeEvidenceUrl(detail.domain.includes("://") ? detail.domain : `https://${detail.domain}`);
        return { name, role: "competitor" as const, domain: domain ? normalizeDomain(domain) : null };
      }),
    ];
    for (const identity of identities) {
      const key = JSON.stringify([identity.role, identity.name.toLowerCase(), identity.domain]);
      const row = brands.get(key) ?? { ...identity, key, answered: 0, mentioned: 0,
        cited: identity.domain ? 0 : null, mentionRate: 0, citationRate: identity.domain ? 0 : null };
      row.answered++;
      if (identity.role === "owned" ? evidence.answer.brandMentioned : evidence.answer.mentionedBrands.some((name) => name.trim().toLowerCase() === identity.name.trim().toLowerCase())) row.mentioned++;
      if (identity.domain && urls.some((url) => evidenceMatchesDomain(url, identity.domain!))) row.cited!++;
      row.mentionRate = row.mentioned / row.answered * 100;
      row.citationRate = row.cited === null ? null : row.cited / row.answered * 100;
      brands.set(key, row);
    }
    for (const url of urls) {
      const owner = citationOwnership(url, run);
      if (ownership !== "all" && owner.ownership !== ownership) continue;
      const citation = evidence.answer.citations.find((row) => safeEvidenceUrl(row.url) === url)!;
      const page = pageMap.get(url) ?? { url, domain: normalizeDomain(url), title: citation.title || normalizeDomain(url), evidence: [] };
      page.evidence.push({ ...evidence, ...owner });
      pageMap.set(url, page);
    }
  }
  const answered = observations.length;
  const pages: CitationPage[] = [...pageMap.values()].map((row) => ({ ...row, ...counts(distinctEvidence(row.evidence), answered) }))
    .sort((a, b) => b.answerCount - a.answerCount || a.url.localeCompare(b.url));
  const domainMap = new Map<string, CitationPage[]>();
  for (const page of pages) domainMap.set(page.domain, [...(domainMap.get(page.domain) ?? []), page]);
  const domains: CitationDomain[] = [...domainMap].map(([domain, pages]) => ({ domain, pages,
    ...counts(distinctEvidence(pages.flatMap((page) => page.evidence)), answered) }))
    .sort((a, b) => b.answerCount - a.answerCount || a.domain.localeCompare(b.domain));
  return { answered, emptyAnswers, unsafeCitations, pages, domains, brands: [...brands.values()] };
}
