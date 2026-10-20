import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createPromptRecord } from "../../src/lib/prompt-library";
import { nav, saveServerSnapshot, signIn, waitForServerSave } from "./support/workspace-helpers";

test("full backup restores discovery receipts, question identities and collection snapshots without repeating research", async ({ page }) => {
  await signIn(page);
  const original = await (await page.request.get("/api/workspace")).json();
  const prompt = "Which toolkit fits a research agency?";
  const record = { ...createPromptRecord(prompt, original.snapshot.project), topic: "Research agencies", paused: false, archived: false };
  await saveServerSnapshot(page, { ...original.snapshot, prompts: [prompt], promptRecords: [record] });
  const research = await page.request.post("/api/aeo/discover", { data: { brand: original.snapshot.project.brand, domain: original.snapshot.project.domain, seeds: ["Research agencies", "Research tools"], maxCostUsd: 0.1 } });
  expect(research.status(), await research.text()).toBe(200);
  const audit = await page.request.post("/api/aeo/run", { data: { brand: original.snapshot.project.brand, domain: original.snapshot.project.domain, competitors: original.snapshot.project.competitors, prompts: [prompt], engines: ["chatgpt"], maxCostUsd: 0.1 } });
  expect(audit.status(), await audit.text()).toBe(200);
  await page.reload();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.discoveryResearch).toHaveLength(1);
  expect(saved.snapshot.runs[0].measurement.prompts[0].id).toBe(record.id);

  const paid: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/aeo\/(run|discover|source)$/.test(request.url()) && !request.postDataJSON().estimateOnly) paid.push(request.url());
  });
  await page.getByRole("button", { name: "Backup and restore", exact: true }).click();
  let backup = page.getByRole("dialog", { name: "Backup and restore." });
  const downloadPromise = page.waitForEvent("download");
  await backup.getByRole("button", { name: "Download full workspace backup" }).click();
  const download = await downloadPromise;
  const contents = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(contents).snapshot).toEqual(saved.snapshot);
  await backup.getByRole("button", { name: "Close backup and restore" }).click();

  await saveServerSnapshot(page, { ...original.snapshot, prompts: [], runs: [], promptRecords: [], discoveryResearch: [] });
  await page.reload();
  await page.getByRole("button", { name: "Backup and restore", exact: true }).click();
  backup = page.getByRole("dialog", { name: "Backup and restore." });
  await backup.getByLabel("Import a full workspace backup").setInputFiles({ name: "research-backup.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  await backup.getByRole("button", { name: "Confirm replace workspace", exact: true }).click();
  await waitForServerSave(page);
  await page.reload();
  const restored = await (await page.request.get("/api/workspace")).json();
  expect(restored.snapshot).toEqual(saved.snapshot);
  await nav(page, "Prompt tracking");
  await expect(page.locator(".prompt-cell")).toContainText(prompt);
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  const discovery = page.getByRole("dialog", { name: "Find your next question." });
  await discovery.locator(".lens-discovery-history summary").click();
  await discovery.getByRole("button", { name: /Research agencies · Research tools/ }).click();
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  expect(paid).toEqual([]);
});
