import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/auth-helpers";
import { nav, saveServerSnapshot, seedWorkspace, signIn, storedFixture, waitForServerSave } from "./support/workspace-helpers";
import { MAX_WORKSPACE_BYTES } from "../../src/lib/workspace-validation";
import type { SavedRun } from "../../src/lib/workspace-data";

const sync = (page: Page) => page.getByRole("region", { name: "Workspace synchronization" });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function confirmDeletion(page: Page, button: Locator, accept: boolean) {
  const prompting = page.waitForEvent("dialog");
  const clicking = button.click();
  const dialog = await prompting;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("Download a full workspace backup first");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await clicking;
}

async function openBackup(page: Page) {
  await sync(page).getByRole("button", { name: "Backup and restore" }).click();
  return page.getByRole("dialog", { name: "Backup and restore." });
}

async function exportBackup(page: Page, dialog: Locator) {
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download full workspace backup" }).click();
  const downloaded = await downloading;
  return readFile((await downloaded.path())!);
}

function recoveredRun(base: SavedRun, id: string, completedAt: string): SavedRun {
  return {
    ...base,
    id,
    completedAt,
    results: base.results.map((answer, index) => ({ ...answer, id: `${id}-${index}`, answer: `Recovered evidence for ${id}.`, completedAt })),
  };
}

test("deleting an audit requires confirmation, persists across reload, and leaves the earlier full backup intact", async ({ page }) => {
  await seedWorkspace(page);
  await nav(page, "Audit history");
  await page.getByRole("button", { name: "Open audit", exact: true }).first().click();
  const audit = page.getByRole("dialog", { name: "Treg visibility audit" });
  await expect(audit).toBeVisible();
  const backup = JSON.parse((await exportBackup(page, audit)).toString("utf8"));
  expect(backup.snapshot.runs.map((run: SavedRun) => run.id)).toEqual(["earlier-run", "latest-run"]);
  const before = await (await page.request.get("/api/workspace")).json();

  await confirmDeletion(page, audit.getByRole("button", { name: "Delete this audit" }), false);
  await expect(audit).toBeVisible();
  const cancelled = await (await page.request.get("/api/workspace")).json();
  expect(cancelled.revision).toBe(before.revision);
  expect(cancelled.snapshot.runs.map((run: SavedRun) => run.id)).toEqual(["earlier-run", "latest-run"]);

  await confirmDeletion(page, audit.getByRole("button", { name: "Delete this audit" }), true);
  await expect(audit).toBeHidden();
  await waitForServerSave(page);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.runs.map((run: SavedRun) => run.id)).toEqual(["earlier-run"]);
  await page.reload();
  await nav(page, "Audit history");
  await expect(page.getByRole("button", { name: "Open audit", exact: true })).toHaveCount(1);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.runs.map((run: SavedRun) => run.id)).toEqual(["earlier-run"]);
  expect(backup.snapshot.runs.find((run: SavedRun) => run.id === "latest-run").results).toEqual(before.snapshot.runs[1].results);
});

test("monitoring recovery merges only after confirmation, preserves current records, sorts history, and is idempotent", async ({ page }) => {
  await signIn(page);
  const base = storedFixture();
  base.prompts = [...base.prompts, "Keep the question configured in this workspace"];
  base.done = [base.prompts[1]];
  await saveServerSnapshot(page, base);
  await page.reload();
  await waitForServerSave(page);
  const recovery = {
    version: 1,
    kind: "monitoring-recovery",
    runs: [
      recoveredRun(base.runs[1], "recovered-newer", "2026-10-21T12:00:00.000Z"),
      recoveredRun(base.runs[1], "latest-run", "2026-10-19T12:00:00.000Z"),
      recoveredRun(base.runs[0], "recovered-older", "2026-10-01T12:00:00.000Z"),
    ],
  };
  const file = { name: "monitoring-recovery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(recovery)) };
  const backup = await openBackup(page);
  await backup.getByLabel("Import a full workspace backup").setInputFiles(file);
  await expect(backup.getByRole("heading", { name: "Merge recovered monitoring audits?" })).toBeVisible();
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.runs).toHaveLength(2);
  await backup.getByRole("button", { name: "Confirm merge recovered audits" }).click();
  await expect(backup).toBeHidden();
  await waitForServerSave(page);
  const merged = (await (await page.request.get("/api/workspace")).json()).snapshot;
  const expectedIds = ["recovered-older", "earlier-run", "latest-run", "recovered-newer"];
  expect(merged.runs.map((run: SavedRun) => run.id)).toEqual(expectedIds);
  expect(merged.runs.find((run: SavedRun) => run.id === "latest-run")).toEqual(base.runs[1]);
  expect(merged.project).toEqual(base.project);
  expect(merged.prompts).toEqual(base.prompts);
  expect(merged.done).toEqual(base.done);
  expect(merged.sourceResearch).toEqual(base.sourceResearch);

  await page.reload();
  await nav(page, "Audit history");
  await expect(page.getByRole("button", { name: "Open audit", exact: true })).toHaveCount(4);
  await expect(page.getByRole("row").filter({ hasText: "Latest" })).toContainText("Oct 21");
  const reopened = await openBackup(page);
  await reopened.getByLabel("Import a full workspace backup").setInputFiles(file);
  await reopened.getByRole("button", { name: "Confirm merge recovered audits" }).click();
  await expect(reopened).toBeHidden();
  await waitForServerSave(page);
  const repeated = (await (await page.request.get("/api/workspace")).json()).snapshot;
  expect(repeated).toEqual(merged);
  expect(new Set(repeated.runs.map((run: SavedRun) => run.id)).size).toBe(4);
});

test("a workspace at the exact 8 MiB limit exports compactly and restores its complete answer data", async ({ page }) => {
  test.slow();
  await signIn(page);
  const large = storedFixture();
  large.runs[0].results[0].answer = "";
  const answerLength = MAX_WORKSPACE_BYTES - Buffer.byteLength(JSON.stringify(large));
  large.runs[0].results[0].answer = "x".repeat(answerLength);
  const expectedDigest = digest(large.runs[0].results[0].answer);
  expect(Buffer.byteLength(JSON.stringify(large))).toBe(MAX_WORKSPACE_BYTES);
  await saveServerSnapshot(page, large);
  await page.reload();
  await waitForServerSave(page);
  const backup = await openBackup(page);
  const bytes = await exportBackup(page, backup);
  const exported = JSON.parse(bytes.toString("utf8"));
  expect(bytes.byteLength).toBeGreaterThan(MAX_WORKSPACE_BYTES);
  expect(bytes.byteLength).toBeLessThanOrEqual(MAX_WORKSPACE_BYTES + 4096);
  expect(bytes.toString("utf8")).toBe(JSON.stringify(exported));
  expect(exported.snapshot.runs[0].results[0].answer.length).toBe(answerLength);
  expect(digest(exported.snapshot.runs[0].results[0].answer)).toBe(expectedDigest);
  await backup.getByRole("button", { name: "Close backup and restore" }).click();

  const temporary = { ...storedFixture(), project: { brand: "Temporary small workspace", domain: "example.com", competitors: [] } };
  const cleared = await saveServerSnapshot(page, temporary);
  await sync(page).getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: /Temporary small workspace workspace/ })).toBeVisible();
  const restoring = await openBackup(page);
  await restoring.getByLabel("Import a full workspace backup").setInputFiles({ name: "large-workspace-backup.json", mimeType: "application/json", buffer: bytes });
  await expect(restoring.getByRole("heading", { name: "Replace your current workspace?" })).toBeVisible();
  await expect(restoring.getByRole("alert")).toHaveCount(0);
  expect((await (await page.request.get("/api/workspace")).json()).revision).toBe(cleared.revision);
  await restoring.getByRole("button", { name: "Confirm replace workspace" }).click();
  await expect(restoring).toBeHidden();
  await waitForServerSave(page);
  const roundTrip = await (await page.request.get("/api/workspace")).json();
  expect(roundTrip.revision).toBeGreaterThan(cleared.revision);
  expect(roundTrip.snapshot.project).toEqual(large.project);
  expect(roundTrip.snapshot.prompts).toEqual(large.prompts);
  expect(roundTrip.snapshot.runs.map((run: SavedRun) => run.id)).toEqual(large.runs.map((run) => run.id));
  expect(roundTrip.snapshot.runs[0].results[0].answer.length).toBe(answerLength);
  expect(digest(roundTrip.snapshot.runs[0].results[0].answer)).toBe(expectedDigest);
});
