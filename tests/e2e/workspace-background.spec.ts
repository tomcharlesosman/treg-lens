import type { Page } from "@playwright/test";
import { test, expect } from "./support/auth-helpers";
import { nav, openAudit, signIn } from "./support/workspace-helpers";

async function holdPaidResponse(page: Page, endpoint: "run" | "discover") {
  let release!: () => void;
  let responseReceived!: () => void;
  const releaseGate = new Promise<void>((resolve) => { release = resolve; });
  const responseReady = new Promise<void>((resolve) => { responseReceived = resolve; });
  const requests: Record<string, unknown>[] = [];
  await page.route(`**/api/aeo/${endpoint}`, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    if (body.estimateOnly === true) {
      await route.continue();
      return;
    }
    requests.push(body);
    // Execute the real Next handler against the server's zero-cost Treg
    // fixture, then delay only delivery of its response to the browser.
    const response = await route.fetch();
    responseReceived();
    await releaseGate;
    await route.fulfill({ response });
  });
  return { requests, responseReady, release };
}

test("an audit keeps running when closed and reopened, then saves exactly one retained result", async ({ page }) => {
  const storageKey = await signIn(page);
  const prompt = "Which tools support a background AI visibility audit?";
  const held = await holdPaidResponse(page, "run");
  const audit = await openAudit(page, prompt);
  try {
    await audit.getByRole("button", { name: "Run visibility audit" }).click();
    await held.responseReady;
    await expect(audit.getByRole("status")).toContainText("Your audit continues if you close this window.");
    await expect(audit.getByRole("button", { name: "Running audit", exact: true })).toBeDisabled();
    await audit.getByRole("button", { name: "Close audit" }).click();
    await expect(audit).toBeHidden();

    await page.getByRole("button", { name: "Run an audit", exact: true }).first().click();
    await expect(audit).toBeVisible();
    await expect(audit.getByLabel("Prompts to track")).toHaveValue(prompt);
    await expect(audit.getByLabel("Prompts to track")).toBeDisabled();
    await expect(audit.getByRole("button", { name: "Running audit", exact: true })).toBeDisabled();
    expect(held.requests).toHaveLength(1);
    expect(held.requests[0].prompts).toEqual([prompt]);

    held.release();
    await expect(audit.getByRole("heading", { name: "Your next move starts here." })).toBeVisible();
    await expect(audit).toContainText("2 answers collected across 2 engines.");
    await audit.getByRole("button", { name: "Explore your results" }).click();
    await expect(audit).toBeHidden();
    await nav(page, "Audit history");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.length, storageKey)).toBe(1);
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
    expect(saved.runs[0].prompts).toEqual([prompt]);
    expect(saved.runs[0].results).toHaveLength(2);
    expect(saved.runs[0].errors).toEqual([]);
    expect(held.requests).toHaveLength(1);
  } finally {
    held.release();
  }
});

test("prompt discovery keeps running and retains its results through closing and reopening without a second paid request", async ({ page }) => {
  const storageKey = await signIn(page);
  await nav(page, "Prompt tracking");
  const held = await holdPaidResponse(page, "discover");
  const openDiscovery = page.getByRole("button", { name: "Discover prompts", exact: true });
  await openDiscovery.click();
  const discovery = page.getByRole("dialog", { name: "Find your next question." });
  const seeds = ["Background research APIs", "Answer engine visibility"];
  await discovery.getByLabel("Seed keyword 1").fill(seeds[0]);
  await discovery.getByLabel("Seed keyword 2").fill(seeds[1]);
  const launch = discovery.getByRole("button", { name: "Discover prompts", exact: true });
  try {
    await expect(launch).toBeEnabled();
    await launch.click();
    await held.responseReady;
    await expect(discovery.getByRole("status")).toContainText("You can close this window and return to your results in this tab.");
    await discovery.getByRole("button", { name: "Close prompt discovery" }).click();
    await expect(discovery).toBeHidden();

    await openDiscovery.click();
    await expect(discovery.getByRole("button", { name: "Discovering", exact: true })).toBeDisabled();
    await expect(discovery.getByLabel("Seed keyword 1")).toHaveValue(seeds[0]);
    await expect(discovery.getByLabel("Seed keyword 2")).toHaveValue(seeds[1]);
    await expect(discovery.getByLabel("Seed keyword 1")).toBeDisabled();
    expect(held.requests).toHaveLength(1);
    expect(held.requests[0].seeds).toEqual(seeds);

    held.release();
    await expect(discovery.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true");
    await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("3 / 8 selected");
    const selected = await discovery.locator(".lens-discovery-candidate.is-selected .lens-discovery-candidate-content > strong").allTextContents();
    expect(selected).toHaveLength(3);
    await discovery.getByRole("button", { name: "Close prompt discovery" }).click();
    await openDiscovery.click();
    await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("3 / 8 selected");
    await expect(discovery.getByRole("tabpanel").locator(".lens-discovery-candidate.is-selected")).toHaveCount(3);
    expect(held.requests).toHaveLength(1);

    await discovery.getByRole("button", { name: "Add 3 prompts", exact: true }).click();
    await expect(discovery).toBeHidden();
    for (const prompt of selected) {
      await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
    }
    await expect.poll(() => page.evaluate(({ key, selected }) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      return selected.every((prompt) => saved.prompts.filter((item: string) => item === prompt).length === 1);
    }, { key: storageKey, selected })).toBe(true);
    expect(held.requests).toHaveLength(1);
  } finally {
    held.release();
  }
});

test("discovery caps combined selections at eight and resets choices before trying different seeds", async ({ page }) => {
  await signIn(page);
  await nav(page, "Prompt tracking");
  const paidRequests: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/aeo/discover" || request.method() !== "POST") return;
    const body = request.postDataJSON() as Record<string, unknown>;
    if (body.estimateOnly !== true) paidRequests.push(body);
  });
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  const discovery = page.getByRole("dialog", { name: "Find your next question." });
  const launch = discovery.getByRole("button", { name: "Discover prompts", exact: true });
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true");
  const firstCompletedAt = Date.now();
  await discovery.getByRole("tab", { name: /^Keywords/ }).click();
  await discovery.getByRole("button", { name: "Select top 6", exact: true }).click();
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("6 / 8 selected");
  await discovery.getByRole("tab", { name: /^Questions/ }).click();
  const questions = discovery.getByRole("tabpanel").getByRole("checkbox");
  expect(await questions.count()).toBeGreaterThanOrEqual(4);
  await questions.nth(0).check();
  await questions.nth(1).check();
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("8 / 8 selected");
  await expect(questions.nth(2)).toBeDisabled();
  await expect(questions.nth(3)).toBeDisabled();
  await expect(discovery.getByRole("button", { name: "Add 8 prompts", exact: true })).toBeEnabled();
  await questions.nth(0).uncheck();
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("7 / 8 selected");
  await expect(questions.nth(2)).toBeEnabled();
  await questions.nth(2).check();
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("8 / 8 selected");
  expect(paidRequests).toHaveLength(1);

  await discovery.getByRole("button", { name: "Try different seeds" }).click();
  await expect(discovery.getByLabel("Seed keyword 1")).toHaveValue("AI agent tools");
  await expect(discovery.getByLabel("Seed keyword 2")).toHaveValue("AI search visibility");
  await expect(discovery.getByRole("tabpanel")).toHaveCount(0);
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveCount(0);
  expect(paidRequests).toHaveLength(1);
  const seeds = ["Alternative research tooling", "Search answer monitoring"];
  await discovery.getByLabel("Seed keyword 1").fill(seeds[0]);
  await discovery.getByLabel("Seed keyword 2").fill(seeds[1]);
  await expect(launch).toBeEnabled();
  // This is the actual server's ten-second duplicate-spend cooldown,
  // rather than a timing delay used to synchronize the UI.
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 10_250 - (Date.now() - firstCompletedAt))));
  await launch.click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true");
  await expect(discovery.locator(".lens-discovery-selected-count")).toHaveText("3 / 8 selected");
  expect(paidRequests).toHaveLength(2);
  expect(paidRequests[1].seeds).toEqual(seeds);
  await expect(discovery.getByRole("tabpanel").getByRole("checkbox").first()).toBeChecked();
});
