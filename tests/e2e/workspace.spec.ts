import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEFAULT_PROMPTS } from "../../src/lib/workspace-data";
import { isAbandonedWebKitPrefetch } from "./support/auth-helpers";
import { contextKey, waitForServerSave, freshAddress, missingPrompt, nav, openAudit, primaryKey, secondaryKey, seedWorkspace, signIn, storagePrefix, trackedPrompt } from "./support/workspace-helpers";

const clientErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, browserName, baseURL }) => {
  const errors: string[] = [];
  clientErrors.set(page, errors);
  page.on("pageerror", (error) => { if (!isAbandonedWebKitPrefetch(error, browserName, baseURL)) errors.push(error.message); });
});
test.afterEach(async ({ page }) => {
  expect(clientErrors.get(page), "No uncaught browser errors").toEqual([]);
});

async function downloadText(page: Page, trigger: () => Promise<unknown>) {
  const promise = page.waitForEvent("download");
  await trigger();
  const download = await promise;
  const path = await download.path();
  expect(path).not.toBeNull();
  return { name: download.suggestedFilename(), text: await readFile(path!, "utf8") };
}

async function browserData(page: Page) {
  return page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

test("a delayed dialog opening frame preserves the field the user already focused", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => {
    const nativeFrame = window.requestAnimationFrame.bind(window);
    const harness = window as typeof window & { releaseDialogFrame?: () => void };
    window.requestAnimationFrame = (callback) => {
      if (document.querySelector(".lens-audit-dialog")) {
        window.requestAnimationFrame = nativeFrame;
        harness.releaseDialogFrame = () => callback(performance.now());
        return nativeFrame(() => {});
      }
      return nativeFrame(callback);
    };
  });
  await page.getByRole("button", { name: "Run an audit", exact: true }).first().click();
  const audit = page.getByRole("dialog", { name: "See where you stand." });
  const prompts = audit.getByLabel("Prompts to track");
  await prompts.focus();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { releaseDialogFrame?: () => void }).releaseDialogFrame)).toBe("function");
  await page.evaluate(() => (window as typeof window & { releaseDialogFrame?: () => void }).releaseDialogFrame!());
  await expect(prompts).toBeFocused();
  await prompts.fill("[partial] Which tools should I use?");
  await expect(audit.getByLabel("Brand name", { exact: true })).toHaveValue("Treg");
  await expect(prompts).toHaveValue("[partial] Which tools should I use?");
});

test("empty authenticated workspace, settings validation, persistence, and memory-only key override", async ({ page }) => {
  const storageKey = await signIn(page);
  await expect(page.getByRole("heading", { name: "Your baseline starts here" })).toBeVisible();
  await expect(page.getByText("Your baseline awaits", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "AEO toolkit help" })).toHaveAttribute("href", "https://treg.to/aeo");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByText("Your workspace is ready for its first audit.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Workspace activity", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Your workspace." });
  await expect(settings.getByText("Connected", { exact: true })).toBeVisible();
  const save = settings.getByRole("button", { name: "Save changes" });
  await settings.getByLabel("Brand name", { exact: true }).fill("");
  await expect(save).toBeDisabled();
  await settings.getByLabel("Brand name", { exact: true }).fill("Treg Research");
  await settings.getByLabel("Website", { exact: true }).fill("");
  await expect(save).toBeDisabled();
  await settings.getByLabel("Website", { exact: true }).fill("research.treg.to");
  await settings.getByLabel(/^Competitors/).fill("A, B, C, D, E, F, G, H, I");
  await expect(settings.getByRole("alert")).toHaveText("Keep your comparison focused on up to 8 competitors.");
  await expect(save).toBeDisabled();
  await settings.getByLabel(/^Competitors/).fill("Composio, Firecrawl");
  await settings.getByLabel(/API token/).fill(secondaryKey);
  await save.click();
  await expect(settings).toBeHidden();
  await expect(page.locator('.toast[role="status"]')).toContainText("Workspace settings saved.");
  await expect(page.getByRole("button", { name: /Treg Research workspace/ })).toBeVisible();
  expect(await browserData(page)).not.toContain(primaryKey);
  expect(await browserData(page)).not.toContain(secondaryKey);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(stored.project).toMatchObject({ brand: "Treg Research", domain: "research.treg.to", competitors: ["Composio", "Firecrawl"] });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings.getByLabel(/API token/)).toHaveValue(secondaryKey);
  await settings.getByRole("button", { name: "Close settings" }).click();
  await waitForServerSave(page);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings.getByLabel("Brand name", { exact: true })).toHaveValue("Treg Research");
  await expect(settings.getByLabel(/API token/)).toHaveValue("");
});

test("prompt add, duplicate prevention, remove, answer empty state, search shortcuts, and recheck", async ({ page }) => {
  await signIn(page);
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Add prompt", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "A good question opens doors." });
  await dialog.getByLabel("Buyer question").fill("  How does Treg compare for research?  ");
  await dialog.getByRole("button", { name: "Add prompt", exact: true }).click();
  const prompt = "How does Treg compare for research?";
  await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
  await page.getByRole("button", { name: "Add prompt", exact: true }).click();
  await dialog.getByLabel("Buyer question").fill(prompt.toUpperCase());
  await dialog.getByRole("button", { name: "Add prompt", exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText("You’re already tracking this question.");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Search prompts" })).toBeFocused();
  await page.getByRole("textbox", { name: "Search prompts" }).fill("no-such-buyer-question");
  await expect(page.getByText("No matching prompts. Try another search.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Search prompts" })).toHaveValue("");
  await page.getByRole("textbox", { name: "Search prompts" }).fill("compare for research");
  await page.locator(".search-results").getByRole("button", { name: prompt }).click();
  const detail = page.getByRole("dialog", { name: "Behind the answer" });
  await expect(detail.getByRole("heading", { name: "No answers for this prompt yet" })).toBeVisible();
  await detail.getByRole("button", { name: "Recheck prompt" }).click();
  const audit = page.getByRole("dialog", { name: "See where you stand." });
  await expect(audit.getByLabel("Prompts to track")).toHaveValue(prompt);
  await audit.getByRole("button", { name: "Close audit" }).click();
  await page.getByRole("button", { name: `Remove prompt: ${prompt}`, exact: true }).click();
  await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(0);
  await expect(page.locator('.toast[role="status"]')).toContainText("Existing audit answers are preserved.");
});

test("audit validation, live price breakdown, engine selection, four-engine run, result details, and persistence", async ({ page }) => {
  const key = await signIn(page);
  const audit = await openAudit(page, "Which toolkit is best for AI visibility?", true);
  const launch = audit.getByRole("button", { name: "Run visibility audit" });
  await audit.getByText("View price breakdown", { exact: true }).click();
  await expect(audit.locator(".lens-pricing-details")).toContainText("ChatGPT");
  await expect(audit.locator(".lens-pricing-details")).toContainText("Gemini");
  for (const engine of ["ChatGPT", "Perplexity", "Gemini", "Google AI Mode"]) await audit.getByRole("button", { name: new RegExp(engine) }).click();
  await expect(launch).toBeDisabled();
  for (const engine of ["ChatGPT", "Perplexity", "Gemini", "Google AI Mode"]) await audit.getByRole("button", { name: new RegExp(engine) }).click();
  await audit.getByLabel("Prompts to track").fill(Array.from({ length: 9 }, (_, index) => `Question ${index}?`).join("\n"));
  await expect(launch).toBeDisabled();
  await audit.getByRole("button", { name: "Use example prompts" }).click();
  await expect(audit.getByLabel("Prompts to track")).not.toHaveValue("");
  await audit.getByLabel("Prompts to track").fill("Which toolkit is best for AI visibility?");
  await expect(launch).toBeEnabled();
  const response = page.waitForResponse((response) => response.url().endsWith("/api/aeo/run") && response.request().method() === "POST");
  await launch.click();
  expect((await response).status()).toBe(200);
  await expect(audit.getByText("4 answers collected across 4 engines. Treg appeared in 4 answers.")).toBeVisible();
  await expect(audit.locator(".lens-complete-stats")).toContainText("$0.008");
  await audit.getByRole("button", { name: "Explore your results" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText("Audit complete. 4 real AI answers added.");
  await nav(page, "Audit history");
  await expect(page.getByText("1 RUN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open audit", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Treg visibility audit" });
  await expect(detail.locator(".answer-card")).toHaveCount(4);
  await expect(detail.locator(".answer-meta").filter({ hasText: "Model API" })).toHaveCount(1);
  await detail.getByText(/Read full answer/).first().click();
  await expect(detail.getByRole("heading", { name: "AI visibility toolkit comparison" })).toBeVisible();
  await detail.getByRole("button", { name: "Close dialog" }).click();
  await waitForServerSave(page);
  await page.reload();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(stored.runs).toHaveLength(1);
  expect(stored.runs[0].results.map((result: { engine: string }) => result.engine).sort()).toEqual(["chatgpt", "gemini", "google", "perplexity"]);
});

for (const scenario of [
  { marker: "[partial]", answers: 3, expected: "1 request did not complete." },
  { marker: "[failure]", answers: 0, expected: "4 requests did not complete." },
  { marker: "[unknown-cost]", answers: 4, expected: "Not fully reported" },
]) {
  test(`audit UI records ${scenario.marker} results and honest billing`, async ({ page }) => {
    await signIn(page);
    const audit = await openAudit(page, `${scenario.marker} Which tools should I use?`, true);
    await audit.getByRole("button", { name: "Run visibility audit" }).click();
    await expect(audit.getByRole("heading", { name: "Your next move starts here." })).toBeVisible();
    await expect(audit).toContainText(`${scenario.answers} answers collected`);
    await expect(audit).toContainText(scenario.expected);
    await audit.getByRole("button", { name: "Explore your results" }).click();
    await nav(page, "Audit history");
    await page.getByRole("button", { name: "Open audit", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Treg visibility audit" });
    await expect(detail.locator(".answer-card")).toHaveCount(scenario.answers);
    if (scenario.answers < 4) await expect(detail.locator(".error-notice")).toBeVisible();
    else await expect(detail).toContainText("Charge unavailable");
  });
}

test("discovery validates seeds, prices requests, supports question and keyword selection, and imports prompts", async ({ page }) => {
  await signIn(page);
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  const discovery = page.getByRole("dialog", { name: "Find your next question." });
  const launch = discovery.getByRole("button", { name: "Discover prompts", exact: true });
  await discovery.getByLabel("Seed keyword 1").fill("AI agent tools");
  await discovery.getByLabel("Seed keyword 2").fill("AI agent tools");
  await expect(launch).toBeDisabled();
  await discovery.getByLabel("Seed keyword 2").fill("AI search visibility");
  await discovery.getByRole("button", { name: "Add a third seed" }).click();
  await discovery.getByLabel("Seed keyword 3").fill("Research APIs");
  await discovery.getByRole("button", { name: "Remove third seed" }).click();
  await expect(discovery.getByLabel("Seed keyword 3")).toHaveCount(0);
  await expect(launch).toBeEnabled();
  await discovery.getByText("View price breakdown", { exact: true }).click();
  await expect(discovery.locator(".lens-pricing-details")).toContainText("Keyword");
  await launch.click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true");
  await expect(discovery.getByRole("tabpanel").getByRole("checkbox")).not.toHaveCount(0);
  await discovery.getByRole("button", { name: /^Select top/ }).click();
  await expect(discovery.getByRole("tabpanel").getByRole("checkbox").first()).toBeChecked();
  await discovery.getByRole("tabpanel").getByRole("checkbox").first().uncheck();
  await expect(discovery.getByRole("tabpanel").getByRole("checkbox").first()).not.toBeChecked();
  await discovery.getByRole("tab", { name: /^Keywords/ }).click();
  await discovery.getByRole("button", { name: /^Select top/ }).click();
  const selected = await discovery.getByRole("tabpanel").locator(".lens-discovery-candidate-content > strong").allTextContents();
  expect(selected).toHaveLength(6);
  await expect(discovery.getByRole("tabpanel").getByText("monthly searches")).toHaveCount(6);
  await discovery.getByRole("button", { name: "Add 6 prompts", exact: true }).click();
  await expect(discovery).toBeHidden();
  for (const prompt of selected) await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
  await expect(page.locator(".prompt-cell")).toHaveCount(DEFAULT_PROMPTS.length + 6);
  await waitForServerSave(page);
  await page.reload();
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell")).toHaveCount(DEFAULT_PROMPTS.length + 6);
});

test("overview date and engine filters, interactive chart, competitors, citations, and prompt filters agree", async ({ page }) => {
  await seedWorkspace(page);
  const chart = page.getByRole("img", { name: "Brand mention rate trend" });
  await expect(chart).toBeVisible();
  await page.getByLabel("Date range").selectOption("7");
  await nav(page, "Prompt tracking");
  await expect(page.getByText("8 prompts · 2 answers in selected period", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mentioned", exact: true }).click();
  await expect(page.locator(".prompt-cell")).toHaveCount(1);
  await expect(page.locator(".prompt-cell")).toContainText(trackedPrompt);
  await page.getByRole("button", { name: "Visibility gaps", exact: true }).click();
  await expect(page.locator(".prompt-cell")).toHaveCount(1);
  await expect(page.locator(".prompt-cell")).toContainText(missingPrompt);
  await page.getByRole("button", { name: /^All prompts/ }).click();
  await page.getByLabel("Filter prompts by engine").selectOption("chatgpt");
  await expect(page.getByText("8 prompts · 1 answer in selected period", { exact: true })).toBeVisible();
  await page.getByLabel("Filter prompts by engine").selectOption("all");
  await nav(page, "Competitors");
  await expect(page.getByRole("heading", { name: "Competitive landscape", exact: true })).toBeVisible();
  await expect(page.locator(".competitor-card")).toHaveCount(4);
  await expect(page.locator(".competitor-card").filter({ hasText: "Treg" })).toContainText("50");
  await page.locator(".chart-legend").getByRole("button", { name: "Composio", exact: true }).click();
  await expect(page.locator(".chart-legend").getByRole("button", { name: "Composio", exact: true })).toHaveClass("muted-legend");
  await chart.hover();
  await expect(page.locator(".chart-tooltip")).toBeVisible();
  await page.getByLabel("Filter chart by engine").selectOption("perplexity");
  await nav(page, "Sources & citations");
  await expect(page.getByRole("group", { name: "Citation summary" })).toContainText("1 source domain");
  await expect(page.getByRole("link", { name: "Open example.com", exact: true })).toHaveAttribute("href", "https://example.com/research");
  await nav(page, "Overview");
  await page.getByLabel("Filter chart by engine").selectOption("all");
  await page.getByLabel("Date range").selectOption("28");
  await page.locator(".engine-card").filter({ hasText: "Gemini" }).click();
  await expect(page.getByRole("heading", { name: "Prompt tracking", exact: true })).toBeVisible();
  await expect(page.getByLabel("Filter prompts by engine")).toHaveValue("gemini");
  await expect(page.getByText("8 prompts · 1 answer in selected period", { exact: true })).toBeVisible();
});

test("source research runs through server routes, records authority and contacts, caches evidence, and refreshes pricing first", async ({ page }) => {
  await seedWorkspace(page);
  await nav(page, "Sources & citations");
  const researchButton = page.getByRole("row").filter({ hasText: "example.com" }).getByRole("button", { name: "Research", exact: true });
  let paidLookups = 0;
  let estimates = 0;
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/aeo/source") || request.method() !== "POST") return;
    if (request.postDataJSON().estimateOnly) estimates += 1;
    else paidLookups += 1;
  });
  await researchButton.click();
  const source = page.getByRole("dialog", { name: "Understand the source." });
  await expect(source.getByRole("button", { name: "Research source", exact: true })).toBeEnabled();
  expect(paidLookups).toBe(0);
  const response = page.waitForResponse((response) => response.url().endsWith("/api/aeo/source") && !response.request().postDataJSON().estimateOnly);
  await source.getByRole("button", { name: "Research source", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(source.getByRole("heading", { name: "AI toolkit research", exact: true })).toBeVisible();
  await expect(source.getByText("Author: Alex Researcher", { exact: true })).toBeVisible();
  await expect(source).toContainText("Treg appears 2 times in the returned text.");
  await expect(source.locator(".lens-source-metrics")).toContainText("72");
  await expect(source.locator(".lens-source-metrics")).toContainText("61");
  await expect(source.locator(".lens-source-metrics")).toContainText("128");
  await expect(source.locator(".lens-source-contacts a[href='mailto:editor@example.com']")).toBeVisible();
  await source.getByText("Read extracted excerpt", { exact: true }).click();
  await expect(source.locator(".lens-source-excerpt")).toHaveAttribute("open", "");
  await source.getByRole("button", { name: "Done", exact: true }).click();
  expect(paidLookups).toBe(1);
  const quoted = estimates;
  await researchButton.click();
  await expect(source.getByRole("heading", { name: "AI toolkit research", exact: true })).toBeVisible();
  expect(estimates).toBe(quoted);
  expect(paidLookups).toBe(1);
  await source.getByRole("button", { name: "Refresh research", exact: true }).click();
  await expect(source.getByRole("button", { name: "Research source", exact: true })).toBeEnabled();
  expect(estimates).toBeGreaterThan(quoted);
  expect(paidLookups).toBe(1);
  await freshAddress(page.context());
  await source.getByRole("button", { name: "Research source", exact: true }).click();
  await expect(source.getByRole("heading", { name: "AI toolkit research", exact: true })).toBeVisible();
  expect(paidLookups).toBe(2);
  await source.getByRole("button", { name: "Done", exact: true }).click();
  await waitForServerSave(page);
  await page.reload();
  await nav(page, "Sources & citations");
  await researchButton.click();
  await expect(source.getByRole("heading", { name: "AI toolkit research", exact: true })).toBeVisible();
  expect(paidLookups).toBe(2);
});

test("legacy observations can become durable page plans without inventing comparable collection settings", async ({ page }) => {
  await seedWorkspace(page);
  await nav(page, "Opportunities");
  const opportunity = page.locator(".pp-opportunity");
  await expect(opportunity).toHaveCount(1);
  await expect(opportunity).toContainText(missingPrompt);
  await opportunity.getByRole("button", { name: "Create page plan" }).click();
  const plan = page.getByRole("dialog", { name: "Make the next page count." });
  await expect(plan.getByLabel("Writing brief")).toHaveValue(/Buyer question:/);
  await expect(plan).toContainText("No comparable change yet");
  await expect(plan.getByRole("button", { name: "Review follow-up audit" })).toBeDisabled();
  await plan.getByLabel("Writing brief").fill("Investigate the cited competitor and confirm this buyer question fits our audience.");
  await plan.getByRole("button", { name: "Save page plan", exact: true }).click();
  await expect(plan).toBeHidden();
  await waitForServerSave(page);
  await page.reload();
  await nav(page, "Opportunities");
  await page.locator(".pp-plan-card").getByRole("button", { name: "Open page plan" }).click();
  await expect(plan.getByLabel("Writing brief")).toHaveValue("Investigate the cited competitor and confirm this buyer question fits our audience.");
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.runs).toHaveLength(2);
  expect(saved.snapshot.pagePlans).toHaveLength(1);
  expect(saved.snapshot.pagePlans[0].baselineMeasurement).toBeUndefined();
  expect(saved.snapshot.done).toEqual([]);
});

test("saved answers render complete safe markdown and all CSV, JSON, and single-audit exports exclude credentials", async ({ page }) => {
  await seedWorkspace(page);
  const unsafeRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("tracker.png")) unsafeRequests.push(request.url()); });
  await nav(page, "Prompt tracking");
  await page.locator(".prompt-cell").filter({ hasText: trackedPrompt }).click();
  const detail = page.getByRole("dialog", { name: "Behind the answer" });
  await expect(detail.locator(".answer-card")).toHaveCount(2);
  await detail.getByText(/Read full answer/).first().click();
  const markdown = detail.locator(".answer-markdown").first();
  await expect(markdown.getByRole("heading", { name: "Verified comparison" })).toBeVisible();
  await expect(markdown.getByRole("table")).toBeVisible();
  await expect(markdown.getByRole("link", { name: "Read the evidence" })).toHaveAttribute("href", "https://example.com/research");
  await expect(markdown.locator("script, img, a[href^='javascript:']")).toHaveCount(0);
  await expect(markdown.getByText("Remote tracking image", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __unsafeAnswerExecuted?: boolean }).__unsafeAnswerExecuted)).toBeUndefined();
  expect(unsafeRequests).toEqual([]);
  await detail.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const jsonDownload = await downloadText(page, () => page.getByRole("button", { name: "Download JSON", exact: true }).click());
  expect(jsonDownload.name).toMatch(/^treg-lens-treg.to-.*\.json$/);
  const exported = JSON.parse(jsonDownload.text);
  expect(exported.demo).toBe(false);
  expect(exported.runs).toHaveLength(2);
  expect(exported.prompts).toHaveLength(8);
  expect(exported.project.brand).toBe("Treg");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const csvDownload = await downloadText(page, () => page.getByRole("button", { name: "Download CSV", exact: true }).click());
  expect(csvDownload.name).toMatch(/\.csv$/);
  expect(csvDownload.text).toContain("\"Prompt\"");
  expect(csvDownload.text).toContain(trackedPrompt);
  expect(csvDownload.text).toContain("perplexity");
  await nav(page, "Audit history");
  await page.getByRole("button", { name: "Open audit", exact: true }).first().click();
  const auditDownload = await downloadText(page, () => page.getByRole("button", { name: "Export audit", exact: true }).click());
  expect(auditDownload.name).toBe("treg-audit.json");
  expect(JSON.parse(auditDownload.text).id).toBe("latest-run");
  for (const download of [jsonDownload, csvDownload, auditDownload]) {
    expect(download.text).not.toContain(primaryKey);
    expect(download.text).not.toContain(secondaryKey);
    expect(download.text).not.toContain("treg_lens_session");
  }
});

test("workspace data is isolated per signed-in key and restored when returning to the original key", async ({ page }) => {
  const switchThroughLogin = async (token: string, isNew = false) => {
    await page.getByRole("link", { name: "Treg Lens home" }).click();
    await page.getByRole("link", { name: "Log in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    const form = page.locator(".signin-form-panel");
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "Use a different API key" }).click();
    await form.getByLabel("Treg API key", { exact: true }).fill(contextKey(page.context(), token));
    await form.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(/\/app$/);
    if (isNew) {
      await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue("");
    } else {
      await nav(page, "Overview");
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    }
    const session = await (await page.request.get("/api/auth/session")).json();
    return `${storagePrefix}${session.workspaceId}`;
  };
  const originalKey = await seedWorkspace(page);
  await nav(page, "Opportunities");
  await page.getByRole("button", { name: "Create page plan", exact: true }).first().click();
  const plan = page.getByRole("dialog", { name: "Make the next page count." });
  await plan.getByLabel("Why this page?").fill("A private page decision for the original workspace.");
  await plan.getByRole("button", { name: "Save page plan", exact: true }).click();
  await expect(plan).toBeHidden();
  await waitForServerSave(page);
  const secondKey = await switchThroughLogin(secondaryKey, true);
  expect(secondKey).not.toBe(originalKey);
  await expect(page.getByRole("heading", { name: "Put your brand in focus." })).toBeVisible();
  expect((await (await page.request.get("/api/workspace")).json()).snapshot).toBeNull();
  await switchThroughLogin(primaryKey);
  await nav(page, "Audit history");
  await expect(page.getByText("2 RUNS", { exact: true })).toBeVisible();
  await nav(page, "Opportunities");
  await page.getByRole("button", { name: "Open page plan", exact: true }).click();
  await expect(plan.getByLabel("Why this page?")).toHaveValue("A private page decision for the original workspace.");
  await plan.getByRole("button", { name: "Close page plan", exact: true }).click();
  const storage = await browserData(page);
  expect(storage).not.toContain(primaryKey);
  expect(storage).not.toContain(secondaryKey);
  expect(await page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix) && !key.endsWith(":onboarding:v1")).length, storagePrefix)).toBe(2);
});

test("corrupt local data recovers to an empty workspace and legacy unscoped data is never imported", async ({ page }) => {
  const key = await signIn(page);
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, "{invalid-json");
    localStorage.setItem("treg-lens-workspace-v1", JSON.stringify({ project: { brand: "Legacy secret", domain: "legacy.test", competitors: [] }, prompts: ["Legacy question"], runs: [] }));
    sessionStorage.setItem("treg-lens-token", "legacy-token");
  }, { key });
  await page.reload();
  await expect(page.getByRole("button", { name: /Treg workspace/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your baseline starts here" })).toBeVisible();
  await expect(page.getByText("Legacy secret", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("treg-lens-token"))).toBeNull();
  await expect.poll(() => page.evaluate((key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key)!);
      return { brand: value.project?.brand, runs: value.runs?.length };
    } catch { return null; }
  }, key)).toEqual({ brand: "Treg", runs: 0 });
  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(restored.project.brand).toBe("Treg");
});

for (const malformed of ["missing brand", "null answer list"] as const) {
  test(`malformed saved workspace (${malformed}) recovers without crashing`, async ({ page }) => {
    const key = await signIn(page);
    await page.evaluate(({ key, malformed }) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      if (malformed === "missing brand") saved.project = { domain: "treg.to", competitors: [] };
      else saved.runs = [{ id: "broken", brand: "Treg", domain: "treg.to", completedAt: "2026-10-19T12:00:00.000Z", results: null, errors: [] }];
      localStorage.setItem(key, JSON.stringify(saved));
    }, { key, malformed });
    await page.reload();
    await expect.poll(() => page.evaluate((key) => {
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        return { brand: value.project?.brand, runs: value.runs?.length };
      } catch { return null; }
    }, key)).toEqual({ brand: "Treg", runs: 0 });
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your baseline starts here" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Treg workspace/ })).toBeVisible();
  });
}

test("failed request-key overrides show actionable errors and permit a successful retry", async ({ page }) => {
  await signIn(page);
  const audit = await openAudit(page, "Which API toolkit should I use?");
  await audit.getByText("API credentials", { exact: true }).click();
  await audit.getByLabel(/^Treg API token/).fill("treg-e2e-invalid");
  await audit.getByRole("button", { name: "Run visibility audit" }).click();
  await expect(audit.getByRole("alert")).toContainText(/key|token/i);
  await expect(audit.getByRole("button", { name: "Run visibility audit" })).toBeEnabled();
  await audit.getByLabel(/^Treg API token/).fill("");
  await audit.getByRole("button", { name: "Run visibility audit" }).click();
  await expect(audit.getByRole("heading", { name: "Your next move starts here." })).toBeVisible();
  await audit.getByRole("button", { name: "Explore your results" }).click();
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  const discovery = page.getByRole("dialog", { name: "Find your next question." });
  await discovery.getByLabel("Seed keyword 1").fill("AI agent tools");
  await discovery.getByLabel("Seed keyword 2").fill("AI search visibility");
  await discovery.getByText("API credentials", { exact: true }).click();
  await discovery.getByLabel(/^Treg API token/).fill("treg-e2e-invalid");
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect(discovery.getByRole("alert")).toContainText(/key|token/i);
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Close prompt discovery" }).click();
  await nav(page, "Sources & citations");
  await page.getByRole("row").filter({ hasText: "example.com" }).getByRole("button", { name: "Research", exact: true }).click();
  const source = page.getByRole("dialog", { name: "Understand the source." });
  await expect(source.getByRole("button", { name: "Research source", exact: true })).toBeEnabled();
  await source.locator("details.lens-token-details summary").click();
  await source.getByLabel("Treg token", { exact: true }).fill("treg-e2e-invalid");
  await source.getByRole("button", { name: "Research source", exact: true }).click();
  await expect(source.getByRole("alert")).toContainText(/key|token/i);
  await expect(source.getByRole("button", { name: "Research source", exact: true })).toBeEnabled();
  expect(await browserData(page)).not.toContain("treg-e2e-invalid");
});

test("mobile navigation, help, playbook, open-source dialog, and activity actions remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWorkspace(page);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click({ position: { x: 350, y: 400 } });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await nav(page, "Audit history");
  await expect(page.getByRole("heading", { name: "Audit history", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "The AEO playbook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little clarity goes a long way." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the full AEO workflow" })).toHaveAttribute("href", "https://treg.to/aeo");
  await expect(page.getByText("Visibility = mean(50 × mentioned + 30 × mentioned / position + 20 × cited)")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  const source = page.getByRole("dialog", { name: "Built in the open." });
  await expect(source.getByRole("link", { name: "Explore the source code" })).toHaveAttribute("href", "https://github.com/tomcharlesosman/treg-lens");
  await source.getByRole("button", { name: "Close dialog" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByText("Latest audit completed Oct 19. 2 answers collected.")).toBeVisible();
  await page.locator(".notification-popover").getByRole("button", { name: "Run an audit" }).click();
  await expect(page.getByRole("dialog", { name: "See where you stand." })).toBeVisible();
  await page.getByRole("button", { name: "Close audit" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
