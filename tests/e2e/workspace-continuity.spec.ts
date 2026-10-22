import type { Page } from "@playwright/test";
import { expect, test } from "./support/auth-helpers";
import { readFile } from "node:fs/promises";
import { buildMeasurementScope } from "../../src/lib/measurement";
import { createPagePlan, pagePlanOpportunities } from "../../src/lib/page-plans";
import { createEvidenceReport } from "../../src/lib/evidence-reports";
import type { SavedDiscovery } from "../../src/lib/discovery-research";
import { DEFAULT_PROJECT, type OnboardingResearch, type SavedRun } from "../../src/lib/workspace-data";
import type { WorkspaceSnapshot } from "../../src/lib/workspace-storage";
import { nav, saveServerSnapshot, signIn, trackedPrompt, waitForServerSave } from "./support/workspace-helpers";

const project = { ...DEFAULT_PROJECT, onboardingCompletedAt: "2026-10-01T10:00:00Z" };
const input = { ...DEFAULT_PROJECT, prompts: [trackedPrompt], engines: ["chatgpt"] as "chatgpt"[] };
function run(id = "continuity-baseline", day = 1, present = false): SavedRun {
  const completedAt = new Date(Date.UTC(2026, 9, day, 12)).toISOString();
  return { ...input, id, completedAt, measurement: buildMeasurementScope(input), errors: [], totalCostUsd: .002, totalCostKnown: true, results: [{ id: `${id}-answer`, prompt: trackedPrompt, engine: "chatgpt", answer: `Original ${id} answer. ${present ? "Treg" : "Composio"} offers research tools.`, citations: [{ url: "https://composio.dev/docs", domain: "composio.dev", title: "Original documentation" }], brandMentioned: present, mentionedBrands: [present ? "Treg" : "Composio"], position: present ? 1 : null, costUsd: .002, costKnown: true, completedAt, provider: "cloro", sourceKind: "web-interface" }] };
}
function fixture(runs: SavedRun[] = []): WorkspaceSnapshot { return { project, prompts: [trackedPrompt], runs, done: [], sourceResearch: {} }; }
function plan() { return createPagePlan({ id: "continuity-plan", opportunity: pagePlanOpportunities([run()], project)[0], now: "2026-10-02T12:00:00Z" }); }
function discovery(id: string, day: number): SavedDiscovery { return { id, input: { brand: project.brand, domain: project.domain, seeds: [`${id} research`, "agency data"] }, estimate: { currency: "USD", totalCostUsd: .01, maxCalls: 4, pricedAt: "2026-10-01T10:00:00Z", note: "Fixture-only estimate", breakdown: [] }, result: { candidates: [{ id: `${id}-question`, text: `Which toolkit fits ${id}?`, keyword: "research toolkit", seed: `${id} research`, provider: "cloro", kind: "question", origin: "People Also Ask", searchVolume: null }], questionCount: 1, keywordCount: 0, totalCostUsd: .002, totalCostKnown: true, reservedCostUsd: .01, completedAt: new Date(Date.UTC(2026, 9, day, 12)).toISOString(), locale: { country: "US", language: "en" }, errors: [], callIds: [`${id}-call`] }, selectedCandidateIds: [] }; }
async function seed(page: Page, value = fixture()) { const key = await signIn(page); await saveServerSnapshot(page, value); await page.reload(); await waitForServerSave(page); return key; }
async function saved(page: Page): Promise<WorkspaceSnapshot> { return (await (await page.request.get("/api/workspace")).json()).snapshot; }
async function replace(page: Page, value: WorkspaceSnapshot) { await saveServerSnapshot(page, value); await page.reload(); await waitForServerSave(page); }
const guidance = (page: Page) => page.getByRole("region", { name: "Workspace next steps and recent work" });
const recent = (page: Page) => page.getByRole("region", { name: "Recent saved work" });
const editor = (page: Page) => page.getByRole("dialog", { name: "Make the next page count." });
function paidCalls(page: Page) { const calls: string[] = []; page.on("request", (request) => { if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source|onboard)$/.test(new URL(request.url()).pathname) && !request.postDataJSON()?.estimateOnly) calls.push(request.url()); }); return calls; }

test("first audit is only a review; hidden suggestions await acknowledgment, survive reload and restore without changing evidence", async ({ page }) => {
  await seed(page);
  const paid = paidCalls(page);
  await guidance(page).getByRole("button", { name: "Review first audit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "See where you stand." })).toBeVisible();
  await page.getByRole("button", { name: "Close audit", exact: true }).click();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeVisible();
  const original = await saved(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/workspace", async (route) => { if (route.request().method() !== "PUT") return route.continue(); await hold; await route.continue(); });
  await guidance(page).getByRole("button", { name: /^Hide suggestion:/ }).click();
  await expect(guidance(page).getByRole("heading", { name: "Resolve synchronization first" })).toBeVisible();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeVisible();
  expect((await saved(page)).continuity).toBeUndefined();
  release();
  await expect(guidance(page).getByRole("button", { name: "Restore hidden suggestions (1)" })).toBeVisible();
  await waitForServerSave(page);
  await page.unroute("**/api/workspace");
  await page.reload();
  await expect(guidance(page)).toContainText("Your current suggestions are hidden");
  await guidance(page).getByRole("button", { name: "Restore hidden suggestions (1)" }).click();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeVisible();
  await waitForServerSave(page);
  const after = await saved(page);
  expect({ ...after, continuity: undefined }).toEqual({ ...original, continuity: undefined });
  expect(after.continuity?.dismissed).toEqual([]);
  expect(paid).toEqual([]);
});

test("failed preference saves keep suggestions visible and recovery never silently retries the preference", async ({ page }) => {
  await seed(page);
  let writes = 0;
  await page.route("**/api/workspace", (route) => { if (route.request().method() !== "PUT") return route.continue(); writes++; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture unavailable" }) }); });
  await guidance(page).getByRole("button", { name: /^Hide suggestion:/ }).click();
  await expect(guidance(page).getByRole("alert")).toContainText("previous suggestions remain visible");
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeDisabled();
  await guidance(page).getByRole("button", { name: "Review synchronization", exact: true }).click();
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toBeFocused();
  expect((await saved(page)).continuity).toBeUndefined();
  await page.unroute("**/api/workspace");
  await page.getByRole("region", { name: "Workspace synchronization" }).getByRole("button", { name: "Refresh", exact: true }).click();
  await waitForServerSave(page);
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeEnabled();
  expect(writes).toBe(1);
  expect((await saved(page)).continuity).toBeUndefined();
});

test("a concurrent server edit rejects a stale dismissal without overwriting another tab's evidence", async ({ page }) => {
  await seed(page);
  let changed = false;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT" && !changed) { changed = true; await saveServerSnapshot(page, { ...await saved(page), runs: [run()] }); }
    await route.continue();
  });
  await guidance(page).getByRole("button", { name: /^Hide suggestion:/ }).click();
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toContainText("Conflicting workspace versions");
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeVisible();
  expect((await saved(page)).continuity).toBeUndefined();
  await page.unroute("**/api/workspace");
  await page.getByRole("region", { name: "Workspace synchronization" }).getByRole("button", { name: "Load server version", exact: true }).click();
  await page.getByRole("button", { name: "Confirm load server version", exact: true }).click();
  await expect(guidance(page).getByRole("button", { name: "Review page opportunities", exact: true })).toBeVisible();
  expect((await saved(page)).runs[0].id).toBe("continuity-baseline");
});

test("guidance resumes the exact plan, compares saved follow-ups, preselects report evidence and reopens its immutable snapshot", async ({ page }) => {
  await seed(page, { ...fixture([run()]), pagePlans: [plan()] });
  const paid = paidCalls(page);
  await guidance(page).getByRole("button", { name: "Resume page plan", exact: true }).click();
  await expect(editor(page).getByLabel("Writing brief")).toHaveValue(plan().brief);
  await editor(page).getByRole("button", { name: "Close page plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true })).toBeFocused();
  const published = { ...plan(), status: "published" as const, publishedAt: "2026-10-02", updatedAt: "2026-10-02T13:00:00Z" };
  await replace(page, { ...fixture([run()]), pagePlans: [published] });
  await guidance(page).getByRole("button", { name: "Open published plan", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "Review follow-up audit", exact: true })).toBeEnabled();
  await editor(page).getByRole("button", { name: "Close page plan", exact: true }).click();
  const followup = run("continuity-followup", 3, true);
  const comparable = { ...published, followupRunId: followup.id };
  await replace(page, { ...fixture([run(), followup]), pagePlans: [comparable] });
  await guidance(page).getByRole("button", { name: "Review comparison", exact: true }).click();
  await expect(editor(page)).toContainText("Brand mentions +100 pp");
  expect((await saved(page)).pagePlans?.[0].status).toBe("published");
  await editor(page).getByLabel("Plan status").selectOption("measured");
  await editor(page).getByRole("button", { name: "Save page plan", exact: true }).click();
  await waitForServerSave(page);
  await nav(page, "Overview");
  await guidance(page).getByRole("button", { name: "Prepare evidence report", exact: true }).click();
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  await expect(reports.getByLabel("Baseline audit", { exact: true })).toHaveValue("continuity-baseline");
  await expect(reports.getByLabel("Follow-up audit", { exact: true })).toHaveValue("continuity-followup");
  await expect(reports.getByLabel("Include a saved page plan", { exact: true })).toHaveValue("continuity-plan");
  await reports.getByLabel("Report title", { exact: true }).fill("Continuity evidence report");
  await reports.getByRole("button", { name: "Save private report", exact: true }).click();
  await page.getByRole("button", { name: "Close report", exact: true }).click();
  await waitForServerSave(page);
  await nav(page, "Overview");
  await expect(guidance(page).getByRole("button", { name: "Prepare evidence report", exact: true })).toHaveCount(0);
  await recent(page).getByRole("button", { name: /Report saved.*Continuity evidence report/ }).click();
  const report = page.getByRole("dialog", { name: "Continuity evidence report", exact: true });
  await expect(report).toContainText("Original continuity-baseline answer");
  await expect(report).toContainText("Original continuity-followup answer");
  await report.getByRole("button", { name: "Continue with your agent", exact: true }).click();
  await expect(report.getByRole("region", { name: "Agent handoff" })).toBeVisible();
  await report.getByRole("button", { name: "Close report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeFocused();
  expect(paid).toEqual([]);
});

test("partial audit and exact older research reopen original records without executing new research", async ({ page }) => {
  const partial = { ...run("partial-audit", 8), results: [], totalCostKnown: false, errors: [{ prompt: trackedPrompt, engine: "chatgpt" as const, error: "Original collection interrupted" }] };
  const older = discovery("older-receipt", 6), newer = discovery("newer-receipt", 7);
  await seed(page, { ...fixture([partial]), discoveryResearch: [older, newer] });
  const paid = paidCalls(page);
  await expect(guidance(page).getByRole("heading", { name: "Review the latest audit's incomplete evidence" })).toBeVisible();
  await guidance(page).getByRole("button", { name: "Review saved audit", exact: true }).click();
  const audit = page.getByRole("dialog", { name: "Treg visibility audit", exact: true });
  await expect(audit).toContainText("Original collection interrupted");
  await expect(audit).toContainText("Charge unavailable");
  await audit.getByRole("button", { name: "Close dialog", exact: true }).click();
  const oldRow = recent(page).getByRole("listitem").filter({ has: page.locator(`time[datetime="${older.result.completedAt}"]`) });
  await oldRow.getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: "Find your next question." });
  await expect(dialog).toContainText("Which toolkit fits older-receipt?");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download research", exact: true }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, "utf8"))).toEqual(older);
  await dialog.getByRole("button", { name: "Close prompt discovery", exact: true }).click();
  const before = await saved(page);
  await recent(page).getByRole("button", { name: /Audit saved/ }).click();
  await expect(audit).toBeVisible();
  expect(await saved(page)).toEqual(before);
  expect(paid).toEqual([]);
});

test("interrupted browser research takes priority and reopening it cannot repeat a purchase", async ({ page }) => {
  const key = await seed(page);
  const pending = { pending: true, startedAt: "2026-10-01T10:00:00Z", input: { brand: project.brand, domain: project.domain, seeds: ["original research", "agency tools"] } };
  await page.evaluate(({ key, pending }) => localStorage.setItem(`${key}:discovery:v1`, JSON.stringify(pending)), { key, pending });
  await page.reload();
  const paid = paidCalls(page);
  await expect(guidance(page).getByRole("heading", { name: "Review interrupted discovery first" })).toBeVisible();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeDisabled();
  await guidance(page).getByRole("button", { name: "Review discovery recovery", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Find your next question." });
  await expect(dialog.getByText("Review interrupted research", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Discover prompts", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close prompt discovery", exact: true }).click();
  await expect(guidance(page).getByRole("heading", { name: "Review interrupted discovery first" })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:discovery:v1`)!).pending, key)).toBe(true);
  expect(paid).toEqual([]);
});

test("recovery reopens the original in-flight discovery and receives its result without another submission", async ({ page }) => {
  await seed(page);
  const paid = paidCalls(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/aeo/discover", async (route) => {
    if (route.request().postDataJSON()?.estimateOnly) return route.continue();
    const response = await route.fetch();
    await hold;
    await route.fulfill({ response });
  });
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Find your next question." });
  await dialog.getByLabel("Seed keyword 1").fill("agency data");
  await dialog.getByLabel("Seed keyword 2").fill("research tools");
  await expect(dialog.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect.poll(() => paid.length).toBe(1);
  await dialog.getByRole("button", { name: "Close prompt discovery", exact: true }).click();
  await nav(page, "Overview");
  await guidance(page).getByRole("button", { name: "Review discovery recovery", exact: true }).click();
  await expect(dialog.getByText("Review interrupted research", { exact: true })).toHaveCount(0);
  release();
  await expect(dialog.getByRole("status")).toContainText("Original research saved to your workspace.");
  expect((await saved(page)).discoveryResearch).toHaveLength(1);
  await dialog.getByRole("button", { name: "Close prompt discovery", exact: true }).click();
  await waitForServerSave(page);
  await expect(guidance(page).getByRole("button", { name: "Review discovery recovery", exact: true })).toHaveCount(0);
  expect(paid).toHaveLength(1);
});

test("returned browser research saves without repurchase and brand-research links open only the original receipt", async ({ page }) => {
  const receipt: OnboardingResearch = { kind: "research", url: "https://treg.to/original", brand: "Treg", domain: "treg.to", description: "Original brand evidence.", competitors: [], questions: ["Original suggested question?"], sources: [{ title: "Original brand source", url: "https://treg.to/original" }], totalCostUsd: .002, knownCostUsd: .002, costKnown: true, errors: [], callIds: ["original-brand-call"], completedAt: "2026-10-04T12:00:00Z" };
  const newer = { ...receipt, url: "https://treg.to/newer", description: "Newer brand evidence.", completedAt: "2026-10-05T12:00:00Z" };
  const key = await seed(page, { ...fixture(), project: { ...project, researchReceipts: [receipt, newer] } });
  const recovered = discovery("returned-receipt", 6);
  await page.evaluate(({ key, recovered }) => localStorage.setItem(`${key}:discovery:v1`, JSON.stringify({ pending: false, startedAt: recovered.estimate.pricedAt, input: recovered.input, estimate: recovered.estimate, receipt: recovered })), { key, recovered });
  await page.reload();
  const paid = paidCalls(page);
  await expect(guidance(page).getByRole("heading", { name: "Recover your returned research" })).toBeVisible();
  await guidance(page).getByRole("button", { name: "Review discovery recovery", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Find your next question." });
  await expect(dialog).toContainText("Which toolkit fits returned-receipt?");
  await dialog.getByRole("button", { name: "Retry saving research", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Original research saved to your workspace.");
  await dialog.getByRole("button", { name: "Close prompt discovery", exact: true }).click();
  await waitForServerSave(page);
  expect((await saved(page)).discoveryResearch).toEqual([recovered]);
  await expect(guidance(page).getByRole("button", { name: "Review discovery recovery", exact: true })).toHaveCount(0);
  await recent(page).getByRole("listitem").filter({ has: page.locator(`time[datetime="${receipt.completedAt}"]`) }).getByRole("button").click();
  const history = page.getByRole("dialog", { name: "Brand research and sources", exact: true });
  await expect(history).toContainText("https://treg.to/original");
  await expect(history).not.toContainText("https://treg.to/newer");
  expect(paid).toEqual([]);
});

test("an interrupted onboarding review returns through workspace recovery without repeating research or reading old initial drafts", async ({ page }) => {
  const key = await seed(page);
  await page.evaluate((key) => localStorage.setItem(`${key}:onboarding:v1`, JSON.stringify({ version: 1, interrupted: true })), key);
  await page.reload();
  await expect(guidance(page).getByRole("button", { name: "Resume brand research review", exact: true })).toHaveCount(0);
  const paid = paidCalls(page);
  const before = await saved(page);
  await page.route("**/api/aeo/onboard", (route) => route.request().postDataJSON()?.estimateOnly ? route.continue() : route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Fixture gateway interrupted after research" }) }));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Rerun onboarding", exact: true }).click();
  await page.getByLabel("Website URL", { exact: true }).fill("https://example.com/rich-context");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByText("A research request may have completed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(guidance(page).getByRole("heading", { name: "Review interrupted brand research first", exact: true })).toBeVisible();
  await page.reload();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeDisabled();
  await guidance(page).getByRole("button", { name: "Resume brand research review", exact: true }).click();
  await expect(page).toHaveURL(/\/app\?setup=review$/);
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue("https://example.com/rich-context");
  await expect(page.getByText("A research request may have completed.", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:review:onboarding:v1`)!).interrupted, key)).toBe(true);
  expect(await saved(page)).toEqual(before);
  expect(paid).toHaveLength(1);
});

test("returned onboarding research resumes its exact review and clears recovery only after profile acknowledgment", async ({ page }) => {
  const key = await seed(page);
  const paid = paidCalls(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Rerun onboarding", exact: true }).click();
  await page.getByLabel("Website URL", { exact: true }).fill("https://example.com/rich-context");
  await page.getByRole("button", { name: "Get research estimate", exact: true }).click();
  await page.getByRole("button", { name: /^Research my brand/ }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(guidance(page).getByRole("heading", { name: "Finish reviewing your brand research", exact: true })).toBeVisible();
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeDisabled();
  expect((await saved(page)).project.brand).toBe("Treg");
  const original = await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:review:onboarding:v1`)!).receipt, key);
  await guidance(page).getByRole("button", { name: "Resume brand research review", exact: true }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue("Acme Analytics");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:review:onboarding:v1`)!).receipt, key)).toEqual(original);
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await waitForServerSave(page);
  await expect(guidance(page).getByRole("button", { name: "Resume brand research review", exact: true })).toHaveCount(0);
  expect((await saved(page)).project.researchReceipts).toContainEqual(original);
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:review:onboarding:v1`), key)).toBeNull();
  expect(paid).toHaveLength(1);
});

test("an unacknowledged publication cannot produce a completed-work recommendation", async ({ page }) => {
  await seed(page, { ...fixture([run()]), pagePlans: [plan()] });
  await guidance(page).getByRole("button", { name: "Resume page plan", exact: true }).click();
  await page.route("**/api/workspace", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture unavailable" }) }) : route.continue());
  await editor(page).getByLabel("Plan status").selectOption("published");
  await editor(page).getByLabel("Page change date").fill("2026-10-02");
  await editor(page).getByRole("button", { name: "Save page plan", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toBeVisible();
  await editor(page).getByRole("button", { name: "Close page plan", exact: true }).click();
  await editor(page).getByRole("button", { name: "Discard changes", exact: true }).click();
  await nav(page, "Overview");
  await expect(guidance(page).getByRole("heading", { name: "Resolve synchronization first" })).toBeVisible();
  await expect(guidance(page).getByRole("button", { name: "Open published plan", exact: true })).toHaveCount(0);
  await expect(guidance(page).getByRole("button", { name: "Prepare evidence report", exact: true })).toHaveCount(0);
  expect((await saved(page)).pagePlans?.[0].status).toBe("planned");
});

test("same-brand onboarding preserves preferences while a different domain cannot inherit recent work or hidden suggestions", async ({ page }) => {
  await seed(page, { ...fixture([run()]), pagePlans: [plan()] });
  const paid = paidCalls(page);
  await guidance(page).getByRole("button", { name: /^Hide suggestion:/ }).click();
  await waitForServerSave(page);
  const before = await saved(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Rerun onboarding", exact: true }).click();
  await page.getByRole("button", { name: "Set up manually", exact: true }).click();
  await page.getByRole("button", { name: "Continue to buyer questions", exact: true }).click();
  await page.getByRole("button", { name: "Save and open workspace", exact: true }).click();
  await waitForServerSave(page);
  await expect(guidance(page).getByRole("button", { name: "Restore hidden suggestions (1)" })).toBeVisible();
  const after = await saved(page);
  expect(after.continuity).toEqual(before.continuity);
  expect(after.pagePlans).toEqual(before.pagePlans);
  await replace(page, { ...after, project: { ...after.project, domain: "different.example" } });
  await expect(guidance(page).getByRole("button", { name: "Review first audit", exact: true })).toBeVisible();
  await expect(guidance(page).getByRole("button", { name: /Restore hidden/ })).toHaveCount(0);
  await expect(recent(page).getByRole("listitem")).toHaveCount(0);
  await guidance(page).getByRole("button", { name: /^Hide suggestion:/ }).click();
  await waitForServerSave(page);
  await guidance(page).getByRole("button", { name: "Restore hidden suggestions (1)" }).click();
  await waitForServerSave(page);
  expect((await saved(page)).continuity?.dismissed).toEqual(before.continuity?.dismissed);
  expect(paid).toEqual([]);
});

test("recent work is bounded, expandable, chronological and keyboard-accessible at desktop and 320px", async ({ page }, testInfo) => {
  const runs = Array.from({ length: 15 }, (_, index) => run(`history-${index}`, index + 1));
  const report = createEvidenceReport({ id: "responsive-report", title: "A report with original observations", project, runs: [runs[0]], now: "2026-10-16T12:00:00Z" });
  await seed(page, { ...fixture(runs), pagePlans: [plan()], reports: [report] });
  const paid = paidCalls(page);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(recent(page).getByRole("listitem")).toHaveCount(4);
    const toggle = recent(page).getByRole("button", { name: "Show older saved work (8)" });
    await toggle.focus(); await page.keyboard.press("Enter");
    await expect(toggle).toHaveCount(0);
    await expect(recent(page).getByRole("listitem")).toHaveCount(12);
    const times = await recent(page).locator("time").evaluateAll((items) => items.map((item) => Date.parse(item.getAttribute("datetime")!)));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const element of [guidance(page), recent(page), guidance(page).locator(".wc-guidance")]) {
      const dimensions = await element.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth, right: node.getBoundingClientRect().right }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1); expect(dimensions.right).toBeLessThanOrEqual(width + 1);
    }
    const fewer = recent(page).getByRole("button", { name: "Show fewer saved records" });
    await fewer.focus(); await page.keyboard.press("Enter");
    await expect(recent(page).getByRole("listitem")).toHaveCount(4);
    if (testInfo.project.name === "chromium") { const path = testInfo.outputPath(`continuity-${width}.png`); await guidance(page).screenshot({ path }); await testInfo.attach(`continuity-${width}`, { path, contentType: "image/png" }); }
    const row = recent(page).getByRole("button", { name: /Report saved/ });
    await row.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: report.title })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeFocused();
    if (width < 800) await page.getByRole("button", { name: "Open navigation" }).click();
    await nav(page, "Overview");
  }
  expect(paid).toEqual([]);
});
