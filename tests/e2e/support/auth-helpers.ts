import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";

export const PRIMARY_TOKEN = "treg-e2e-primary";
export const SECONDARY_TOKEN = "treg-e2e-secondary";

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
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
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
