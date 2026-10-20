import type { Page } from "@playwright/test";
import { test, expect } from "./support/auth-helpers";
import { waitForServerSave } from "./support/workspace-helpers";

const market = { country: "US", language: "en" };
const audience = "Independent SaaS founders choosing their first analytics tool.";
const question = "Which analytics tool fits an independent SaaS founder?";

async function login(page: Page, key = `treg-e2e-context-${crypto.randomUUID()}`) {
  await page.goto("/login");
  await page.getByLabel("Treg API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Put your brand in focus." })).toBeVisible();
  return key;
}

function requests(page: Page) {
  const estimates: Record<string, unknown>[] = [];
  const research: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const schedules: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/aeo/onboard" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      (body.estimateOnly ? estimates : research).push(body);
    }
    if (path === "/api/aeo/run" && request.method() === "POST") audits.push(request.postDataJSON());
    if (path === "/api/monitor" && request.method() === "PUT") schedules.push(request.postDataJSON());
  });
  return { estimates, research, audits, schedules };
}

async function research(page: Page, path: string) {
  await page.getByLabel("Website URL", { exact: true }).fill(`https://example.com/${path}`);
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
}

async function saved(page: Page) {
  const response = await page.request.get("/api/workspace");
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await waitForServerSave(page);
  const workspace = await saved(page);
  const monitor = await page.request.get("/api/monitor");
  expect(monitor.ok()).toBe(true);
  expect((await monitor.json()).schedule).toBeNull();
  expect(workspace.snapshot.runs).toEqual([]);
  return workspace.snapshot;
}

test("a name-only competitor's corrected website survives step changes, reload and the server save", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await research(page, "name-only");
  const competitorSite = page.getByLabel("Competitor 1 website", { exact: true });
  await expect(competitorSite).toHaveValue("");
  await competitorSite.fill("https://northstar.example.com/product");
  await page.getByLabel("Competitor 1", { exact: true }).fill("Northstar Reviewed");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByRole("button", { name: "Brand", exact: true }).last().click();
  await expect(competitorSite).toHaveValue(/northstar\.example\.com/);
  await page.reload();
  await expect(competitorSite).toHaveValue(/northstar\.example\.com/);
  await expect(page.getByLabel("Competitor 1", { exact: true })).toHaveValue("Northstar Reviewed");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  const snapshot = await save(page);
  expect(snapshot.project.competitors).toContain("Northstar Reviewed");
  expect(snapshot.project.competitorDetails).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Northstar Reviewed", domain: "northstar.example.com" }),
  ]));
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toEqual([]);
  expect(calls.schedules).toEqual([]);
});

test("reviewed buyer context, question intent and edited provenance persist without an automatic paid audit", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await page.getByLabel("Who are your buyers?", { exact: true }).fill(audience);
  await expect(page.getByText("United States · English", { exact: true }).first()).toBeVisible();
  await research(page, "rich-context");
  expect(calls.estimates[0]).toMatchObject({ audience, market });
  expect(calls.research[0]).toMatchObject({ audience, market, maxCostUsd: 0.005 });
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue(audience);
  const reviewedAudience = `${audience} Budget under $100 per month.`;
  await page.getByLabel("Who are your buyers?", { exact: true }).fill(reviewedAudience);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByText("AI suggestion", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(3);
  await page.getByLabel("Track buyer question 1", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Use starter selection", exact: true }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(3);
  await expect(page.getByLabel("Track buyer question 1", { exact: true })).toBeChecked();
  const original = await page.getByLabel("Buyer question 1", { exact: true }).inputValue();
  await page.getByLabel("Buyer question 1", { exact: true }).fill(question);
  await page.getByLabel("Intent for buyer question 1", { exact: true }).selectOption("purchase");
  await page.getByLabel("Track buyer question 1", { exact: true }).check();
  await expect(page.getByText("Edited by you", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue(question);
  await expect(page.getByLabel("Intent for buyer question 1", { exact: true })).toHaveValue("purchase");
  const snapshot = await save(page);
  expect(snapshot.project).toMatchObject({ audience: reviewedAudience, market });
  expect(snapshot.project.buyerQuestions).toHaveLength(6);
  expect(snapshot.project.buyerQuestions).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: question, intent: "purchase", provenance: "manual" }),
  ]));
  expect(snapshot.prompts).toContain(question);
  expect(snapshot.project.researchReceipts).toHaveLength(1);
  expect(snapshot.project.researchReceipts[0]).toMatchObject({ audience, market, costKnown: true, totalCostUsd: 0.005 });
  const submittedInput = { url: "https://example.com/rich-context", audience, market };
  expect(snapshot.project.researchReceipts[0].input).toEqual(submittedInput);
  expect(snapshot.project.researchReceipts[0].questions).toContain(original);
  expect(snapshot.project.researchReceipts[0].questions).not.toContain(question);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect((await saved(page)).snapshot.project.researchReceipts[0].input).toEqual(submittedInput);
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toEqual([]);
  expect(calls.schedules).toEqual([]);
});

test("the free manual path keeps buyer context, competitor websites and chosen intent", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await page.getByLabel("Website URL", { exact: true }).fill("example.com/manual");
  await page.getByLabel("Who are your buyers?", { exact: true }).fill(audience);
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await page.getByLabel("Brand name", { exact: true }).fill("Manual Context Brand");
  await page.getByLabel(/^Business description/).fill("Product analytics for independent SaaS teams.");
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue(audience);
  await page.getByRole("button", { name: "Add competitor", exact: true }).click();
  await page.getByLabel("Competitor 1", { exact: true }).fill("Manual Rival");
  await page.getByLabel("Competitor 1 website", { exact: true }).fill("manual-rival.example.com");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByLabel("Buyer question 1", { exact: true }).fill(question);
  await page.getByLabel("Intent for buyer question 1", { exact: true }).selectOption("use-case");
  const snapshot = await save(page);
  expect(snapshot.project).toMatchObject({
    audience, market,
    competitorDetails: [{ name: "Manual Rival", domain: "manual-rival.example.com" }],
    buyerQuestions: [{ text: question, intent: "use-case", provenance: "manual" }],
  });
  expect(snapshot.project.researchReceipts ?? []).toEqual([]);
  expect(calls).toEqual({ estimates: [], research: [], audits: [], schedules: [] });
});

test("editing buyer context invalidates the previous research approval and preserves the new draft", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await page.getByLabel("Website URL", { exact: true }).fill("example.com/onboarding");
  await page.getByLabel("Who are your buyers?", { exact: true }).fill("Enterprise analytics teams.");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Research my brand/ })).toBeEnabled();
  await page.getByLabel("Who are your buyers?", { exact: true }).fill(audience);
  await expect(page.getByRole("button", { name: /^Research my brand/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue(audience);
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  expect(calls.estimates).toHaveLength(2);
  expect(calls.estimates[1]).toMatchObject({ audience, market });
  expect(calls.research).toEqual([]);
});

test("supporting competitor links are safe and unmatched suggestions stay explicitly unverified", async ({ page }) => {
  await login(page);
  await research(page, "unsafe-evidence");
  const evidence = page.getByRole("link", { name: "View supporting source", exact: true });
  await expect(evidence).toHaveCount(1);
  await expect(evidence).toHaveAttribute("href", "https://northstar.example.com/product");
  await expect(evidence).toHaveAttribute("rel", /noopener|noreferrer/);
  for (const competitor of [1, 2]) {
    const row = page.locator(".ob-competitor").nth(competitor);
    await expect(row.getByText("Suggested competitor · verify this fit", { exact: true })).toBeVisible();
    await expect(row.getByRole("link")).toHaveCount(0);
  }
  await page.locator(".ob-receipt summary").click();
  await expect(page.locator(".ob-receipt").getByRole("link", { name: "Northstar product overview", exact: true })).toBeVisible();
  expect(await page.locator(".brand-onboarding a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))))
    .not.toEqual(expect.arrayContaining([expect.stringMatching(/javascript:|127\.0\.0\.1|user:password/)]));
  await expect(page.getByText("Unsafe script source", { exact: true })).toHaveCount(0);
});

test("partial research remains usable and its unknown charge is retained through manual completion", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await research(page, "unknown-cost/partial");
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await expect(page.getByText(/Some suggestions are missing/).first()).toBeVisible();
  await expect(page.getByText(/unknown/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByLabel("Buyer question 1", { exact: true }).fill(question);
  const snapshot = await save(page);
  expect(snapshot.project.researchReceipts).toHaveLength(1);
  expect(snapshot.project.researchReceipts[0]).toMatchObject({
    brand: "Acme Analytics", competitors: [], questions: [], costKnown: false, totalCostUsd: null,
  });
  expect(snapshot.project.researchReceipts[0].input).toEqual({
    url: "https://example.com/unknown-cost/partial", audience: "", market,
  });
  expect(snapshot.project.researchReceipts[0].callIds).toHaveLength(1);
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toEqual([]);
  expect(calls.schedules).toEqual([]);
});

test("unverified research keeps its warning and lets the owner continue without buying another answer", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await research(page, "unverified");
  await expect(page.getByText(/Treat these suggestions as unverified/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "View supporting source", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  const snapshot = await save(page);
  expect(snapshot.project.researchReceipts[0].sources).toEqual([]);
  expect(snapshot.project.researchReceipts[0].errors[0].error).toMatch(/unverified/i);
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toEqual([]);
});

test("an invalid competitor website blocks readiness without discarding the correction draft", async ({ page }) => {
  const calls = requests(page);
  await login(page);
  await research(page, "name-only");
  await page.getByLabel("Competitor 1 website", { exact: true }).fill("http://127.0.0.1/private");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Review your brand" }).getByRole("alert")).toContainText(/website|public|competitor/i);
  await expect(page.getByLabel("Competitor 1 website", { exact: true })).toHaveValue("http://127.0.0.1/private");
  expect((await saved(page)).snapshot).toBeNull();
  await page.getByLabel("Competitor 1 website", { exact: true }).fill("northstar.example.com");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toEqual([]);
});

test("blocked draft storage prevents a paid research submission while leaving free manual setup available", async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.includes(":onboarding:")) throw new DOMException("Fixture storage denied", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  const calls = requests(page);
  await login(page);
  await page.getByLabel("Website URL", { exact: true }).fill("example.com/onboarding");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByRole("region", { name: "Your website" }).getByRole("alert").last()).toContainText(/storage|browser|save|recovery/i);
  expect(calls.research).toEqual([]);
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  expect(calls.audits).toEqual([]);
});
