import { createHash } from "node:crypto";
import { test, expect } from "./support/auth-helpers";
import { signIn, storedFixture, waitForServerSave } from "./support/workspace-helpers";

test("restoring a large workspace autosaves with bounded chunks and survives a fresh page load", async ({ page }) => {
  await signIn(page);
  const draft = storedFixture();
  draft.runs[0].results[0].answer = "🌿漢字".repeat(340_000);
  const digest = createHash("sha256").update(draft.runs[0].results[0].answer).digest("hex");
  const backup = Buffer.from(JSON.stringify({ kind: "treg-lens-workspace-backup", version: 1, demo: false, exportedAt: new Date().toISOString(), snapshot: draft }));
  expect(backup.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  const requests: { path: string; method: string; bytes: number }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/workspace")) requests.push({ path, method: request.method(), bytes: request.postDataBuffer()?.byteLength || 0 });
  });
  await page.getByRole("region", { name: "Workspace synchronization" }).getByRole("button", { name: "Backup and restore" }).click();
  const dialog = page.getByRole("dialog", { name: "Backup and restore." });
  await dialog.getByLabel("Import a full workspace backup").setInputFiles({ name: "large-backup.json", mimeType: "application/json", buffer: backup });
  await dialog.getByRole("button", { name: "Confirm replace workspace" }).click();
  await expect(dialog).toBeHidden();
  await waitForServerSave(page);
  expect(requests.some((request) => request.path === "/api/workspace/uploads" && request.method === "POST")).toBe(true);
  const chunks = requests.filter((request) => /\/chunks\/\d+$/.test(request.path));
  expect(chunks.length).toBeGreaterThanOrEqual(4);
  expect(chunks.every((request) => request.bytes > 0 && request.bytes <= 1024 * 1024)).toBe(true);
  expect(requests.some((request) => /\/commit$/.test(request.path))).toBe(true);
  expect(requests.some((request) => request.path === "/api/workspace" && request.method === "PUT")).toBe(false);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(createHash("sha256").update(saved.snapshot.runs[0].results[0].answer).digest("hex")).toBe(digest);
  await page.reload();
  await waitForServerSave(page);
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(saved.revision);
});

test("retrying a lost large-save acknowledgement replays its committed upload without a conflicting or duplicate revision", async ({ page }) => {
  await signIn(page);
  const draft = storedFixture();
  draft.runs[0].results[0].answer = "x".repeat(3 * 1024 * 1024 + 100);
  const backup = Buffer.from(JSON.stringify({ kind: "treg-lens-workspace-backup", version: 1, demo: false, exportedAt: new Date().toISOString(), snapshot: draft }));
  const before = await (await page.request.get("/api/workspace")).json();
  let lost = false;
  const commitIds: string[] = [];
  await page.route("**/api/workspace/uploads/*/commit", async (route) => {
    commitIds.push(new URL(route.request().url()).pathname);
    if (!lost) {
      lost = true;
      const completed = await route.fetch();
      expect(completed.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  const sync = page.getByRole("region", { name: "Workspace synchronization" });
  await sync.getByRole("button", { name: "Backup and restore" }).click();
  const dialog = page.getByRole("dialog", { name: "Backup and restore." });
  await dialog.getByLabel("Import a full workspace backup").setInputFiles({ name: "large-backup.json", mimeType: "application/json", buffer: backup });
  await dialog.getByRole("button", { name: "Confirm replace workspace" }).click();
  await expect(sync).toContainText("Unsynced · browser fallback");
  const committed = await (await page.request.get("/api/workspace")).json();
  expect(committed.revision).toBe(before.revision + 1);
  await sync.getByRole("button", { name: "Retry sync" }).click();
  await waitForServerSave(page);
  expect(commitIds).toHaveLength(2);
  expect(commitIds[1]).toBe(commitIds[0]);
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(committed.revision);
  await expect(sync).not.toContainText("Conflicting workspace versions");
});
