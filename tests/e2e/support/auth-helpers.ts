import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";

export const PRIMARY_TOKEN = "treg-e2e-primary";
export const SECONDARY_TOKEN = "treg-e2e-secondary";

// WebKit logs a fetch that starts after a reload or navigation has begun as
// "Fetch API cannot load <url> due to access control checks.", and Playwright
// reports that console error as a page error. Next.js schedules RSC prefetches
// (?_rsc=) for visible links on its own, so tests cannot wait for them before
// navigating. Only that same-origin prefetch is ignored; application fetches
// stay strict (call waitForServerSave after an edit before navigating).
export function isAbandonedWebKitPrefetch(error: Error, browserName: string, baseURL: string | undefined) {
  if (browserName !== "webkit" || !baseURL) return false;
  const prefix = `Fetch API cannot load ${new URL(baseURL).origin}/`;
  // Playwright splits the console text at its first colon, after "https".
  const text = `${error.name}:/${error.message}`;
  return text.startsWith(prefix) && /^[^\s?#]*\?_rsc=[\w-]+ due to access control checks\.$/.test(text.slice(prefix.length));
}

export const test = base.extend<{ isolatedAddress: void; browserErrors: void }>({
  isolatedAddress: [
    async ({ context }, use) => {
      // The application throttles sign-in by forwarded address. Each browser
      // test owns an address so parallel suites cannot exhaust one another.
      await context.setExtraHTTPHeaders({
        "x-forwarded-for": `e2e-${randomUUID()}`,
      });
      await use();
    },
    { auto: true },
  ],
  browserErrors: [
    async ({ page, browserName, baseURL }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => { if (!isAbandonedWebKitPrefetch(error, browserName, baseURL)) errors.push(error.message); });
      await use();
      expect(errors, "The browser must not emit uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function signIn(page: Page, token = PRIMARY_TOKEN) {
  await page.goto("/login");
  await page.getByLabel("Treg API key", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.width + 1);
}
