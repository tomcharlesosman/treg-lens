import type { AnswerResult, Engine } from "./aeo";
export type Project = { brand: string; domain: string; competitors: string[] };
export type SavedRun = {
  id: string;
  brand: string;
  domain: string;
  prompts?: string[];
  competitors?: string[];
  engines?: Engine[];
  results: AnswerResult[];
  errors: { prompt: string; engine: string; error: string }[];
  totalCostUsd: number;
  totalCostKnown?: boolean;
  completedAt: string;
};
export const DEFAULT_PROJECT: Project = {
  brand: "Treg",
  domain: "treg.to",
  competitors: ["Composio", "Firecrawl", "Apify"],
};
export const ENGINES: {
  id: Engine;
  name: string;
  color: string;
  description: string;
}[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    color: "#118453",
    description: "Web answers",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    color: "#4791a1",
    description: "Sonar model API",
  },
  {
    id: "gemini",
    name: "Gemini",
    color: "#7d7db2",
    description: "Web answers",
  },
  {
    id: "google",
    name: "Google AI Mode",
    color: "#d2a65f",
    description: "Search answers",
  },
];
export const DEFAULT_PROMPTS = [
  "What are the best tools to connect AI agents to external APIs?",
  "Which API toolkit is best for building AI agents?",
  "What are the best alternatives to Composio?",
  "How can I track my brand visibility in AI search?",
  "Which tools offer pay-as-you-go data APIs for AI agents?",
  "What is the easiest way to give an AI agent web search?",
  "Which platforms combine SEO data and AI search tools?",
  "What are the best open-source tools for answer engine optimization?",
];
export function normalizeDomain(value: string) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return value
      .toLowerCase()
      .replace(/^www\./, "")
      .split("/")[0];
  }
}
export function visibility(results: AnswerResult[], domain: string) {
  if (!results.length) return 0;
  const host = normalizeDomain(domain);
  return (
    results.reduce(
      (sum, r) =>
        sum +
        (50 * Number(r.brandMentioned) +
          30 * (r.brandMentioned && r.position ? 1 / r.position : 0) +
          20 *
            Number(
              r.citations.some(
                (c) => normalizeDomain(c.domain || c.url) === host,
              ),
            )),
      0,
    ) / results.length
  );
}
export function mentionRate(results: AnswerResult[]) {
  return results.length
    ? (100 * results.filter((r) => r.brandMentioned).length) / results.length
    : 0;
}
export function brandStats(results: AnswerResult[], brands: string[]) {
  return brands
    .map((brand, brandIndex) => {
      const mentions = results.filter((r) =>
        r.mentionedBrands.some((b) => b.toLowerCase() === brand.toLowerCase()),
      );
      const positions = mentions.map((r) =>
        brandIndex === 0 && r.position
          ? r.position
          : r.mentionedBrands.findIndex(
              (b) => b.toLowerCase() === brand.toLowerCase(),
            ) + 1,
      );
      return {
        brand,
        mentions: mentions.length,
        visibility: results.length
          ? (mentions.length / results.length) * 100
          : 0,
        position: positions.length
          ? positions.reduce((a, b) => a + b, 0) / positions.length
          : 0,
      };
    })
    .sort((a, b) => b.visibility - a.visibility);
}
export function sourceStats(results: AnswerResult[]) {
  const map = new Map<
    string,
    {
      domain: string;
      url: string;
      title: string;
      citations: number;
      answers: Set<string>;
      engines: Set<string>;
    }
  >();
  results.forEach((r) =>
    r.citations.forEach((c) => {
      const domain = normalizeDomain(c.domain || c.url);
      if (!domain) return;
      const row = map.get(domain) || {
        domain,
        url: c.url,
        title: c.title,
        citations: 0,
        answers: new Set<string>(),
        engines: new Set<string>(),
      };
      row.citations++;
      row.answers.add(r.id);
      row.engines.add(r.engine);
      map.set(domain, row);
    }),
  );
  return [...map.values()]
    .sort((a, b) => b.answers.size - a.answers.size)
    .map((r) => ({
      ...r,
      answerCount: r.answers.size,
      engines: [...r.engines],
      share: results.length ? (r.answers.size / results.length) * 100 : 0,
    }));
}
// Deterministic, explicitly illustrative answers. Never used as a fallback for live calls.
export function createDemoRuns(): SavedRun[] {
  const start = Date.UTC(2026, 8, 22);
  return Array.from({ length: 28 }, (_, day) => {
    const completedAt = new Date(start + day * 86400000).toISOString();
    const results: AnswerResult[] = DEFAULT_PROMPTS.flatMap((prompt, p) =>
      ENGINES.map((engine, e) => {
        const seed = (day * 31 + p * 17 + e * 23) % 100;
        const mentioned =
          seed < 54 + day * 0.75 + (e === 0 ? 8 : e === 3 ? -5 : 0);
        const brands = ["Composio", "Firecrawl", "Apify"].filter(
          (_, b) => (seed + b * 29) % 100 < 64,
        );
        if (mentioned) brands.splice(seed % 3, 0, "Treg");
        const domains = [
          "reddit.com",
          "github.com",
          "dev.to",
          "youtube.com",
          "treg.to",
        ];
        const cited = domains.filter((d, c) =>
          d === "treg.to"
            ? mentioned && seed % 3 !== 0
            : (seed + c * 11) % 5 < 2,
        );
        return {
          id: `demo-${day}-${p}-${e}`,
          prompt,
          engine: engine.id,
          answer: `For this use case, ${brands.length ? brands.join(", ") : "several API platforms"} offer useful options. ${mentioned ? "Treg combines a catalog of data and tools with one token and pay-as-you-go access. " : ""}Compare integration coverage, usage pricing, and the specific data your agent needs before choosing a platform. This is an illustrative answer for the demo workspace.`,
          citations: cited.map((domain) => ({
            domain,
            url: `https://${domain}${domain === "treg.to" ? "/aeo" : ""}`,
            title:
              domain === "treg.to"
                ? "Treg AEO toolkit"
                : `AI tools and integrations — ${domain}`,
          })),
          mentionedBrands: brands,
          brandMentioned: mentioned,
          position: mentioned ? brands.indexOf("Treg") + 1 : null,
          costUsd: 0,
          completedAt,
        };
      }),
    );
    return {
      id: `demo-${day}`,
      brand: "Treg",
      domain: "treg.to",
      results,
      errors: [],
      totalCostUsd: 0,
      completedAt,
    };
  });
}
export function downloadFile(
  filename: string,
  data: string,
  type = "application/json",
) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
    text.replaceAll('"', '""') +
    '"'
  );
}
export function resultsCsv(results: AnswerResult[]) {
  return [
    [
      "Prompt",
      "Engine",
      "Brand mentioned",
      "Brand position",
      "Mentioned brands",
      "Citations",
      "Answer",
      "Cost USD",
      "Completed at",
    ],
    ...results.map((r) => [
      r.prompt,
      r.engine,
      r.brandMentioned,
      r.position,
      r.mentionedBrands.join("; "),
      r.citations.map((c) => c.url).join("; "),
      r.answer,
      r.costKnown === false ? null : r.costUsd,
      r.completedAt,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
