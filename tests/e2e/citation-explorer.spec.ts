import { expect, test, type Page } from "@playwright/test";
import type { AnswerResult } from "../../src/lib/aeo";
import type { SavedRun } from "../../src/lib/workspace-data";
import { isAbandonedWebKitPrefetch } from "./support/auth-helpers";
import { nav, saveServerSnapshot, signIn } from "./support/workspace-helpers";

const firstPrompt = "Which supplier fits our team?";
const secondPrompt = "Which supplier is affordable?";
const originalAnswer = "Saved original comparison: Acme fits our team and the research page explains why.";
const makeAnswer = (patch: Partial<AnswerResult> = {}): AnswerResult => ({
  id: "citation-answer-one", prompt: firstPrompt, engine: "chatgpt", answer: originalAnswer,
  brandMentioned: true, mentionedBrands: ["Acme"], position: 1, costUsd: 0.002, costKnown: true,
  completedAt: "2026-10-20T12:00:00Z",
  citations: [
    { url: "https://example.com/research", domain: "example.com", title: "Supplier research" },
    { url: "https://example.com/research#evidence", domain: "example.com", title: "Repeated supplier research" },
    { url: "https://example.com/second-guide", domain: "example.com", title: "Supplier second guide" },
    { url: "https://docs.acme.com/start", domain: "docs.acme.com", title: "Acme documentation" },
  ], ...patch,
});
function run(patch: Partial<SavedRun> = {}): SavedRun {
  return { id: "citation-current-run", brand: "Acme", domain: "acme.com", competitors: ["Contoso"],
    competitorDetails: [{ name: "Contoso", domain: "example.com" }],
    prompts: [firstPrompt, secondPrompt], engines: ["chatgpt", "gemini"], results: [makeAnswer(), makeAnswer({
      id: "citation-answer-two", prompt: secondPrompt, engine: "gemini", answer: "Contoso fits a tighter budget.",
      brandMentioned: false, mentionedBrands: ["Contoso"], position: null,
      citations: [{ url: "https://example.com/second-guide", domain: "example.com", title: "Supplier second guide" },
        { url: "https://independent.com/reviews", domain: "independent.com", title: "Independent reviews" }],
    })], errors: [], totalCostUsd: 0.004, completedAt: "2026-10-20T12:00:00Z", ...patch };
}
async function seed(page: Page) {
  await signIn(page);
  await saveServerSnapshot(page, {
    // Later settings differ from the historical configuration on purpose.
    project: { brand: "Acme", domain: "acme.com", competitors: ["Contoso"], competitorDetails: [{ name: "Contoso", domain: "changed-profile.com" }], onboardingCompletedAt: "2026-10-20T10:00:00Z" },
    prompts: [firstPrompt, secondPrompt], runs: [run({ id: "citation-legacy-run", competitorDetails: undefined,
      completedAt: "2026-10-19T12:00:00Z", results: [makeAnswer({ id: "citation-legacy-answer", completedAt: "2026-10-19T12:00:00Z",
        citations: [{ url: "https://legacy-guide.com/old", domain: "legacy-guide.com", title: "Legacy research" }] })] }), run()],
    done: [], sourceResearch: {},
  });
  await page.reload();
  await nav(page, "Sources & citations");
}

test("page and domain exploration retains every page, deduplicates coverage and opens exact saved answers without paid requests", async ({ page, browserName, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => { if (!isAbandonedWebKitPrefetch(error, browserName, baseURL)) errors.push(error.message); });
  await seed(page);
  const paid: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source)$/.test(request.url()) && !request.postDataJSON().estimateOnly) paid.push(request.url());
  });
  const explorer = page.getByRole("region", { name: "Citation explorer", exact: true });
  await expect(explorer.getByRole("group", { name: "Citation summary" })).toContainText("4 source domains");
  const table = explorer.getByRole("table", { name: "Saved citation evidence" });
  const supplier = table.getByRole("row").filter({ has: page.getByText("example.com", { exact: true }) });
  await expect(supplier).toContainText("2 cited pages");
  await expect(supplier).toContainText("66.7%");
  await expect(supplier).toContainText("ChatGPT: 1");
  await expect(supplier).toContainText("Gemini: 1");
  await supplier.getByRole("button", { name: "View 2 pages" }).click();
  await expect(explorer.getByRole("status")).toHaveText("Pages on example.com");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  const research = table.getByRole("row").filter({ has: page.getByText("Supplier research", { exact: true }) });
  await expect(research).toContainText("33.3%");
  await research.getByText("View 1 saved answer", { exact: true }).click();
  await research.getByRole("button", { name: "Read saved answer" }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.locator(".answer-preview")).toHaveText(originalAnswer);
  await expect(detail.getByRole("link", { name: "example.com", exact: true }).first()).toHaveAttribute("href", "https://example.com/research");
  await detail.getByRole("button", { name: "Close dialog" }).click();
  const second = table.getByRole("row").filter({ has: page.getByText("Supplier second guide", { exact: true }) });
  await second.getByRole("button", { name: "Research", exact: true }).click();
  const source = page.getByRole("dialog", { name: "Understand the source." });
  await expect(source.locator(".lens-source-address")).toHaveAttribute("href", "https://example.com/second-guide");
  await expect(source.getByRole("button", { name: "Research source", exact: true })).toBeEnabled();
  await source.getByRole("button", { name: "Close source research" }).click();
  expect(paid).toEqual([]);
  expect(errors).toEqual([]);
});

test("ownership and competitor rates use historical domains and keep legacy competitor domains unknown after reload", async ({ page }) => {
  await seed(page);
  const explorer = page.getByRole("region", { name: "Citation explorer", exact: true });
  const table = explorer.getByRole("table", { name: "Saved citation evidence" });
  await explorer.getByLabel("Filter citations by ownership").selectOption("competitor");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("example.com");
  await expect(table).not.toContainText("changed-profile.com");
  await explorer.getByLabel("Filter citations by ownership").selectOption("owned");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("docs.acme.com");
  await explorer.getByLabel("Filter citations by ownership").selectOption("other");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("independent.com");
  await explorer.getByLabel("Filter citations by ownership").selectOption("unknown");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("legacy-guide.com");
  const rates = explorer.getByRole("region", { name: "Independent mention and citation rates" });
  const known = rates.getByRole("row").filter({ has: page.getByText("example.com", { exact: true }) });
  await expect(known).toContainText("1 / 2 (50%)");
  await expect(known).toContainText("2 / 2 (100%)");
  await expect(rates).toContainText("Unknown · no saved domain");
  await page.reload();
  await nav(page, "Sources & citations");
  await explorer.getByLabel("Filter citations by ownership").selectOption("competitor");
  await expect(table).toContainText("example.com");
  await expect(rates).toContainText("Unknown · no saved domain");
});

test("existing engine filters constrain page counts and independent rates", async ({ page }) => {
  await seed(page);
  await nav(page, "Overview");
  await page.getByLabel("Filter chart by engine").selectOption("gemini");
  await nav(page, "Sources & citations");
  const explorer = page.getByRole("region", { name: "Citation explorer", exact: true });
  await explorer.getByRole("button", { name: "Pages", exact: true }).click();
  const table = explorer.getByRole("table", { name: "Saved citation evidence" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).not.toContainText("Supplier research");
  await expect(table).not.toContainText("ChatGPT:");
  const rates = explorer.getByRole("region", { name: "Independent mention and citation rates" });
  await expect(rates.getByRole("row").filter({ has: page.getByText("example.com", { exact: true }) })).toContainText("1 / 1 (100%)");
});
