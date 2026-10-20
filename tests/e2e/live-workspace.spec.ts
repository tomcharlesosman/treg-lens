import { readFile } from "node:fs/promises";
import { test, expect } from "./support/auth-helpers";
import { nav, signIn, seedWorkspace, saveServerSnapshot, storedFixture, waitForServerSave } from "./support/workspace-helpers";
import type { Page } from "@playwright/test";

const sync = (page: Page) => page.getByRole("region", { name: "Workspace synchronization" });
async function addPrompt(page: Page, prompt: string) {
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Add prompt", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "A good question opens doors." });
  await modal.getByLabel("Buyer question").fill(prompt);
  await modal.getByRole("button", { name: "Add prompt", exact: true }).click();
  await expect(modal).toBeHidden();
}
const syncKey = (key: string) => key.replace("treg-lens-workspace-v1", "treg-lens-sync-v1");
async function cacheUnreadSave(page: Page, key: string, snapshot: unknown, revision: number) {
  // Runs before the app on the next load, as if the tab closed before reading its save response.
  await page.addInitScript(({ key, meta, snapshot, revision }) => {
    localStorage.setItem(key, JSON.stringify(snapshot));
    localStorage.setItem(meta, JSON.stringify({ revision, dirty: true }));
  }, { key, meta: syncKey(key), snapshot, revision });
}

test("server-saved brand and prompts survive deleting the entire browser cache", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("region", { name: "Set up your workspace" })).toContainText("first answers");
  await page.getByRole("button", { name: "Edit brand profile", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Your workspace." });
  await settings.getByLabel("Brand name", { exact: true }).fill("My actual brand");
  await settings.getByLabel("Website", { exact: true }).fill("example.com");
  await settings.getByRole("button", { name: "Save changes" }).click();
  const prompt = "Who should choose my actual brand?";
  await addPrompt(page, prompt);
  await waitForServerSave(page);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.project.brand).toBe("My actual brand");
  expect(saved.snapshot.prompts).toContain(prompt);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await expect(page.getByRole("button", { name: /My actual brand workspace/ })).toBeVisible();
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
  await expect(sync(page)).toContainText("Saved to server");
});

test("a valid scoped browser workspace migrates only when the server has no snapshot", async ({ page }) => {
  const response = await page.request.post("/api/auth/session", { data: { token: `treg-e2e-legacy-${crypto.randomUUID()}` } });
  expect(response.ok()).toBe(true);
  const key = `treg-lens-workspace-v1:${(await response.json()).workspaceId}`;
  const legacy = { ...storedFixture(), project: { brand: "Migrated brand", domain: "example.com", competitors: [] } };
  await page.addInitScript(({ key, legacy }) => localStorage.setItem(key, JSON.stringify(legacy)), { key, legacy });
  await page.goto("/app");
  await expect(page.getByRole("button", { name: /Migrated brand workspace/ })).toBeVisible();
  await waitForServerSave(page);
  const server = await (await page.request.get("/api/workspace")).json();
  expect(server.snapshot.project.brand).toBe("Migrated brand");
  expect(server.snapshot.runs).toHaveLength(2);
});

test("failed saves retain local edits and retry synchronizes without overwriting unrelated server data", async ({ page }) => {
  const key = await seedWorkspace(page);
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { error: "Fixture storage unavailable" } });
    else await route.continue();
  });
  const prompt = "Which changes survive an interrupted server save?";
  await addPrompt(page, prompt);
  await expect(sync(page)).toContainText("Unsynced");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).prompts, key)).toContain(prompt);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.prompts).not.toContain(prompt);
  await page.unroute("**/api/workspace");
  await sync(page).getByRole("button", { name: "Retry sync" }).click();
  await waitForServerSave(page);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.prompts).toContain(prompt);
});

test("unsynced local edits survive a reload and then save to the server", async ({ page }) => {
  await seedWorkspace(page);
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { error: "Fixture storage unavailable" } });
    else await route.continue();
  });
  const prompt = "Which unsynced edits survive a reload?";
  await addPrompt(page, prompt);
  await expect(sync(page)).toContainText("Unsynced");
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.prompts).not.toContain(prompt);
  await page.unroute("**/api/workspace");
  await page.reload();
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
  await waitForServerSave(page);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.prompts).toContain(prompt);
});

test("a CAS conflict keeps both versions until the user explicitly loads the server version", async ({ page }) => {
  await seedWorkspace(page);
  const existing = await (await page.request.get("/api/workspace")).json();
  const remotePrompt = "A question added from another device";
  const remote = { ...existing.snapshot, prompts: [...existing.snapshot.prompts, remotePrompt] };
  const changed = await page.request.put("/api/workspace", { data: { snapshot: remote, revision: existing.revision } });
  expect(changed.status()).toBe(200);
  const localPrompt = "My pending local question";
  await addPrompt(page, localPrompt);
  await expect(sync(page)).toContainText("Conflicting workspace versions");
  await expect(page.locator(".prompt-cell").filter({ hasText: localPrompt })).toHaveCount(1);
  const server = await (await page.request.get("/api/workspace")).json();
  expect(server.snapshot.prompts).toContain(remotePrompt);
  expect(server.snapshot.prompts).not.toContain(localPrompt);
  await sync(page).getByRole("button", { name: "Load server version" }).click();
  const confirmation = page.getByRole("dialog", { name: "Load the server workspace?" });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".prompt-cell").filter({ hasText: localPrompt })).toHaveCount(1);
  await sync(page).getByRole("button", { name: "Load server version" }).click();
  await confirmation.getByRole("button", { name: "Confirm load server version" }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator(".prompt-cell").filter({ hasText: remotePrompt })).toHaveCount(1);
  await expect(page.locator(".prompt-cell").filter({ hasText: localPrompt })).toHaveCount(0);
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(server.revision);
});

test("a recovered browser copy identical to its committed save reloads as saved instead of conflicting", async ({ page }) => {
  const key = await seedWorkspace(page);
  const before = await (await page.request.get("/api/workspace")).json();
  const prompt = "Which edit reached the server before the tab closed?";
  const edited = { ...before.snapshot, prompts: [...before.snapshot.prompts, prompt] };
  const committed = await saveServerSnapshot(page, edited);
  await cacheUnreadSave(page, key, edited, before.revision);
  await page.reload();
  await waitForServerSave(page);
  await expect(sync(page)).not.toContainText("Conflicting workspace versions");
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell").filter({ hasText: prompt })).toHaveCount(1);
  expect(await page.evaluate((meta) => JSON.parse(localStorage.getItem(meta)!), syncKey(key))).toEqual({ revision: committed.revision, dirty: false });
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(committed.revision);
});

test("a recovered browser copy that differs from a newer server save still keeps both versions", async ({ page }) => {
  const key = await seedWorkspace(page);
  const before = await (await page.request.get("/api/workspace")).json();
  const remotePrompt = "A question saved from another device";
  const localPrompt = "A question this browser never saved";
  const committed = await saveServerSnapshot(page, { ...before.snapshot, prompts: [...before.snapshot.prompts, remotePrompt] });
  await cacheUnreadSave(page, key, { ...before.snapshot, prompts: [...before.snapshot.prompts, localPrompt] }, before.revision);
  await page.reload();
  await expect(sync(page)).toContainText("Conflicting workspace versions");
  await expect(sync(page)).toContainText("Recovered unsynced browser edits and a newer saved server version.");
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell").filter({ hasText: localPrompt })).toHaveCount(1);
  await expect(page.locator(".prompt-cell").filter({ hasText: remotePrompt })).toHaveCount(0);
  const server = await (await page.request.get("/api/workspace")).json();
  expect(server.revision).toBe(committed.revision);
  expect(server.snapshot).toEqual(committed.snapshot);
});

test("refreshing after a lost save acknowledgement adopts the committed save without a conflict", async ({ page }) => {
  await seedWorkspace(page);
  const before = await (await page.request.get("/api/workspace")).json();
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const saved = await route.fetch();
    expect(saved.status()).toBe(200);
    await route.abort("failed");
  });
  const prompt = "Which save committed after its response was lost?";
  await addPrompt(page, prompt);
  await expect(sync(page)).toContainText("Unsynced · browser fallback");
  await page.unroute("**/api/workspace");
  const committed = await (await page.request.get("/api/workspace")).json();
  expect(committed.revision).toBe(before.revision + 1);
  expect(committed.snapshot.prompts).toContain(prompt);
  await sync(page).getByRole("button", { name: "Refresh", exact: true }).click();
  await waitForServerSave(page);
  await expect(sync(page)).not.toContainText("Conflicting workspace versions");
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(committed.revision);
});

test("full backup ignores report filters, restores only after confirmation, and rejects demo/credential/malformed files", async ({ page }) => {
  await seedWorkspace(page);
  const base = storedFixture();
  const old = { ...base.runs[0], id: "archived-other-brand", brand: "Archive Brand", domain: "archive.example.com", completedAt: "2020-01-01T00:00:00.000Z" };
  await saveServerSnapshot(page, { ...base, runs: [...base.runs, old], done: [base.prompts[0]] });
  await page.reload();
  await page.getByLabel("Date range", { exact: true }).selectOption("7");
  await page.getByLabel("Filter chart by engine").selectOption("chatgpt");
  await sync(page).getByRole("button", { name: "Backup and restore" }).click();
  const backup = page.getByRole("dialog", { name: "Backup and restore." });
  const downloading = page.waitForEvent("download");
  await backup.getByRole("button", { name: "Download full workspace backup" }).click();
  const downloaded = await downloading;
  const text = await readFile((await downloaded.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.kind).toBe("treg-lens-workspace-backup");
  expect(data.snapshot.runs).toHaveLength(3);
  expect(data.snapshot.done).toEqual([base.prompts[0]]);
  expect(data.snapshot).toHaveProperty("sourceResearch");
  expect(text).not.toContain("treg-e2e-");
  const file = backup.getByLabel("Import a full workspace backup");
  for (const invalid of [{ ...data, demo: true }, { ...data, snapshot: { ...data.snapshot, token: "private-key" } }, { broken: true }]) {
    await file.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid)) });
    await expect(backup.getByRole("alert")).toBeVisible();
    await expect(backup.getByRole("button", { name: "Confirm replace workspace" })).toHaveCount(0);
  }
  const restored = { ...data, snapshot: { ...data.snapshot, project: { ...data.snapshot.project, brand: "Restored real brand" } } };
  await file.setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(restored)) });
  await expect(backup.getByRole("heading", { name: "Replace your current workspace?" })).toBeVisible();
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.project.brand).toBe("Treg");
  await backup.getByRole("button", { name: "Confirm replace workspace" }).click();
  await waitForServerSave(page);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.project.brand).toBe("Restored real brand");
});

test("monitoring requires explicit paid consent and budgets, reports worker health, and can remove its credential", async ({ page }) => {
  await signIn(page);
  await sync(page).getByRole("button", { name: "Monitoring", exact: true }).click();
  const monitor = page.getByRole("dialog", { name: "Scheduled monitoring." });
  const consent = monitor.getByRole("checkbox", { name: /Enable paid monitoring/ });
  await expect(consent).not.toBeChecked();
  await expect(monitor.getByText(/^(?:Worker online|Worker offline or not yet seen)$/)).toBeVisible();
  await monitor.getByLabel("Maximum USD per scheduled audit").fill("0.01");
  await monitor.getByLabel("Monthly automated budget (USD)").fill("0.001");
  await expect(monitor.getByRole("button", { name: "Save monitoring settings" })).toBeDisabled();
  await monitor.getByLabel("Monthly automated budget (USD)").fill("1");
  await consent.check();
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/monitor") && response.request().method() === "PUT");
  await monitor.getByRole("button", { name: "Save monitoring settings" }).click();
  expect((await saved).status()).toBe(200);
  await expect(monitor.getByText(/Monitoring enabled\./)).toBeVisible();
  const state = await (await page.request.get("/api/monitor")).json();
  expect(state.schedule.enabled).toBe(true);
  expect(state.schedule.perRunBudgetUsd).toBe(0.01);
  expect(JSON.stringify(state)).not.toMatch(/treg-e2e-|encryptedCredential/);
  await monitor.getByRole("button", { name: "Pause and remove monitoring credential" }).click();
  await expect(monitor.getByText(/Monitoring paused and its encrypted credential removed/)).toBeVisible();
  expect((await (await page.request.get("/api/monitor")).json()).schedule?.enabled ?? false).toBe(false);
});
