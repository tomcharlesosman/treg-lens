import { expect, test, type Page } from "@playwright/test";
import type { AnswerResult, AuditInput } from "../../src/lib/aeo";
import { buildMeasurementScope } from "../../src/lib/measurement";
import { createPromptRecord } from "../../src/lib/prompt-library";
import type { SavedRun } from "../../src/lib/workspace-data";
import { nav, openAudit, saveServerSnapshot, signIn, waitForServerSave } from "./support/workspace-helpers";

const neutral = "Which research toolkit fits a small agency?";
const branded = "Is Treg useful for a small agency?";
const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: [neutral, branded], engines: ["chatgpt"] };
const project = { brand: input.brand, domain: input.domain, competitors: input.competitors, onboardingCompletedAt: "2026-10-20T10:00:00Z" };
function sample(id: string, date: string, present: boolean[], requested = input): SavedRun {
  return { id, brand: input.brand, domain: input.domain, competitors: input.competitors, prompts: requested.prompts, engines: requested.engines,
    measurement: buildMeasurementScope(requested), completedAt: date, errors: [], totalCostUsd: 0, totalCostKnown: true,
    results: present.map((value, i): AnswerResult => ({ id: `${id}-${i}`, prompt: requested.prompts[i], engine: "chatgpt", answer: value ? "Treg is useful." : "Another toolkit is useful.", citations: value ? [{ url: "https://treg.to/docs", domain: "treg.to", title: "Treg docs" }] : [], mentionedBrands: value ? ["Treg"] : [], brandMentioned: value, position: value ? 1 : null, costUsd: 0, costKnown: true, completedAt: date, sourceKind: "web-interface", provider: "cloro" })),
  };
}
async function seed(page: Page, runs: SavedRun[]) {
  await signIn(page);
  await saveServerSnapshot(page, { project, prompts: input.prompts, promptRecords: input.prompts.map((text) => createPromptRecord(text, project)), runs, done: [], sourceResearch: {} });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

test("trend rates compare matching scopes, latest UTC daily samples and neutral questions without extra paid calls", async ({ page }) => {
  await seed(page, [sample("early", "2026-10-18T10:00:00Z", [true, true]), sample("later-same-day", "2026-10-18T18:00:00Z", [false, true]), sample("different-scope", "2026-10-19T12:00:00Z", [true], { ...input, prompts: [neutral] }), sample("latest", "2026-10-20T12:00:00Z", [false, false])]);
  const paid: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source)$/.test(request.url()) && !request.postDataJSON().estimateOnly) paid.push(request.url()); });
  const trend = page.getByRole("region", { name: "Comparable visibility trends" });
  await expect(trend.getByTestId("trend-mention-rate")).toHaveText("0.0%");
  await expect(trend.getByTestId("trend-citation-rate")).toHaveText("0.0%");
  await expect(trend.getByTestId("trend-comparison")).toContainText("-50.0 percentage points");
  await expect(trend.getByText("1 run has a different scope and is excluded from this comparison.")).toBeVisible();
  await trend.getByText("Inspect trend scope and observations", { exact: true }).click();
  await expect(trend.getByRole("table")).toContainText("Different scope");
  await trend.getByLabel("Filter trends by question type").selectOption("neutral");
  // The one-question run is a matching neutral cohort after filtering. Its 100% rate is the preceding daily sample.
  await expect(trend.getByTestId("trend-comparison")).toContainText("-100.0 percentage points");
  await trend.getByLabel("Filter trends by question type").selectOption("branded");
  await expect(trend.getByTestId("trend-comparison")).toContainText("-100.0 percentage points");
  expect(paid).toEqual([]);
});

test("low coverage and changed collector models withhold misleading deltas and retain inspectable observations", async ({ page }) => {
  const changed = sample("changed-model", "2026-10-19T12:00:00Z", [true, true]);
  changed.measurement!.collectors[0].model = "different-recorded-model";
  await seed(page, [sample("first", "2026-10-18T12:00:00Z", [true, true]), changed, sample("partial", "2026-10-20T12:00:00Z", [true])]);
  const trend = page.getByRole("region", { name: "Comparable visibility trends" });
  await expect(trend.getByTestId("trend-mention-rate")).toHaveText("—");
  await expect(trend.getByTestId("trend-comparison")).toContainText("at least 90% answer coverage is required");
  await expect(trend.getByText("1 / 2", { exact: true })).toBeVisible();
  await trend.getByText("Inspect trend scope and observations", { exact: true }).click();
  await expect(trend.getByRole("table")).toContainText("Below 90% coverage");
  await expect(trend.getByRole("table")).toContainText("Different scope");
  await expect(trend.getByRole("table")).toContainText("100.0%");
});

test("question library pause, edit, archive, restore and metadata survive reload while audit evidence stays saved", async ({ page }) => {
  await seed(page, [sample("saved-evidence", "2026-10-20T12:00:00Z", [true, false])]);
  const original = await (await page.request.get("/api/workspace")).json();
  const originalId = original.snapshot.promptRecords[0].id;
  // Explicit fixture-only consent. No worker tick or live provider is involved.
  const approved = { enabled: true, intervalHours: 168, hourUtc: (new Date().getUTCHours() + 12) % 24,
    perRunBudgetUsd: 0.025, monthlyBudgetUsd: 0.25, config: input };
  const configured = await page.request.put("/api/monitor", { data: approved });
  expect(configured.status(), await configured.text()).toBe(200);
  const monitorBefore = await configured.json();
  expect(monitorBefore.schedule).toMatchObject(approved);
  expect(monitorBefore.schedule.nextRunAt).toEqual(expect.any(String));
  expect(Date.parse(monitorBefore.schedule.nextRunAt)).toBeGreaterThan(Date.now());
  try {
  await nav(page, "Prompt tracking");
  const inventory = page.locator("details.prompt-library");
  await inventory.getByText("Manage question library", { exact: true }).click();
  let row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  await row.getByLabel(`Topic: ${neutral}`, { exact: true }).fill("Agency research");
  await row.getByRole("button", { name: `Pause: ${neutral}`, exact: true }).click();
  await expect(inventory.getByRole("status")).toContainText("Question paused");
  await inventory.getByLabel("Question library status").selectOption("paused");
  row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  await expect(row.getByLabel(`Topic: ${neutral}`, { exact: true })).toHaveValue("Agency research");
  await row.getByRole("button", { name: `Resume: ${neutral}`, exact: true }).click();
  await inventory.getByLabel("Question library status").selectOption("active");
  row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  await row.getByRole("button", { name: `Edit wording: ${neutral}`, exact: true }).click();
  const rewritten = "Which research toolkit fits an independent agency?";
  await row.getByLabel("Edit question wording").fill(rewritten);
  await row.getByRole("button", { name: "Save question", exact: true }).click();
  await expect(inventory.getByRole("article", { name: `Question: ${rewritten}`, exact: true })).toBeVisible();
  await inventory.getByLabel("Question library status").selectOption("archived");
  row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  await expect(row).toContainText(originalId);
  await row.getByRole("button", { name: `Restore: ${neutral}`, exact: true }).click();
  await inventory.getByLabel("Question library status").selectOption("active");
  const rewrittenRow = inventory.getByRole("article", { name: `Question: ${rewritten}`, exact: true });
  await rewrittenRow.getByRole("button", { name: `Archive: ${rewritten}`, exact: true }).click();
  await waitForServerSave(page);
  await page.reload();
  await nav(page, "Prompt tracking");
  await inventory.getByText("Manage question library", { exact: true }).click();
  await expect(inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true })).toContainText(originalId);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.runs).toEqual(original.snapshot.runs);
  expect(saved.snapshot.prompts).toEqual(input.prompts);
  expect(saved.snapshot.promptRecords.find((r: { text: string }) => r.text === rewritten)).toMatchObject({ archived: true, provenance: "manual" });
  const monitorAfter = await (await page.request.get("/api/monitor")).json();
  expect(monitorAfter.schedule).toEqual(monitorBefore.schedule);
  expect(monitorAfter.schedule).toMatchObject({ enabled: true, intervalHours: 168,
    perRunBudgetUsd: 0.025, monthlyBudgetUsd: 0.25, config: input,
    nextRunAt: monitorBefore.schedule.nextRunAt, lastRunAt: null });
  } finally {
    const paused = await page.request.delete("/api/monitor");
    expect(paused.status()).toBe(200);
  }
});

test("a one-off manual audit of a paused question preserves its pause and keeps it out of future defaults", async ({ page }) => {
  await seed(page, []);
  await nav(page, "Prompt tracking");
  const inventory = page.locator("details.prompt-library");
  await inventory.getByText("Manage question library", { exact: true }).click();
  const row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  await row.getByRole("button", { name: `Pause: ${neutral}`, exact: true }).click();
  await waitForServerSave(page);
  const pausedBefore = await (await page.request.get("/api/workspace")).json();
  expect(pausedBefore.snapshot.prompts).toEqual([branded]);
  const originalId = pausedBefore.snapshot.promptRecords.find((record: { text: string }) => record.text === neutral).id;
  const audit = await openAudit(page, neutral);
  await audit.getByRole("button", { name: /Perplexity/ }).click();
  await expect(audit.getByRole("button", { name: "Run visibility audit", exact: true })).toBeEnabled();
  const response = page.waitForResponse((value) => value.url().endsWith("/api/aeo/run") && value.request().method() === "POST");
  await audit.getByRole("button", { name: "Run visibility audit", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(audit.getByRole("heading", { name: "Your next move starts here.", exact: true })).toBeVisible();
  await audit.getByRole("button", { name: "Explore your results", exact: true }).click();
  await waitForServerSave(page);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.prompts).toEqual([branded]);
  expect(saved.snapshot.promptRecords.find((record: { text: string }) => record.text === neutral)).toMatchObject({ id: originalId, paused: true, archived: false });
  expect(saved.snapshot.runs).toHaveLength(1);
  expect(saved.snapshot.runs[0].results).toHaveLength(1);
  expect(saved.snapshot.runs[0].results[0]).toMatchObject({ prompt: neutral, engine: "chatgpt" });
  expect(saved.snapshot.runs[0].measurement.prompts).toEqual([{ id: originalId, text: neutral, kind: "neutral" }]);
  await page.reload();
  await page.getByRole("button", { name: "Run an audit", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "See where you stand." }).getByLabel("Prompts to track")).toHaveValue(branded);
});

test("competitor trend markers leave gaps for unconfigured names and changed historical domains", async ({ page }) => {
  const older = sample("old-competitor-domain", "2026-10-18T12:00:00Z", [true, true]);
  older.competitorDetails = [{ name: "Composio", domain: "old.example.com" }];
  const unconfigured = sample("unconfigured-competitor", "2026-10-19T12:00:00Z", [true, true]);
  unconfigured.competitors = [];
  const latest = sample("current-competitor-domain", "2026-10-20T12:00:00Z", [true, true]);
  latest.competitorDetails = [{ name: "Composio", domain: "composio.dev" }];
  for (const run of [older, unconfigured, latest]) for (const answer of run.results) answer.mentionedBrands.push("Composio");
  await seed(page, [older, unconfigured, latest]);
  const trend = page.getByRole("region", { name: "Comparable visibility trends" });
  // These missing historical identities are unknown observations, not zeroes.
  await expect(trend.getByTestId("trend-series-Treg").locator("circle")).toHaveCount(3);
  await expect(trend.getByTestId("trend-series-Composio").locator("circle")).toHaveCount(1);
  await trend.locator(".chart-legend").getByRole("button", { name: "Composio", exact: true }).click();
  await expect(trend.locator(".chart-legend").getByRole("button", { name: "Composio", exact: true })).toHaveClass("muted-legend");
  await trend.getByRole("img", { name: "Brand mention rate trend" }).hover();
  await expect(trend.locator(".chart-tooltip")).toBeVisible();
  await trend.getByText("Inspect trend scope and observations", { exact: true }).click();
  await expect(trend.getByText(/Competitor lines require the same saved name and domain/)).toBeVisible();
});

test("question library filters find saved types, intents, topics and wording without changing metadata or spending", async ({ page }) => {
  await seed(page, []);
  const before = await (await page.request.get("/api/workspace")).json();
  const texts = [neutral, branded, ...Array.from({ length: 24 }, (_, i) => `Which supplier fits use case ${i + 1}?`)];
  const records = texts.map((text) => createPromptRecord(text, project));
  records[0] = { ...records[0], intent: "category", topic: "Agency research" };
  records[1] = { ...records[1], intent: "branded" };
  await saveServerSnapshot(page, { ...before.snapshot, prompts: texts, promptRecords: records });
  await page.reload();
  await waitForServerSave(page);
  const unchanged = await (await page.request.get("/api/workspace")).json();
  const paid: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source)$/.test(request.url()) && !request.postDataJSON().estimateOnly) paid.push(request.url()); });
  await nav(page, "Prompt tracking");
  const inventory = page.locator("details.prompt-library");
  await inventory.getByText("Manage question library", { exact: true }).click();
  await expect(inventory.getByRole("article")).toHaveCount(25);
  await inventory.getByRole("button", { name: "Show 25 more questions", exact: true }).click();
  await expect(inventory.getByRole("article")).toHaveCount(26);
  await inventory.getByLabel("Question library type").selectOption("branded");
  await expect(inventory.getByRole("article")).toHaveCount(1);
  await expect(inventory.getByRole("article")).toContainText(branded);
  await inventory.getByLabel("Question library type").selectOption("neutral");
  await expect(inventory.getByRole("article")).toHaveCount(25);
  await inventory.getByLabel("Question library type").selectOption("all");
  await inventory.getByLabel("Question library intent").selectOption("category");
  await expect(inventory.getByRole("article")).toHaveCount(1);
  await expect(inventory.getByRole("article")).toContainText(neutral);
  await inventory.getByLabel("Question library intent").selectOption("all");
  await inventory.getByLabel("Question library topic").selectOption("topic:Agency research");
  await expect(inventory.getByRole("article")).toHaveCount(1);
  await expect(inventory.getByRole("article")).toContainText(neutral);
  await inventory.getByLabel("Question library topic").selectOption("untagged");
  await expect(inventory.getByRole("article")).toHaveCount(25);
  await expect(inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true })).toHaveCount(0);
  await inventory.getByLabel("Question library topic").selectOption("all");
  await inventory.getByRole("searchbox", { name: "Search question library", exact: true }).fill("TREG useful");
  await expect(inventory.getByRole("article")).toHaveCount(1);
  await expect(inventory.getByRole("article")).toContainText(branded);
  await inventory.getByRole("searchbox", { name: "Search question library", exact: true }).fill("No matching buyer question");
  await expect(inventory.getByText("No questions match these filters.", { exact: true })).toBeVisible();
  const after = await (await page.request.get("/api/workspace")).json();
  expect(after.revision).toBe(unchanged.revision);
  expect(after.snapshot).toEqual(unchanged.snapshot);
  expect(paid).toEqual([]);
});

test("assigning a topic in the untagged filter keeps the question editable until the complete topic is committed", async ({ page }) => {
  await seed(page, []);
  await nav(page, "Prompt tracking");
  const inventory = page.locator("details.prompt-library");
  await inventory.getByText("Manage question library", { exact: true }).click();
  await inventory.getByLabel("Question library topic").selectOption("untagged");
  const row = inventory.getByRole("article", { name: `Question: ${neutral}`, exact: true });
  const topic = row.getByLabel(`Topic: ${neutral}`, { exact: true });
  await topic.pressSequentially("Agency research plan");
  await expect(row).toBeVisible();
  await expect(topic).toHaveValue("Agency research plan");
  await topic.press("Tab");
  await expect(row).toHaveCount(0);
  await waitForServerSave(page);
  await inventory.getByLabel("Question library topic").selectOption("topic:Agency research plan");
  await expect(row).toBeVisible();
  await expect(row.getByLabel(`Topic: ${neutral}`, { exact: true })).toHaveValue("Agency research plan");
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.promptRecords.find((record: { text: string }) => record.text === neutral).topic).toBe("Agency research plan");
  // Enter also commits a full edit and removes the card from its previous topic filter.
  await row.getByLabel(`Topic: ${neutral}`, { exact: true }).fill("Agency research and buying");
  await row.getByLabel(`Topic: ${neutral}`, { exact: true }).press("Enter");
  await expect(row).toHaveCount(0);
  await waitForServerSave(page);
  await inventory.getByLabel("Question library topic").selectOption("topic:Agency research and buying");
  await expect(row.getByLabel(`Topic: ${neutral}`, { exact: true })).toHaveValue("Agency research and buying");
});
