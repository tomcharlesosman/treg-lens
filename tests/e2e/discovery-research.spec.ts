import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { nav, saveServerSnapshot, signIn, waitForServerSave } from "./support/workspace-helpers";

async function openDiscovery(page: Page) {
  await nav(page, "Prompt tracking");
  await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
  return page.getByRole("dialog", { name: "Find your next question." });
}
function observeDiscovery(page: Page) {
  const paid: unknown[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/aeo/discover" && request.method() === "POST" && !request.postDataJSON().estimateOnly) paid.push(request.postDataJSON());
  });
  return paid;
}

test("discovery uses reviewed business context, saves unused research and reopens it without another paid request", async ({ page }) => {
  await signIn(page);
  const existing = await (await page.request.get("/api/workspace")).json();
  await saveServerSnapshot(page, { ...existing.snapshot, project: { ...existing.snapshot.project, brand: "Gentle Dental", domain: "gentledental.example", description: "Dental care for nervous patients. Local appointments.", audience: "Adults considering dental implants", buyerQuestions: [{ text: "Which dentist treats nervous patients?", intent: "use-case", provenance: "manual" }, { text: "What does a dental implant cost?", intent: "purchase", provenance: "generated" }] } });
  await page.reload();
  const paid = observeDiscovery(page);
  let discovery = await openDiscovery(page);
  await expect(discovery.getByLabel("Seed keyword 1")).toHaveValue("Which dentist treats nervous patients?");
  await expect(discovery.getByLabel("Seed keyword 2")).toHaveValue("What does a dental implant cost?");
  expect(paid).toHaveLength(0);
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.discoveryResearch).toHaveLength(1);
  const original = saved.snapshot.discoveryResearch[0];
  expect(original.input).toMatchObject({ brand: "Gentle Dental", domain: "gentledental.example", seeds: ["Which dentist treats nervous patients?", "What does a dental implant cost?"] });
  expect(original.selectedCandidateIds).toEqual([]);
  expect(original.result.candidates.length).toBeGreaterThan(0);
  expect(original.result.candidates.filter((candidate: { kind: string }) => candidate.kind === "question").every((candidate: { searchVolume: number | null }) => candidate.searchVolume === null)).toBe(true);
  expect(paid).toHaveLength(1);
  await discovery.getByRole("button", { name: "Close prompt discovery" }).click();
  await waitForServerSave(page);
  await page.reload();
  discovery = await openDiscovery(page);
  await discovery.locator(".lens-discovery-history summary").click();
  await discovery.getByRole("button", { name: /Which dentist treats nervous patients\?.*What does a dental implant cost\?/ }).click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true");
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  expect(paid).toHaveLength(1);
  const downloadPromise = page.waitForEvent("download");
  await discovery.getByRole("button", { name: "Download research", exact: true }).click();
  const downloaded = await downloadPromise;
  expect(JSON.parse(await readFile((await downloaded.path())!, "utf8"))).toEqual(original);
  await discovery.getByRole("button", { name: "Add 3 prompts", exact: true }).click();
  await expect(discovery).toBeHidden();
  const imported = await (await page.request.get("/api/workspace")).json();
  expect(imported.snapshot.discoveryResearch[0].id).toBe(original.id);
  expect(imported.snapshot.discoveryResearch[0].selectedCandidateIds).toHaveLength(3);
  expect(imported.snapshot.discoveryResearch[0].result).toEqual(original.result);
  expect(imported.snapshot.prompts).toEqual(expect.arrayContaining(existing.snapshot.prompts));
  expect(paid).toHaveLength(1);
});

test("discovery without business context asks for relevant seeds and blocked recovery storage prevents paid submission", async ({ page }) => {
  await signIn(page);
  const paid = observeDiscovery(page);
  const discovery = await openDiscovery(page);
  await expect(discovery.getByLabel("Seed keyword 1")).toHaveValue("");
  await expect(discovery.getByLabel("Seed keyword 2")).toHaveValue("");
  const launch = discovery.getByRole("button", { name: "Discover prompts", exact: true });
  await expect(launch).toBeDisabled();
  await discovery.getByLabel("Seed keyword 1").fill("commuter bicycles");
  await discovery.getByLabel("Seed keyword 2").fill("bicycle servicing");
  await expect(launch).toBeEnabled();
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(":discovery:v1")) throw new DOMException("Fixture storage blocked", "QuotaExceededError");
      return native.call(this, key, value);
    };
  });
  await launch.click();
  await expect(discovery.getByRole("alert")).toContainText("Browser recovery storage is unavailable");
  expect(paid).toHaveLength(0);
});

test("partial discovery retains known and unknown charges, call IDs and original candidate provenance", async ({ page }) => {
  await signIn(page);
  const discovery = await openDiscovery(page);
  await discovery.getByLabel("Seed keyword 1").fill("[unknown-cost] dental care");
  await discovery.getByLabel("Seed keyword 2").fill("[partial] implant prices");
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  await expect(discovery).toContainText("Some final charges were not returned");
  await discovery.getByText("1 lookup did not finish").click();
  await expect(discovery).toContainText("The discovery provider is temporarily unavailable");
  const snapshot = (await (await page.request.get("/api/workspace")).json()).snapshot;
  const receipt = snapshot.discoveryResearch[0];
  expect(receipt.result.totalCostKnown).toBe(false);
  expect(receipt.result.errors).toHaveLength(1);
  expect(receipt.result.callIds.length).toBeGreaterThan(0);
  expect(receipt.result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "keyword", origin: "Keyword idea", provider: "anyapi", seed: "[unknown-cost] dental care", searchVolume: 1200 }), expect.objectContaining({ kind: "question", origin: "People Also Ask", provider: "cloro", searchVolume: null })]));
  expect(JSON.stringify(receipt)).not.toContain("treg-e2e-primary");
});

test("a lost discovery response keeps the server receipt and reload never repeats the paid request", async ({ page }) => {
  await signIn(page);
  const paid = observeDiscovery(page);
  await page.route("**/api/aeo/discover", async (route) => {
    if (route.request().postDataJSON()?.estimateOnly) return route.continue();
    // Execute the real route, including its durable append, then lose only delivery.
    await route.fetch();
    await route.abort("failed");
  });
  let discovery = await openDiscovery(page);
  await discovery.getByLabel("Seed keyword 1").fill("commuter bicycles");
  await discovery.getByLabel("Seed keyword 2").fill("bicycle servicing");
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect(discovery.getByText("Review interrupted research", { exact: true })).toBeVisible();
  expect(paid).toHaveLength(1);
  expect((await (await page.request.get("/api/workspace")).json()).snapshot.discoveryResearch).toHaveLength(1);
  await page.reload();
  discovery = await openDiscovery(page);
  await expect(discovery.getByText("Review interrupted research", { exact: true })).toBeVisible();
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeDisabled();
  expect(paid).toHaveLength(1);
  await discovery.locator(".lens-discovery-history summary").click();
  await discovery.getByRole("button", { name: /commuter bicycles · bicycle servicing/ }).click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toBeVisible();
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  expect(paid).toHaveLength(1);
});

test("viewing and importing old research cannot clear an unrelated interrupted discovery", async ({ page }) => {
  const storageKey = await signIn(page);
  const paid = observeDiscovery(page);
  let discovery = await openDiscovery(page);
  await discovery.getByLabel("Seed keyword 1").fill("commuter bicycles");
  await discovery.getByLabel("Seed keyword 2").fill("bicycle servicing");
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  await discovery.getByRole("button", { name: "Discover prompts", exact: true }).click();
  await expect(discovery.getByRole("status")).toContainText("Original research saved to your workspace.");
  await discovery.getByRole("button", { name: "Close prompt discovery" }).click();
  const original = (await (await page.request.get("/api/workspace")).json()).snapshot.discoveryResearch[0];
  const pending = { pending: true, startedAt: new Date().toISOString(), input: { brand: "Treg", domain: "treg.to", seeds: ["unrelated interrupted seed", "another interrupted category"] }, estimate: original.estimate };
  await page.evaluate(({ key, pending }) => localStorage.setItem(`${key}:discovery:v1`, JSON.stringify(pending)), { key: storageKey, pending });
  await page.reload();
  discovery = await openDiscovery(page);
  await expect(discovery.getByText("Review interrupted research", { exact: true })).toBeVisible();
  await discovery.locator(".lens-discovery-history summary").click();
  await discovery.getByRole("button", { name: /commuter bicycles · bicycle servicing/ }).click();
  await expect(discovery.getByRole("tab", { name: /^Questions/ })).toBeVisible();
  await discovery.getByRole("button", { name: "Try different seeds", exact: true }).click();
  await expect(discovery.getByText("Review interrupted research", { exact: true })).toBeVisible();
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:discovery:v1`)!).pending, storageKey)).toBe(true);

  // Importing already purchased evidence is safe, but cannot approve a retry.
  await discovery.getByRole("button", { name: /commuter bicycles · bicycle servicing/ }).click();
  await discovery.getByRole("button", { name: "Add 3 prompts", exact: true }).click();
  await expect(discovery).toBeHidden();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:discovery:v1`)!).pending, storageKey)).toBe(true);
  discovery = await openDiscovery(page);
  await expect(discovery.getByText("Review interrupted research", { exact: true })).toBeVisible();
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeDisabled();
  expect(paid).toHaveLength(1);
  await discovery.getByRole("button", { name: "I checked Treg activity — start new research", exact: true }).click();
  await discovery.getByLabel("Seed keyword 1").fill("fresh bicycle research");
  await discovery.getByLabel("Seed keyword 2").fill("fresh servicing research");
  await expect(discovery.getByRole("button", { name: "Discover prompts", exact: true })).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:discovery:v1`), storageKey)).toBeNull();
  expect(paid).toHaveLength(1);
});
