import type { Page } from "@playwright/test";
import { test, expect, expectNoHorizontalOverflow } from "./support/auth-helpers";
import { contextKey, nav, openAudit, saveServerSnapshot, signIn, storedFixture, waitForServerSave } from "./support/workspace-helpers";
import type { OnboardingResearch } from "../../src/lib/workspace-data";
import { createPagePlan, pagePlanOpportunities } from "../../src/lib/page-plans";
import { createEvidenceReport } from "../../src/lib/evidence-reports";
import type { SourceResearch } from "../../src/lib/source-research";

const oldReceipt: OnboardingResearch = {
  kind: "research", url: "https://treg.to/aeo", domain: "treg.to", brand: "Treg", description: "Existing research.",
  competitors: [], questions: ["An original research question?"], sources: [{ title: "Original evidence", url: "https://treg.to/aeo" }],
  totalCostUsd: 0.005, knownCostUsd: 0.005, costKnown: true, errors: [], callIds: ["saved-original-research"], completedAt: "2026-10-20T12:00:00.000Z",
};
const source: SourceResearch = {
  kind: "research", url: "https://example.com/research", domain: "example.com", brand: "Treg", title: "Saved source", excerpt: "Retained source evidence.",
  contentCharacters: 25, brandMentioned: false, brandOccurrences: 0, brandExcerpts: [], author: null, publishedAt: null, contactRoutes: [],
  metrics: { domainAuthority: 20, pageAuthority: null, spamScore: null, referringDomains: null, externalLinks: null, lastCrawled: null },
  provenance: { metricsProvider: "Fixture", contentProvider: "Fixture", contentFreshness: null }, totalCostUsd: 0.001, knownCostUsd: 0.001,
  costKnown: true, callIds: ["saved-source-call"], errors: [], completedAt: oldReceipt.completedAt,
};
async function saved(page: Page) {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBe(true);
  return response.json();
}
async function seed(page: Page) {
  const key = await signIn(page);
  const original = storedFixture();
  const plan = createPagePlan({ id: "retained-page-plan", opportunity: pagePlanOpportunities(original.runs, original.project)[0] });
  const report = createEvidenceReport({ id: "retained-report", project: original.project, runs: original.runs, plans: [plan] });
  const snapshot = { ...original, pagePlans: [plan], reports: [report], project: { ...original.project, strategy: { goal: "Make documented capabilities clearer.", keyPages: ["https://treg.to/aeo"] }, description: "Preserve this business context. ".repeat(40).slice(0, 1200), audience: "Builders of useful AI products", researchReceipts: [oldReceipt], onboardingCompletedAt: oldReceipt.completedAt },
    prompts: [...original.prompts, ...Array.from({ length: 9 }, (_, i) => `Previously tracked buyer question ${i + 1}?`)],
    done: [original.prompts[1]], sourceResearch: { "treg:https://example.com/research": source } };
  const envelope = await saveServerSnapshot(page, snapshot);
  await page.reload();
  await waitForServerSave(page);
  return { key, envelope };
}
function track(page: Page) {
  const calls = { estimates: [] as unknown[], research: [] as Record<string, unknown>[], audits: [] as unknown[], schedules: [] as unknown[], saves: [] as unknown[] };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/aeo/onboard") {
      const body = request.postDataJSON();
      if (body.estimateOnly) calls.estimates.push(body); else calls.research.push(body);
    }
    if (request.method() === "POST" && path === "/api/aeo/run") calls.audits.push(request.postDataJSON());
    if (["PUT", "DELETE"].includes(request.method()) && path === "/api/monitor") calls.schedules.push(request.postDataJSON());
    if (request.method() === "PUT" && path === "/api/workspace") calls.saves.push(request.postDataJSON());
  });
  return calls;
}
async function openReview(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Your workspace.", exact: true }).getByRole("button", { name: "Rerun onboarding", exact: true }).click();
  await expect(page).toHaveURL(/\/app\?setup=review$/);
  await expect(page.getByRole("region", { name: "Review existing workspace" })).toBeVisible();
}
async function toQuestions(page: Page, brand?: string) {
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  if (brand) await page.getByLabel("Brand name", { exact: true }).fill(brand);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
}
async function reloadProfile(page: Page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reload saved profile", exact: true }).click();
  await expect(page.getByLabel("Website URL", { exact: true })).toBeVisible();
}
function retained(before: Awaited<ReturnType<typeof saved>>, after: Awaited<ReturnType<typeof saved>>) {
  expect(after.snapshot.runs).toEqual(before.snapshot.runs);
  expect(after.snapshot.done).toEqual(before.snapshot.done);
  expect(after.snapshot.pagePlans).toEqual(before.snapshot.pagePlans);
  expect(after.snapshot.reports).toEqual(before.snapshot.reports);
  expect(after.snapshot.sourceResearch).toEqual(before.snapshot.sourceResearch);
  for (const prompt of before.snapshot.prompts) expect(after.snapshot.prompts).toContain(prompt);
  expect(after.snapshot.project.researchReceipts).toEqual(expect.arrayContaining(before.snapshot.project.researchReceipts));
}

test("an existing key can return from review, resume after reload and keep every saved record untouched", async ({ page, browserName }) => {
  const { envelope } = await seed(page);
  const session = await (await page.request.get("/api/auth/session")).json();
  const calls = track(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await openReview(page);
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue("treg.to");
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue("Builders of useful AI products");
  await expectNoHorizontalOverflow(page);
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/rerun-onboarding-phone.png", fullPage: true });
  await toQuestions(page, "Draft correction only");
  await page.getByLabel("Buyer question 1", { exact: true }).fill("A question saved only in this review draft?");
  await page.reload();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("A question saved only in this review draft?");
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  expect(await saved(page)).toEqual(envelope);
  expect((await (await page.request.get("/api/auth/session")).json()).workspaceId).toBe(session.workspaceId);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await openReview(page);
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toHaveValue("A question saved only in this review draft?");
  expect(calls).toEqual({ estimates: [], research: [], audits: [], schedules: [], saves: [] });
});

test("saving a manual rereview preserves history, existing questions, sources, receipts and configured monitoring", async ({ page }) => {
  const { envelope } = await seed(page);
  const monitor = await page.request.put("/api/monitor", { data: { enabled: false, intervalHours: 168, hourUtc: 9, perRunBudgetUsd: 0.01, monthlyBudgetUsd: 1,
    config: { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Keep this monitoring question?"], engines: ["perplexity"] } } });
  expect(monitor.ok(), await monitor.text()).toBe(true);
  const schedule = (await (await page.request.get("/api/monitor")).json()).schedule;
  const calls = track(page);
  await openReview(page);
  await toQuestions(page, "Treg Reviewed");
  await page.getByLabel("Buyer question 1", { exact: true }).fill("A newly reviewed buyer question?");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  const after = await saved(page);
  retained(envelope, after);
  expect(after.snapshot.project.brand).toBe("Treg Reviewed");
  expect(after.snapshot.project.description).toBe(envelope.snapshot.project.description);
  expect(after.snapshot.prompts).toContain("A newly reviewed buyer question?");
  expect((await (await page.request.get("/api/monitor")).json()).schedule).toEqual(schedule);
  expect(calls.research).toEqual([]); expect(calls.audits).toEqual([]); expect(calls.schedules).toEqual([]);
  await page.reload();
  retained(envelope, await saved(page));
});

test("same-brand onboarding rereview preserves strategy, page plans and immutable reports", async ({ page }) => {
  const { envelope } = await seed(page);
  const calls = track(page);
  await openReview(page);
  await toQuestions(page);
  await page.getByLabel("Buyer question 1", { exact: true }).fill("Which documented data sources fit our buyers?");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  const after = await saved(page);
  retained(envelope, after);
  expect(after.snapshot.project.strategy).toEqual(envelope.snapshot.project.strategy);
  expect(calls.research).toEqual([]); expect(calls.audits).toEqual([]); expect(calls.schedules).toEqual([]);
});

test("new research uses the existing session once, resumes its receipt, and only opens an unpaid audit review after saving", async ({ page }) => {
  const { envelope } = await seed(page);
  const calls = track(page);
  await openReview(page);
  await page.getByLabel("Website URL", { exact: true }).fill("https://example.com/rich-context");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  expect(calls.research).toEqual([]);
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await page.getByLabel("Competitor 1", { exact: true }).fill("Northstar Reviewed");
  await expect(page.getByLabel("Competitor 1 website", { exact: true })).toHaveValue("northstar.example.com");
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(await saved(page)).toEqual(envelope);
  await openReview(page);
  await page.reload();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByRole("button", { name: "Save and review audit", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("dialog", { name: "See where you stand.", exact: true })).toBeVisible();
  const after = await saved(page);
  retained(envelope, after);
  expect(after.snapshot.project.researchReceipts).toHaveLength(2);
  expect(calls.research).toHaveLength(1); expect(calls.research[0]).not.toHaveProperty("token");
  expect(calls.audits).toEqual([]); expect(calls.schedules).toEqual([]);
  await page.getByRole("button", { name: "Close audit", exact: true }).click();
  await waitForServerSave(page);
});

test("a failed rereview save keeps the draft and old workspace until a deliberate successful save", async ({ page }) => {
  const { envelope } = await seed(page);
  const calls = track(page);
  await openReview(page);
  await toQuestions(page, "Recovered review");
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { error: "Synthetic save unavailable" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(await saved(page)).toEqual(envelope);
  await page.reload();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toBeVisible();
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  const after = await saved(page);
  retained(envelope, after);
  expect(after.snapshot.project.brand).toBe("Recovered review");
  expect(after.snapshot.project.description).toBe(envelope.snapshot.project.description);
  expect(calls.research).toEqual([]); expect(calls.audits).toEqual([]);
});

test("a server refresh cannot attach a newer revision to stale review edits and explicit profile reload retains paid research", async ({ page }) => {
  const { key, envelope } = await seed(page);
  const calls = track(page);
  await openReview(page);
  await page.getByLabel("Website URL", { exact: true }).fill("example.com/rich-context");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  const remote = await saveServerSnapshot(page, { ...envelope.snapshot, project: { ...envelope.snapshot.project, brand: "Newer saved profile" } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.brand, key)).toBe("Newer saved profile");
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toContainText("Conflicting workspace versions");
  expect(await saved(page)).toEqual(remote);
  expect(calls.saves).toEqual([]);
  await reloadProfile(page);
  await expect(page.getByText(/Loaded your latest saved profile/)).toBeVisible();
  await toQuestions(page);
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  const after = await saved(page);
  retained(envelope, after);
  expect(after.snapshot.project.brand).toBe("Newer saved profile");
  expect(after.snapshot.project.researchReceipts).toHaveLength(2);
  expect(calls.research).toHaveLength(1); expect(calls.audits).toEqual([]);
});

test("a lost save acknowledgement never causes another paid request or a stale overwrite", async ({ page }) => {
  const { envelope } = await seed(page);
  const calls = track(page);
  await openReview(page);
  await toQuestions(page, "Saved despite a lost acknowledgement");
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { error: "Synthetic lost acknowledgement" } });
  });
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  const committed = await saved(page);
  retained(envelope, committed);
  expect(committed.snapshot.project.brand).toBe("Saved despite a lost acknowledgement");
  await page.unroute("**/api/workspace");
  await page.reload();
  await expect(page.getByLabel("Buyer question 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  expect(await saved(page)).toEqual(committed);
  expect(calls.saves).toHaveLength(1);
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await waitForServerSave(page);
  expect(await saved(page)).toEqual(committed);
  expect(calls.research).toEqual([]); expect(calls.audits).toEqual([]);
});

test("settings edits and a different key cannot silently overwrite or inherit a review draft", async ({ page }) => {
  const { envelope } = await seed(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Your workspace.", exact: true });
  await settings.getByLabel("Who are your buyers?", { exact: true }).fill("An unsaved settings edit");
  await expect(settings.getByRole("button", { name: "Rerun onboarding", exact: true })).toBeDisabled();
  await settings.getByRole("button", { name: "Close settings", exact: true }).click();
  await openReview(page);
  await page.getByLabel("Who are your buyers?", { exact: true }).fill("A private review draft for the first key");
  expect(await saved(page)).toEqual(envelope);
  const other = await page.request.post("/api/auth/session", { data: { token: contextKey(page.context(), "treg-e2e-secondary") } });
  expect(other.ok()).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue("");
  expect((await saved(page)).snapshot).toBeNull();
  await page.request.post("/api/auth/session", { data: { token: contextKey(page.context()) } });
  await page.reload();
  await expect(page.getByLabel("Who are your buyers?", { exact: true })).toHaveValue("A private review draft for the first key");
  expect(await saved(page)).toEqual(envelope);
});

test("rerunning onboarding keeps an already submitted audit mounted and retained without a duplicate purchase", async ({ page }) => {
  await signIn(page);
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/api/aeo/run", async (route) => {
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response });
  });
  const calls = track(page);
  const audit = await openAudit(page, "Which tools should a small team use?");
  try {
    await audit.getByRole("button", { name: "Run visibility audit", exact: true }).click();
    await ready;
    await audit.getByRole("button", { name: "Close audit", exact: true }).click();
    await openReview(page);
    await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await waitForServerSave(page);
    await page.getByRole("button", { name: "Run an audit", exact: true }).first().click();
    await expect(audit.getByRole("button", { name: "Running audit", exact: true })).toBeDisabled();
    release();
    await expect(audit.getByRole("heading", { name: "Your next move starts here." })).toBeVisible();
    expect(calls.audits).toHaveLength(1);
    await audit.getByRole("button", { name: "Explore your results", exact: true }).click();
    await nav(page, "Audit history");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  } finally { release(); }
});

test("reloading a review profile cannot discard unsynced results from an audit that completed in the background", async ({ page }) => {
  const key = await signIn(page);
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/api/aeo/run", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    // Model a completed paid response whose append failed. Only this isolated
    // synthetic workspace is edited; production has no test bypass endpoint.
    const current = await saved(page);
    await saveServerSnapshot(page, { ...current.snapshot, runs: [] });
    body.saved = false;
    body.storageError = "Synthetic append failure; keep these paid answers.";
    arrived(); await gate;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { error: "Synthetic save unavailable" } });
    else await route.continue();
  });
  const calls = track(page);
  const audit = await openAudit(page, "Which answers must survive a failed append?");
  try {
    await audit.getByRole("button", { name: "Run visibility audit", exact: true }).click();
    await ready;
    await audit.getByRole("button", { name: "Close audit", exact: true }).click();
    await openReview(page);
    release();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.length, key)).toBe(1);
    await reloadProfile(page);
    await expect(page.getByRole("alert").first()).toContainText(/unsynced changes/);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).runs.length, key)).toBe(1);
    expect((await saved(page)).snapshot.runs).toEqual([]);
    await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    const sync = page.getByRole("region", { name: "Workspace synchronization" });
    await expect(sync).toContainText(/Unsynced|not saved/);
    await page.unroute("**/api/workspace");
    await sync.getByRole("button", { name: "Retry sync", exact: true }).click();
    await waitForServerSave(page);
    expect((await saved(page)).snapshot.runs).toHaveLength(1);
    expect(calls.audits).toHaveLength(1);
  } finally { release(); }
});
