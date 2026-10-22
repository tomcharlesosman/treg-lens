import { expect, type BrowserContext, type Page } from "@playwright/test";
import { DEFAULT_PROJECT, DEFAULT_PROMPTS, type SavedRun } from "../../../src/lib/workspace-data";
import type { AnswerResult, Engine } from "../../../src/lib/aeo";

export const primaryKey = "treg-e2e-primary";
export const secondaryKey = "treg-e2e-secondary";
export const trackedPrompt = DEFAULT_PROMPTS[0];
export const missingPrompt = DEFAULT_PROMPTS[1];
export const storagePrefix = "treg-lens-workspace-v1:";

export async function freshAddress(context: BrowserContext) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-${crypto.randomUUID()}` });
}

const contextKeys = new WeakMap<BrowserContext, { primary: string; secondary: string }>();
export function contextKey(context: BrowserContext, token = primaryKey) {
  let keys = contextKeys.get(context);
  if (!keys) { keys = { primary: `${primaryKey}-${crypto.randomUUID()}`, secondary: `${secondaryKey}-${crypto.randomUUID()}` }; contextKeys.set(context, keys); }
  return token === primaryKey ? keys.primary : token === secondaryKey ? keys.secondary : token;
}
// Call before reloading or navigating after an edit. A pending 700ms autosave
// that fires while a navigation is in progress makes WebKit report the blocked
// fetch ("Fetch API cannot load … due to access control checks") as a page error.
export async function waitForServerSave(page: Page) {
  await expect(page.getByRole("region", { name: "Workspace synchronization" })).toContainText("Saved to server");
}
export async function saveServerSnapshot(page: Page, snapshot: unknown) {
  const existing = await (await page.request.get("/api/workspace")).json();
  const response = await page.request.put("/api/workspace", { data: { snapshot, revision: existing.revision } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
export async function signIn(page: Page, token = primaryKey) {
  token = contextKey(page.context(), token);
  await freshAddress(page.context());
  const response = await page.request.post("/api/auth/session", { data: { token } });
  expect(response.status()).toBe(200);
  const session = await response.json();
  expect(session.authenticated).toBe(true);
  // These tests exercise an established workspace; first-run setup has its own browser suite.
  const existing = await (await page.request.get("/api/workspace")).json();
  if (!existing.snapshot) {
    await saveServerSnapshot(page, {
      project: { ...DEFAULT_PROJECT, onboardingCompletedAt: "2026-10-20T12:00:00.000Z" },
      prompts: DEFAULT_PROMPTS, runs: [], done: [], sourceResearch: {},
    });
  }
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((prefix) => Object.keys(localStorage).some((key) => key.startsWith(prefix)), storagePrefix)).toBe(true);
  return `${storagePrefix}${session.workspaceId}`;
}

export function storedFixture() {
  const make = (id: string, prompt: string, engine: Engine, present: boolean, completedAt: string): AnswerResult => ({
    id,
    prompt,
    engine,
    answer: present
      ? `# Verified comparison\n\n1. **Treg** connects useful tools.\n2. **Composio** is an alternative.\n\n[Read the evidence](https://example.com/research).\n\n| Toolkit | Fit |\n| --- | --- |\n| Treg | Data |\n\n<script>window.__unsafeAnswerExecuted = true</script>\n[Unsafe route](javascript:alert(1))\n![Remote tracking image](https://example.com/tracker.png)`
      : "# Alternative tools\n\n1. **Composio** offers integrations.\n2. **Firecrawl** provides crawling.\n\n[Research](https://example.com/research)",
    citations: [
      { url: "https://example.com/research", title: "AI toolkit research", domain: "example.com" },
      ...(present ? [{ url: "https://treg.to/docs", title: "Treg documentation", domain: "treg.to" }] : []),
    ],
    mentionedBrands: present ? ["Treg", "Composio"] : ["Composio", "Firecrawl"],
    brandMentioned: present,
    position: present ? 1 : null,
    costUsd: 0.002,
    costKnown: true,
    completedAt,
    sourceKind: engine === "perplexity" ? "model-api" : "web-interface",
  });
  const run = (id: string, completedAt: string, results: AnswerResult[]): SavedRun => ({
    id,
    ...DEFAULT_PROJECT,
    prompts: [trackedPrompt, missingPrompt],
    engines: results.map((result) => result.engine),
    results,
    errors: [],
    totalCostUsd: results.length * 0.002,
    totalCostKnown: true,
    completedAt,
  });
  return {
    project: DEFAULT_PROJECT,
    prompts: DEFAULT_PROMPTS,
    runs: [
      run("earlier-run", "2026-10-10T12:00:00.000Z", [
        make("earlier-google", trackedPrompt, "google", true, "2026-10-10T12:00:00.000Z"),
        make("earlier-gemini", missingPrompt, "gemini", false, "2026-10-10T12:00:00.000Z"),
      ]),
      run("latest-run", "2026-10-19T12:00:00.000Z", [
        make("latest-chatgpt", trackedPrompt, "chatgpt", true, "2026-10-19T12:00:00.000Z"),
        make("latest-perplexity", missingPrompt, "perplexity", false, "2026-10-19T12:00:00.000Z"),
      ]),
    ],
    done: [] as string[],
    sourceResearch: {},
  };
}

export async function seedWorkspace(page: Page) {
  const storageKey = await signIn(page);
  await saveServerSnapshot(page, storedFixture());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comparable visibility trends" })).toBeVisible();
  return storageKey;
}

export async function nav(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: name === "Opportunities" ? /^Opportunities(?:\s|$)/ : name, exact: name !== "Opportunities" }).click();
}

export async function openAudit(page: Page, prompt: string, allEngines = false) {
  await page.getByRole("button", { name: "Run an audit", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "See where you stand." });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Prompts to track").fill(prompt);
  if (allEngines) {
    await dialog.getByRole("button", { name: /Gemini/ }).click();
    await dialog.getByRole("button", { name: /Google AI Mode/ }).click();
  }
  await expect(dialog.getByRole("button", { name: "Run visibility audit" })).toBeEnabled();
  return dialog;
}
