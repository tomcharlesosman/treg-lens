import { readFile } from "node:fs/promises";
import { test, expect } from "./support/auth-helpers";
import {
  missingPrompt,
  nav,
  primaryKey,
  secondaryKey,
  seedWorkspace,
  saveServerSnapshot,
  storagePrefix,
  waitForServerSave,
} from "./support/workspace-helpers";
import type { SavedRun } from "../../src/lib/workspace-data";

// Seed historical evidence, then exercise the actual recheck form and route.
// Relative dates keep historical answers inside the currently selected period.
test("a completed prompt recheck appends history and displays the latest saved answer per engine", async ({ page }) => {
  const storageKey = await seedWorkspace(page);
  const historical = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.runs.forEach((run: { completedAt: string; results: { completedAt: string }[] }, index: number) => {
      const historicalDate = new Date(Date.now() - (2 - index) * 86_400_000).toISOString();
      run.completedAt = historicalDate;
      run.results.forEach((answer) => { answer.completedAt = historicalDate; });
    });
    return saved;
  }, storageKey);
  await saveServerSnapshot(page, historical);
  await page.reload();
  await expect(page.getByRole("region", { name: "Comparable visibility trends" })).toBeVisible();
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);

  await nav(page, "Prompt tracking");
  await page.locator(".prompt-cell").filter({ hasText: missingPrompt }).click();
  const answers = page.getByRole("dialog", { name: "Behind the answer" });
  await expect(answers.locator(".answer-card")).toHaveCount(2);
  await expect(answers.locator(".answer-top .status-tag").filter({ hasText: "Not mentioned" })).toHaveCount(2);
  await answers.getByRole("button", { name: "Recheck prompt", exact: true }).click();

  const audit = page.getByRole("dialog", { name: "See where you stand." });
  await expect(audit.getByLabel("Prompts to track")).toHaveValue(missingPrompt);
  await expect(audit.getByRole("button", { name: /ChatGPT/ })).toHaveAttribute("aria-pressed", "true");
  await expect(audit.getByRole("button", { name: /Perplexity/ })).toHaveAttribute("aria-pressed", "true");
  let auditRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/aeo/run") && request.method() === "POST") auditRequests += 1;
  });
  await expect(audit.getByRole("button", { name: "Run visibility audit" })).toBeEnabled();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/aeo/run") && response.request().method() === "POST");
  await audit.getByRole("button", { name: "Run visibility audit" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().prompts).toEqual([missingPrompt]);
  await expect(audit.getByText("2 answers collected across 2 engines. Treg appeared in 2 answers.")).toBeVisible();
  await audit.getByRole("button", { name: "Explore your results" }).click();
  expect(auditRequests).toBe(1);

  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.length, storageKey)).toBe(3);
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(after.runs.slice(0, 2)).toEqual(before.runs);
  expect(after.prompts).toEqual(before.prompts);
  const recheck = after.runs[2] as SavedRun;
  expect(recheck.prompts).toEqual([missingPrompt]);
  expect(recheck.results).toHaveLength(2);
  expect(recheck.results.every((answer) => answer.prompt === missingPrompt && answer.brandMentioned)).toBe(true);
  expect(recheck.results.map((answer) => answer.engine).sort()).toEqual(["chatgpt", "perplexity"]);

  await page.locator(".prompt-cell").filter({ hasText: missingPrompt }).click();
  await expect(answers.locator(".answer-card")).toHaveCount(3);
  const latestPerplexity = answers.locator(".answer-card").filter({ hasText: "Perplexity" });
  await expect(latestPerplexity.locator(".status-tag")).toHaveText("Mentioned #1");
  await latestPerplexity.getByText(/Read full answer/).click();
  await expect(latestPerplexity.getByRole("heading", { name: "AI visibility toolkit comparison" })).toBeVisible();
  await expect(latestPerplexity.getByRole("heading", { name: "Alternative tools" })).toHaveCount(0);
  const unchangedGemini = answers.locator(".answer-card").filter({ hasText: "Gemini" });
  await expect(unchangedGemini.locator(".status-tag")).toHaveText("Not mentioned");
  await expect(unchangedGemini.locator(".answer-preview")).toContainText("Alternative tools");
  await answers.getByRole("button", { name: "Close dialog" }).click();

  await nav(page, "Audit history");
  await expect(page.getByText("3 RUNS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open audit", exact: true }).first().click();
  const latestAudit = page.getByRole("dialog", { name: "Treg visibility audit" });
  await expect(latestAudit.locator(".answer-card")).toHaveCount(2);
  await expect(latestAudit).toContainText("$0.004");
  await latestAudit.getByRole("button", { name: "Close dialog" }).click();
  await waitForServerSave(page);
  await page.reload();
  await nav(page, "Audit history");
  await expect(page.getByText("3 RUNS", { exact: true })).toBeVisible();
  await nav(page, "Prompt tracking");
  await page.locator(".prompt-cell").filter({ hasText: missingPrompt }).click();
  await expect(answers.locator(".answer-card")).toHaveCount(3);
  await expect(answers.locator(".answer-card").filter({ hasText: "Perplexity" }).locator(".status-tag")).toHaveText("Mentioned #1");
  expect(auditRequests).toBe(1);
});

test("a blocked workspace storage write offers a backup and exports current unsaved data without credentials", async ({ page }) => {
  const storageKey = await seedWorkspace(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Your workspace." });
  await settings.getByLabel(/API token/).fill(secondaryKey);
  await settings.getByRole("button", { name: "Save changes" }).click();
  await expect(settings).toBeHidden();
  const persistedBefore = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await page.evaluate(({ key, prefix }) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(this: Storage, name: string, value: string) {
      if (this === window.localStorage && name === key && name.startsWith(prefix))
        throw new DOMException("The browser storage quota has been exceeded.", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, { key: storageKey, prefix: storagePrefix });

  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Add prompt", exact: true }).click();
  const addPrompt = page.getByRole("dialog", { name: "A good question opens doors." });
  const unsavedPrompt = "Which Treg features survive a full browser storage quota?";
  await addPrompt.getByLabel("Buyer question").fill(unsavedPrompt);
  await addPrompt.getByRole("button", { name: "Add prompt", exact: true }).click();
  await expect(page.locator(".prompt-cell").filter({ hasText: unsavedPrompt })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toContainText("Browser storage is full or unavailable.");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(persistedBefore);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^treg-lens-treg\.to-.*\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const reportText = await readFile(downloadPath!, "utf8");
  const report = JSON.parse(reportText);
  expect(report.demo).toBe(false);
  expect(report.project.brand).toBe("Treg");
  expect(report.prompts).toContain(unsavedPrompt);
  expect(report.prompts).toHaveLength(9);
  expect(report.runs).toHaveLength(2);
  expect(report.runs.map((run: SavedRun) => run.id)).toEqual(["earlier-run", "latest-run"]);
  expect(reportText).not.toContain(primaryKey);
  expect(reportText).not.toContain(secondaryKey);
  expect(reportText).not.toContain("treg_lens_session");
  await expect(page.locator('.toast[role="status"]')).toContainText("JSON report exported.");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(persistedBefore);
});
