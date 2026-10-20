import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/auth-helpers";
import { readFile } from "node:fs/promises";
import type { AuditInput } from "../../src/lib/aeo";
import { buildMeasurementScope } from "../../src/lib/measurement";
import { createEvidenceReport } from "../../src/lib/evidence-reports";
import { createPagePlan, pagePlanOpportunities } from "../../src/lib/page-plans";
import type { SavedRun } from "../../src/lib/workspace-data";
import { nav, saveServerSnapshot, signIn, waitForServerSave } from "./support/workspace-helpers";

const question = "Which research toolkit fits a small agency?";
const input: AuditInput = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: [question], engines: ["chatgpt"] };
const project = { brand: input.brand, domain: input.domain, competitors: input.competitors, description: "Reliable data tools for independent agencies.", onboardingCompletedAt: "2026-10-20T10:00:00Z" };
function run(id: string, completedAt: string, present: boolean): SavedRun {
  return { id, ...input, measurement: buildMeasurementScope(input), completedAt, totalCostUsd: 0.002, totalCostKnown: true, errors: [], results: [{ id: `${id}-answer`, prompt: question, engine: "chatgpt", answer: `# ${id} research\n\n${present ? "Treg" : "Composio"} helps with agency research.\n\n<script>window.__reportUnsafe = true</script>\n[Unsafe source](javascript:alert(1))\n![Remote tracking pixel](https://example.com/pixel.png)`, citations: [{ url: present ? "https://treg.to/aeo" : "https://composio.dev/docs", title: present ? "Treg AEO toolkit" : "Composio documentation", domain: present ? "treg.to" : "composio.dev" }], mentionedBrands: present ? ["Treg"] : ["Composio"], brandMentioned: present, position: present ? 1 : null, completedAt, costUsd: 0.002, costKnown: true, sourceKind: "web-interface", provider: "cloro" }] };
}
async function seed(page: Page, partial = false) {
  await signIn(page);
  const baseline = run("report-baseline", "2026-10-18T12:00:00Z", false);
  const followup = run("report-followup", "2026-10-20T12:00:00Z", true);
  if (partial) { followup.results = []; followup.errors = [{ prompt: question, engine: "chatgpt", error: "Fixture interrupted collection" }]; followup.totalCostKnown = false; }
  const plan = { ...createPagePlan({ id: "report-page-plan", opportunity: pagePlanOpportunities([baseline], project)[0], now: "2026-10-18T12:00:00Z" }), target: { kind: "existing" as const, url: "https://treg.to/aeo" }, rationale: "Help agency buyers evaluate data coverage.", brief: "Explain supported data sources with primary evidence.", status: "published" as const, publishedAt: "2026-10-19T12:00:00Z", followupRunId: followup.id };
  await saveServerSnapshot(page, { project, prompts: input.prompts, runs: [baseline, followup], done: [], sourceResearch: {}, pagePlans: [plan], reports: [] });
  await page.reload();
  await waitForServerSave(page);
  await nav(page, "Reports");
  return { baseline, followup, plan };
}
function observePaid(page: Page) {
  const paid: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source|onboard)$/.test(new URL(request.url()).pathname) && !request.postDataJSON()?.estimateOnly) paid.push(request.url()); });
  return paid;
}

test("private reports freeze selected evidence and page plans, survive source deletion and profile changes, and export agent handoffs without paid calls", async ({ page }) => {
  const { baseline, followup, plan } = await seed(page);
  const paid = observePaid(page);
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  await reports.getByLabel("Report title", { exact: true }).fill("Agency visibility review");
  await reports.getByLabel("Include a saved page plan").selectOption(plan.id);
  await expect(reports.getByLabel("Baseline audit", { exact: true })).toHaveValue(baseline.id);
  await expect(reports.getByLabel("Follow-up audit", { exact: true })).toHaveValue(followup.id);
  await reports.getByLabel("Report notes", { exact: true }).fill("A clearer comparison page is our next hypothesis.");
  await reports.getByRole("button", { name: "Save private report", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Agency visibility review", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("report-comparison")).toContainText("+100.0 percentage points");
  await expect(dialog).toContainText("not evidence that a page edit caused it");
  await expect(dialog.locator(".er-plan .answer-preview")).toHaveText(plan.brief);
  await expect(dialog.locator(".er-plan .answer-preview")).toBeVisible();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.reports).toHaveLength(1);
  const snapshot = saved.snapshot.reports[0];
  expect(snapshot.runs).toEqual([baseline, followup]);
  expect(snapshot.plans).toEqual([plan]);

  const jsonDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download report JSON", exact: true }).click();
  const jsonText = await readFile((await (await jsonDownload).path())!, "utf8");
  expect(jsonText).toContain("report-baseline-answer");
  expect(jsonText).toContain("report-followup-answer");
  expect(jsonText).toContain("https://treg.to/aeo");
  expect(jsonText).not.toContain("treg-e2e-primary");
  expect(jsonText).not.toContain("SESSION_SECRET");
  expect(jsonText).not.toMatch(/"(?:token|authorization|apiKey|api_key|sessionSecret)"\s*:/i);
  await dialog.getByRole("button", { name: "Continue with your agent", exact: true }).click();
  const handoff = dialog.getByRole("region", { name: "Agent handoff" });
  await expect(handoff).toContainText("not a live connection");
  const handoffText = await handoff.getByLabel("Agent instruction pack").inputValue();
  expect(handoffText).toContain(question);
  expect(handoffText).toContain("https://treg\\.to/aeo");
  expect(handoffText).toMatch(/approv|consent/i);
  expect(handoffText).not.toContain("treg-e2e-primary");
  const mdDownload = page.waitForEvent("download");
  await handoff.getByRole("button", { name: "Download agent handoff", exact: true }).click();
  expect(await readFile((await (await mdDownload).path())!, "utf8")).toBe(handoffText);
  await dialog.getByRole("button", { name: "Close report", exact: true }).click();
  await waitForServerSave(page);

  // Remove all source material and change the active profile through real storage.
  await saveServerSnapshot(page, { ...saved.snapshot, project: { ...project, brand: "Different Brand", domain: "different.example", description: "New unrelated context." }, runs: [], pagePlans: [] });
  await page.reload();
  await nav(page, "Reports");
  await reports.getByRole("button", { name: /Agency visibility review/ }).click();
  dialog = page.getByRole("dialog", { name: "Agency visibility review", exact: true });
  await expect(dialog).toContainText("Treg · treg.to");
  await expect(dialog).toContainText(project.description);
  await expect(dialog).not.toContainText("New unrelated context");
  await expect(dialog.getByTestId("report-comparison")).toContainText("+100.0 percentage points");
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.reports[0]).toEqual(snapshot);
  expect(paid).toEqual([]);
});

test("reports preserve partial evidence, errors and unknown billing without inventing a comparable change", async ({ page }) => {
  const { plan } = await seed(page, true);
  const paid = observePaid(page);
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  await reports.getByLabel("Include a saved page plan").selectOption(plan.id);
  await reports.getByLabel("Report title", { exact: true }).fill("Partial evidence review");
  await expect(reports.getByTestId("report-comparison")).toContainText("at least 90%");
  await reports.getByRole("button", { name: "Save private report", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Partial evidence review", exact: true });
  await expect(dialog.getByTestId("report-comparison")).toContainText("Comparison unavailable");
  await expect(dialog).toContainText("Fixture interrupted collection");
  await expect(dialog.getByRole("region", { name: "Follow-up evidence" })).toContainText("0/1 answers · 0% coverage");
  await expect(dialog).toContainText("Final cost unknown");
  await expect(dialog).toContainText("additional charges may exist");
  const mdDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download Markdown", exact: true }).click();
  const exported = await readFile((await (await mdDownload).path())!, "utf8");
  expect(exported).toContain("Fixture interrupted collection");
  expect(exported).toMatch(/unknown/i);
  expect(exported).toContain("report\\-baseline\\-answer");
  expect(paid).toEqual([]);
});

test("report evidence is safe, responsive, keyboard-accessible and fully expanded for browser printing", async ({ page }, testInfo) => {
  await seed(page);
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  const noHorizontalOverflow = async (target: Locator, width: number) => {
    const dimensions = await target.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    expect(dimensions.left).toBeGreaterThanOrEqual(-1);
    expect(dimensions.right).toBeLessThanOrEqual(width + 1);
  };
  const screenshot = async (name: string, fullPage = false) => {
    if (testInfo.project.name !== "chromium") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await reports.scrollIntoViewIfNeeded();
    await noHorizontalOverflow(reports, width);
    await screenshot(`reports-library-${width}`);
  }
  await reports.getByLabel("Report title", { exact: true }).fill("Printable evidence");
  const save = reports.getByRole("button", { name: "Save private report", exact: true });
  await save.click();
  const dialog = page.getByRole("dialog", { name: "Printable evidence", exact: true });
  await expect(dialog).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noHorizontalOverflow(dialog, width);
    await screenshot(`report-modal-${width}`);
  }
  await dialog.getByRole("button", { name: "Continue with your agent", exact: true }).click();
  const handoff = dialog.getByRole("region", { name: "Agent handoff" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await handoff.getByLabel("Agent instruction pack").scrollIntoViewIfNeeded();
    await noHorizontalOverflow(dialog, width);
    await noHorizontalOverflow(handoff, width);
    await screenshot(`report-handoff-${width}`);
  }
  const baseline = dialog.getByRole("region", { name: "Baseline evidence" });
  await baseline.getByText("Inspect 1 saved answer and citations", { exact: true }).click();
  await baseline.getByText(/Read full answer/).click();
  await expect(baseline.locator(".answer-markdown")).toContainText("report-followup research");
  await expect(dialog.locator("script, img")).toHaveCount(0);
  await expect(dialog.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __reportUnsafe?: boolean }).__reportUnsafe)).toBeUndefined();
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event("beforeprint")); }; });
  await dialog.getByRole("button", { name: "Print report", exact: true }).click();
  expect(await dialog.locator("details:not([open])").count()).toBe(0);
  await page.emulateMedia({ media: "print" });
  await expect(dialog.locator(".er-toolbar").first()).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(handoff).toBeHidden();
  await expect(dialog.locator(".er-report-heading")).toBeVisible();
  await expect(dialog.locator(".answer-markdown")).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).overflow)).toBe("visible");
  await screenshot("report-print-expanded", true);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await dialog.getByRole("button", { name: "Close report", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(save).toBeFocused();
});

test("a failed report save retains the exact draft and never claims persistence before acknowledgement", async ({ page }) => {
  await seed(page);
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  const putBodies: unknown[] = [];
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    putBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture storage unavailable" }) });
  });
  await reports.getByLabel("Report title", { exact: true }).fill("Keep my exact snapshot");
  await reports.getByLabel("Report notes", { exact: true }).fill("Preserve these notes until acknowledged.");
  await reports.getByRole("button", { name: "Save private report", exact: true }).click();
  await expect(reports.getByRole("alert")).toContainText("Report not saved");
  await expect(reports.getByRole("heading", { name: "Report snapshots", exact: true })).toBeVisible();
  await expect(reports).toContainText("not yet acknowledged by the server");
  await expect(reports.getByRole("heading", { name: "Saved reports", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Keep my exact snapshot", exact: true })).toBeHidden();
  await expect(reports.getByLabel("Report notes", { exact: true })).toHaveValue("Preserve these notes until acknowledged.");
  await expect(reports.getByRole("button", { name: "Retry saving snapshot", exact: true })).toBeVisible();
  expect(putBodies.length).toBeGreaterThan(0);
  const beforeRetry = putBodies[0] as { snapshot: { reports: unknown[] } };
  await page.unroute("**/api/workspace");
  await reports.getByRole("button", { name: "Retry saving snapshot", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Keep my exact snapshot", exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.reports).toEqual(beforeRetry.snapshot.reports);
});

test("the report limit keeps every snapshot until an explicitly confirmed deletion is acknowledged", async ({ page }) => {
  const { baseline } = await seed(page);
  const existing = await (await page.request.get("/api/workspace")).json();
  const snapshots = Array.from({ length: 10 }, (_, index) => createEvidenceReport({ id: `limit-report-${index}`, title: `Saved review ${index + 1}`, project, runs: [baseline], now: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z` }));
  await saveServerSnapshot(page, { ...existing.snapshot, reports: snapshots });
  await page.reload();
  await nav(page, "Reports");
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  await expect(reports.getByRole("button", { name: "Save private report", exact: true })).toBeDisabled();
  await expect(reports).toContainText("10 saved report limit");
  await reports.getByRole("button", { name: /^Saved review 1 Treg/ }).click();
  const dialog = page.getByRole("dialog", { name: "Saved review 1", exact: true });
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("button", { name: "Delete saved report", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.reports).toHaveLength(10);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete saved report", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(reports.getByRole("button", { name: "Save private report", exact: true })).toBeEnabled();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.reports).toEqual(snapshots.slice(1));
  await page.reload();
  await nav(page, "Reports");
  await expect(reports.getByRole("button", { name: /^Saved review 1 Treg/ })).toHaveCount(0);
});

test("a report with a linked page plan withholds change when its follow-up predates publication", async ({ page }) => {
  const { plan } = await seed(page);
  const existing = await (await page.request.get("/api/workspace")).json();
  await saveServerSnapshot(page, { ...existing.snapshot, pagePlans: [{ ...plan, publishedAt: "2026-10-21T12:00:00Z" }] });
  await page.reload();
  await nav(page, "Reports");
  const reports = page.getByRole("region", { name: "Private evidence reports" });
  await reports.getByLabel("Include a saved page plan").selectOption(plan.id);
  await reports.getByLabel("Report title", { exact: true }).fill("Publication timing review");
  await expect(reports.getByTestId("report-comparison")).toContainText("before the recorded publication date");
  await reports.getByRole("button", { name: "Save private report", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publication timing review", exact: true });
  await expect(dialog.getByTestId("report-comparison")).toContainText("Comparison unavailable");
  await expect(dialog.getByTestId("report-comparison")).not.toContainText("+100.0");
  const mdDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download Markdown", exact: true }).click();
  const exported = await readFile((await (await mdDownload).path())!, "utf8");
  expect(exported).toContain("before the recorded publication date");
  expect(exported).not.toContain("+100.0 percentage points");
});
