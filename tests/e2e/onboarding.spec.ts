import type { Page } from "@playwright/test";
import { test, expect, expectNoHorizontalOverflow } from "./support/auth-helpers";
import { nav, waitForServerSave } from "./support/workspace-helpers";

const website = "https://example.com/onboarding";
const firstQuestion = "Which product analytics tools are best for a growing SaaS team?";

function trackResearch(page: Page) {
  const estimates: Record<string, unknown>[] = [];
  const research: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/aeo/onboard") {
      const body = request.postDataJSON() as Record<string, unknown>;
      (body.estimateOnly === true ? estimates : research).push(body);
    }
    if (path === "/api/aeo/run") audits.push(request.postDataJSON());
  });
  return { estimates, research, audits };
}

async function firstLogin(page: Page, key = `treg-e2e-onboarding-${crypto.randomUUID()}`) {
  await page.goto("/login");
  await page.getByLabel("Treg API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Put your brand in focus." })).toBeVisible();
  return key;
}

async function researchBrand(page: Page, url = website) {
  await page.getByLabel("Website URL", { exact: true }).fill(url);
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  const research = page.getByRole("button", { name: /^Research my brand/ });
  await expect(research).toBeEnabled();
  await research.click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
}

async function enterManualBrand(page: Page, brand = "Manual Analytics") {
  await page.getByLabel("Website URL", { exact: true }).fill(website);
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  await page.getByLabel("Brand name", { exact: true }).fill(brand);
  await page.getByLabel(/^Business description/).fill("Analytics for independent software teams.");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  await page.getByLabel("Buyer question 1", { exact: true }).fill("Which analytics tools suit independent software teams?");
}

async function savedWorkspace(page: Page) {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBe(true);
  return response.json();
}

test("first login researches a URL, lets the owner edit every suggestion, and saves before reviewing the first paid audit", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const calls = trackResearch(page);
  const key = await firstLogin(page);
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue("");
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/onboarding-website.png", fullPage: true });
  expect(calls.research).toHaveLength(0);
  expect((await savedWorkspace(page)).snapshot).toBeNull();

  await researchBrand(page);
  expect(calls.estimates).toHaveLength(1);
  expect(calls.research).toHaveLength(1);
  expect(calls.research[0]).toMatchObject({ url: website, maxCostUsd: 0.005 });
  expect(calls.research[0]).not.toHaveProperty("token");
  expect(calls.audits).toHaveLength(0);
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await expect(page.getByLabel("Brand website", { exact: true })).toHaveValue("example.com");
  await expect(page.getByLabel(/^Business description/)).toHaveValue(/customer behavior/);
  await page.locator(".ob-receipt summary").click();
  await expect(page.getByRole("link", { name: "Product analytics comparison", exact: true })).toHaveAttribute("href", "https://example.com/analytics-comparison");
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/onboarding-brand.png", fullPage: true });

  await page.getByLabel("Brand name", { exact: true }).fill("Acme Growth");
  await page.getByLabel(/^Business description/).fill("Practical retention analytics for SaaS product teams.");
  await page.getByLabel("Competitor 1", { exact: true }).fill("Edited Northstar");
  await page.getByRole("button", { name: "Remove competitor 3", exact: true }).click();
  await page.getByRole("button", { name: "Add competitor", exact: true }).click();
  await page.getByLabel("Competitor 3", { exact: true }).fill("Custom Alternative");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/onboarding-questions.png", fullPage: true });
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue(firstQuestion);
  for (const checkbox of await page.getByRole("checkbox", { name: /^Track buyer question \d+$/ }).all()) await checkbox.uncheck();
  await page.getByLabel("Track buyer question 1", { exact: true }).check();
  await page.getByLabel("Track buyer question 2", { exact: true }).check();
  const edited = "Which analytics tools are best for early-stage SaaS?";
  await page.getByLabel("Buyer question 1", { exact: true }).fill(edited);
  await page.getByRole("button", { name: "Remove buyer question 6", exact: true }).click();
  await page.getByRole("button", { name: "Add buyer question", exact: true }).click();
  const custom = "Which analytics tools offer privacy-first retention reports?";
  await page.getByLabel("Buyer question 6", { exact: true }).fill(custom);
  await page.getByLabel("Track buyer question 6", { exact: true }).check();
  await page.getByRole("button", { name: "Save and review first audit", exact: true }).click();

  const audit = page.getByRole("dialog", { name: "See where you stand." });
  await expect(audit).toBeVisible();
  expect(calls.audits).toHaveLength(0);
  const saved = await savedWorkspace(page);
  expect(saved.snapshot.project).toMatchObject({
    brand: "Acme Growth",
    domain: "example.com",
    description: "Practical retention analytics for SaaS product teams.",
    competitors: ["Edited Northstar", "SignalDesk", "Custom Alternative"],
    onboardingCompletedAt: expect.any(String),
  });
  expect(saved.snapshot.prompts).toEqual([edited, "How does Acme Analytics compare with Northstar?", custom]);
  expect(saved.snapshot.runs).toEqual([]);
  await expect(audit.getByLabel("Prompts to track")).toHaveValue(saved.snapshot.prompts.join("\n"));
  await expect(audit.getByRole("button", { name: "Run visibility audit" })).toBeEnabled();
  await audit.getByRole("button", { name: "Run visibility audit" }).click();
  await expect(audit.getByRole("heading", { name: "Your next move starts here." })).toBeVisible();
  expect(calls.audits).toHaveLength(1);
  expect(calls.audits[0]).toMatchObject({
    brand: "Acme Growth",
    domain: "example.com",
    competitors: ["Edited Northstar", "SignalDesk", "Custom Alternative"],
    prompts: saved.snapshot.prompts,
  });
  await audit.getByRole("button", { name: "Explore your results" }).click();
  await waitForServerSave(page);
  expect((await savedWorkspace(page)).snapshot.runs).toHaveLength(1);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(key);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveCount(0);
  expect(calls.research).toHaveLength(1);
});

test("manual setup needs no research quote or paid request and persists to a fresh browser", async ({ page, browser, baseURL }) => {
  const calls = trackResearch(page);
  const key = await firstLogin(page);
  await enterManualBrand(page);
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await waitForServerSave(page);
  expect(calls).toEqual({ estimates: [], research: [], audits: [] });
  const saved = await savedWorkspace(page);
  expect(saved.snapshot.project).toMatchObject({ brand: "Manual Analytics", domain: "example.com", description: "Analytics for independent software teams." });
  expect(saved.snapshot.prompts).toEqual(["Which analytics tools suit independent software teams?"]);
  expect(saved.snapshot.runs).toEqual([]);

  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-onboarding-other-${crypto.randomUUID()}` });
    const other = await context.newPage();
    await other.goto("/login");
    await other.getByLabel("Treg API key", { exact: true }).fill(key);
    await other.getByRole("button", { name: "Open my workspace" }).click();
    await expect(other.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(other.getByLabel("Website URL", { exact: true })).toHaveCount(0);
    await expect(other.getByRole("button", { name: "Manual Analytics workspace" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("an established pre-onboarding workspace bypasses setup without changing its profile or prompts", async ({ page }) => {
  const key = `treg-e2e-onboarding-legacy-${crypto.randomUUID()}`;
  expect((await page.request.post("/api/auth/session", { data: { token: key } })).ok()).toBe(true);
  const snapshot = {
    project: { brand: "Existing Company", domain: "example.com", competitors: ["Existing Rival"] },
    prompts: ["Which service fits an existing customer?"],
    runs: [], done: [], sourceResearch: {},
  };
  expect((await page.request.put("/api/workspace", { data: { snapshot, revision: 0 } })).ok()).toBe(true);
  const calls = trackResearch(page);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Existing Company workspace" })).toBeVisible();
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveCount(0);
  expect((await savedWorkspace(page)).snapshot).toEqual(snapshot);
  expect(calls).toEqual({ estimates: [], research: [], audits: [] });
});

test("review drafts survive reload and switching between steps without repeating research", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await researchBrand(page);
  await page.getByLabel("Brand name", { exact: true }).fill("Recovered Acme");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByLabel("Buyer question 1", { exact: true }).fill("Which question survives a browser reload?");
  await page.getByLabel("Track buyer question 2", { exact: true }).uncheck();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("Which question survives a browser reload?");
  await expect(page.getByLabel("Track buyer question 2", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Brand", exact: true }).last().click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Recovered Acme");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await waitForServerSave(page);
  expect((await savedWorkspace(page)).snapshot.project.brand).toBe("Recovered Acme");
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toHaveLength(0);
});

test("unfinished onboarding drafts stay isolated when the same browser changes Treg keys", async ({ page }) => {
  const firstKey = await firstLogin(page);
  await page.getByLabel("Website URL", { exact: true }).fill(website);
  await page.getByLabel("Who are your buyers?", { exact: true }).fill("Private buyer context for the first key.");
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await page.getByLabel("Brand name", { exact: true }).fill("Private Draft Brand");
  await page.getByRole("button", { name: "Add competitor", exact: true }).click();
  await page.getByLabel("Competitor 1", { exact: true }).fill("Private Rival");
  await page.getByLabel("Competitor 1 website", { exact: true }).fill("private-rival.example.com");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await firstLogin(page);
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue("");
  await expect(page.getByText("Private Draft Brand", { exact: true })).toHaveCount(0);
  expect((await savedWorkspace(page)).snapshot).toBeNull();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await page.getByLabel("Treg API key", { exact: true }).fill(firstKey);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Private Draft Brand");
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue("Private buyer context for the first key.");
  await expect(page.getByLabel("Competitor 1", { exact: true })).toHaveValue("Private Rival");
  await expect(page.getByLabel("Competitor 1 website", { exact: true })).toHaveValue("private-rival.example.com");
  expect((await savedWorkspace(page)).snapshot).toBeNull();
});

test("invalid URLs cannot start research and changing a quoted URL requires a fresh estimate", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await page.getByLabel("Website URL", { exact: true }).fill("localhost");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your website" }).getByRole("alert")).toContainText(/public website/i);
  expect(calls.estimates).toHaveLength(0);
  expect(calls.research).toHaveLength(0);
  await page.getByLabel("Website URL", { exact: true }).fill("example.com/onboarding?utm_source=test#pricing");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Research my brand/ })).toBeEnabled();
  expect(calls.estimates).toEqual([{ url: website, audience: "", market: { country: "US", language: "en" }, estimateOnly: true }]);
  await page.getByLabel("Website URL", { exact: true }).fill("https://example.com/changed");
  await expect(page.getByRole("button", { name: /^Research my brand/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Research my brand/ })).toBeEnabled();
  expect(calls.estimates).toHaveLength(2);
  expect(calls.estimates[1]).toEqual({ url: "https://example.com/changed", audience: "", market: { country: "US", language: "en" }, estimateOnly: true });
  expect(calls.research).toHaveLength(0);
  expect(calls.audits).toHaveLength(0);
});

test("changing to another website clears previous brand suggestions while retaining the original billing receipt", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await researchBrand(page);
  await page.getByLabel("Brand name", { exact: true }).fill("Edited Previous Brand");
  await page.getByRole("button", { name: "Website", exact: true }).last().click();
  await page.getByLabel("Website URL", { exact: true }).fill("https://other.example.com/");
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel(/^Business description/)).toHaveValue("");
  await expect(page.getByLabel("Brand website", { exact: true })).toHaveValue("other.example.com");
  await expect(page.getByLabel("Competitor 1", { exact: true })).toHaveCount(0);
  await page.locator(".ob-receipt summary").click();
  await expect(page.locator(".ob-receipt")).toContainText("Website researched: example.com");
  await expect(page.locator(".ob-receipt").getByRole("link", { name: "Acme Analytics", exact: true })).toHaveAttribute("href", website);
  await page.getByLabel("Brand name", { exact: true }).fill("Other Brand");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Buyer question 2", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/AI-generated suggestions based on web research/)).toHaveCount(0);
  expect(calls.research).toHaveLength(1);
});

test("a rejected save retains the review and its edited values until storage acknowledges it", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await enterManualBrand(page, "Storage Survivor");
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ status: 503, json: { error: "Fixture storage unavailable" } });
    return route.continue();
  });
  await page.getByRole("button", { name: "Save and review first audit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  await expect(page.getByText(/Fixture storage unavailable/).first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "See where you stand." })).toHaveCount(0);
  expect((await savedWorkspace(page)).snapshot).toBeNull();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("Which analytics tools suit independent software teams?");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("Which analytics tools suit independent software teams?");
  expect((await savedWorkspace(page)).snapshot).toBeNull();
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect((await savedWorkspace(page)).snapshot.project.brand).toBe("Storage Survivor");
  expect(calls.audits).toHaveLength(0);
});

test("a concurrent workspace save cannot be overwritten by finishing onboarding", async ({ page }) => {
  await firstLogin(page);
  await enterManualBrand(page, "Local Draft Brand");
  const before = await savedWorkspace(page);
  const remote = {
    project: { brand: "Other Device Brand", domain: "example.com", competitors: [] },
    prompts: ["Which question came from another device?"],
    runs: [], done: [], sourceResearch: {},
  };
  expect((await page.request.put("/api/workspace", { data: { snapshot: remote, revision: before.revision } })).ok()).toBe(true);
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toContainText("Conflicting workspace versions");
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  expect((await savedWorkspace(page)).snapshot).toEqual(remote);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Load server version", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Other Device Brand workspace" })).toBeVisible();
});

test("a committed setup whose acknowledgement is lost opens normally after reload without a duplicate write", async ({ page }) => {
  await firstLogin(page);
  await enterManualBrand(page, "Acknowledged By Storage");
  let writes = 0;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes += 1;
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    return route.fulfill({ status: 503, json: { error: "Fixture acknowledgement lost after commit" } });
  });
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByText(/Fixture acknowledgement lost after commit/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with the right questions." })).toBeVisible();
  const committed = await savedWorkspace(page);
  expect(committed.snapshot.project.brand).toBe("Acknowledged By Storage");
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledged By Storage workspace" })).toBeVisible();
  expect((await savedWorkspace(page)).revision).toBe(committed.revision);
  expect(writes).toBe(1);
});

test("failed research can be completed manually and is never resubmitted on reload", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await researchBrand(page, "https://example.com/failure");
  await expect(page.getByText(/could not be completed/).first()).toBeVisible();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("");
  await page.getByLabel("Brand name", { exact: true }).fill("Recovered Research");
  await page.getByLabel(/^Business description/).fill("A manually confirmed analytics business.");
  await page.reload();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Recovered Research");
  expect(calls.research).toHaveLength(1);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByLabel("Buyer question 1", { exact: true }).fill("Which analytics business fits a small team?");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toHaveLength(0);
});

test("pending research preserves its unknown-charge warning across reload without automatic retries", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await researchBrand(page, "https://example.com/pending");
  await expect(page.getByText(/still processing/i).first()).toBeVisible();
  await expect(page.getByText(/unknown/i).first()).toBeVisible();
  expect(calls.research).toHaveLength(1);
  await page.reload();
  await expect(page.getByText(/still processing/i).first()).toBeVisible();
  await expect(page.getByText(/unknown/i).first()).toBeVisible();
  expect(calls.research).toHaveLength(1);
});

for (const failure of ["unreadable", "502", "network"] as const) {
test(`a ${failure} paid response retains an interrupted-request warning and permits free manual completion`, async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  await page.route("**/api/aeo/onboard", async (route) => {
    if (route.request().postDataJSON().estimateOnly === true) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (failure === "502") return route.fulfill({ status: 502, json: { error: "Fixture gateway interrupted after research" } });
    if (failure === "network") return route.abort("failed");
    return route.fulfill({ status: 200, contentType: "application/json", body: "{interrupted" });
  });
  await page.getByLabel("Website URL", { exact: true }).fill(website);
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByText("A research request may have completed.", { exact: true })).toBeVisible();
  expect(calls.research).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("A research request may have completed.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Charges may be unknown/)).toBeVisible();
  expect(calls.research).toHaveLength(1);
  await enterManualBrand(page, "Interrupted Research Brand");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect(calls.research).toHaveLength(1);
  expect(calls.audits).toHaveLength(0);
});
}

test("research busy state prevents duplicate submissions while one response is in flight", async ({ page }) => {
  const calls = trackResearch(page);
  await firstLogin(page);
  let release!: () => void;
  let responseReady!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { responseReady = resolve; });
  await page.route("**/api/aeo/onboard", async (route) => {
    if (route.request().postDataJSON().estimateOnly === true) return route.continue();
    const response = await route.fetch();
    responseReady();
    await gate;
    return route.fulfill({ response });
  });
  try {
    await page.getByLabel("Website URL", { exact: true }).fill(website);
    await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
    await page.getByRole("button", { name: /^Research my brand/ }).click();
    await ready;
    await expect(page.getByLabel("Website URL", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Set up manually", exact: true })).toBeDisabled();
    expect(calls.research).toHaveLength(1);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  expect(calls.research).toHaveLength(1);
});

test("mobile onboarding stays within the viewport and keyboard users can finish the manual path", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await firstLogin(page);
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Website URL", { exact: true }).fill(website);
  const manual = page.getByRole("button", { name: "Set up manually", exact: true });
  await manual.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Does this sound like you?" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Brand name", { exact: true }).fill("Mobile Analytics");
  await page.getByLabel(/^Business description/).fill("Analytics that works for a small business.");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/onboarding-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Buyer question 1", { exact: true }).fill("Which analytics tool works for a small business?");
  const save = page.getByRole("button", { name: "Save and open workspace", exact: true });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await waitForServerSave(page);
  await expectNoHorizontalOverflow(page);
});

test("questions must be selected before saving and blank or duplicate questions cannot slip into the workspace", async ({ page }) => {
  await firstLogin(page);
  await researchBrand(page);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  const save = page.getByRole("button", { name: "Save and open workspace", exact: true });
  for (const checkbox of await page.getByRole("checkbox", { name: /^Track buyer question \d+$/ }).all()) await checkbox.uncheck();
  await expect(save).toBeDisabled();
  await page.getByLabel("Track buyer question 1", { exact: true }).check();
  await page.getByLabel("Buyer question 1", { exact: true }).fill(" ");
  await expect(save).toBeDisabled();
  await page.getByLabel("Buyer question 1", { exact: true }).fill(firstQuestion);
  await page.getByLabel("Buyer question 2", { exact: true }).fill(firstQuestion.toUpperCase());
  await page.getByLabel("Track buyer question 2", { exact: true }).check();
  await save.click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await waitForServerSave(page);
  expect((await savedWorkspace(page)).snapshot.prompts).toEqual([firstQuestion]);
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell").filter({ hasText: firstQuestion })).toHaveCount(1);
});
