import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  signIn,
  expectNoHorizontalOverflow,
  PRIMARY_TOKEN,
} from "./support/auth-helpers";

const FORK_URL = "https://github.com/tomcharlesosman/treg-lens/fork";
const REPOSITORY_URL = "https://github.com/tomcharlesosman/treg-lens";

test.describe("Public marketing and navigation", () => {
  test("introduces the product, supported engines, real repository, toolkit, and demo", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Treg Lens/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your brand belongs in the answer\./);
    const navigation = page.getByRole("navigation", { name: "Marketing navigation" });
    for (const [label, hash] of [
      ["How it works", "#how-it-works"],
      ["The workspace", "#the-workspace"],
      ["Open source", "#open-source"],
    ]) {
      await navigation.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(page.locator(hash)).toBeInViewport();
    }
    const engines = page.getByRole("region", { name: "Supported answer engines" });
    for (const name of ["ChatGPT", "Perplexity", "Gemini", "Google AI Mode"])
      await expect(engines.getByText(name, { exact: true })).toBeVisible();

    const forks = page.getByRole("link", { name: /Fork/ });
    expect(await forks.count()).toBeGreaterThan(0);
    for (const fork of await forks.all()) {
      await expect(fork).toHaveAttribute("href", FORK_URL);
      await expect(fork).toHaveAttribute("target", "_blank");
      await expect(fork).toHaveAttribute("rel", /noreferrer/);
    }
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", REPOSITORY_URL);
    await expect(page.getByRole("link", { name: "The AEO toolkit" })).toHaveAttribute("href", "https://treg.to/aeo");
    await expect(page.getByRole("link", { name: "Open your workspace", exact: true }).first()).toHaveAttribute("href", "/login");
    await page.getByRole("link", { name: "Preview sample data", exact: true }).first().click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("DEMO WORKSPACE", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });

  test("all FAQ disclosures expand, collapse, and work with the keyboard", async ({ page }) => {
    await page.goto("/");
    const disclosures = page.locator("details");
    await expect(disclosures).toHaveCount(5);
    for (const disclosure of await disclosures.all()) {
      const summary = disclosure.locator("summary");
      await summary.click();
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(disclosure.locator("p")).toBeVisible();
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(disclosure).not.toHaveAttribute("open", "");
    }
  });

  test("login links, home logo, key acquisition, demo, and fork links resolve correctly", async ({ page }) => {
    await page.goto("/");
    await page.locator(".marketing-nav").getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("link", { name: "Get one from Treg" })).toHaveAttribute("href", "https://treg.to/app");
    await expect(page.getByRole("link", { name: "Fork the repo" })).toHaveAttribute("href", FORK_URL);
    await page.getByRole("link", { name: "Preview sample data", exact: true }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await page.getByRole("link", { name: "Treg Lens home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator(".marketing-nav").getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link", { name: "Treg Lens home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator(".marketing-nav").getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link", { name: "Back to the bigger picture" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("API-key sign-in and encrypted browser session", () => {
  test("keeps deliberate key entry when an earlier session check finishes late", async ({ page }) => {
    expect((await page.request.post("/api/auth/session", { data: { token: PRIMARY_TOKEN } })).ok()).toBe(true);
    let release!: () => void;
    const sessionGate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/auth/session", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await sessionGate;
      await route.fulfill({ status: 200, json: { authenticated: true, workspaceId: "existing-session" } });
    });
    await page.goto("/login");
    const key = page.getByLabel("Treg API key", { exact: true });
    try {
      await key.fill("treg-e2e-secondary");
    } finally {
      const response = page.waitForResponse((response) => response.url().endsWith("/api/auth/session") && response.request().method() === "GET");
      release();
      await response;
    }
    // Cross two paints so the late response has reached the client before submitting.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(key).toBeVisible();
    await expect(key).toHaveValue("treg-e2e-secondary");
    const verification = page.waitForRequest((request) => request.url().endsWith("/api/auth/session") && request.method() === "POST");
    await page.getByRole("button", { name: "Open my workspace" }).click();
    expect((await verification).postDataJSON()).toEqual({ token: "treg-e2e-secondary" });
    await expect(page).toHaveURL(/\/app$/);
  });

  test("waits for client readiness before accepting a key on a slow initial load", async ({ page }) => {
    let release!: () => void;
    const scripts = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/_next/static/chunks/*.js", async (route) => {
      await scripts;
      await route.continue();
    });
    await page.goto("/login", { waitUntil: "commit" });
    const key = page.getByLabel("Treg API key", { exact: true });
    try {
      await expect(key).toBeVisible();
      await expect(key).toBeDisabled();
    } finally {
      release();
    }
    await expect(key).toBeEnabled();
    await key.fill(PRIMARY_TOKEN);
    await page.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
  test("gates the private workspace and keeps an anonymous session empty", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
    const response = await page.request.get("/api/auth/session");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ authenticated: false, workspaceId: null });
    await expect(page.getByRole("button", { name: "Open my workspace" })).toBeDisabled();
    await page.getByLabel("Treg API key", { exact: true }).fill("   ");
    await expect(page.getByRole("button", { name: "Open my workspace" })).toBeDisabled();
  });

  test("reveals and hides the key without submitting, then signs in with whitespace trimmed", async ({ page, context }) => {
    await page.goto("/login");
    const key = page.getByLabel("Treg API key", { exact: true });
    await key.fill(`  ${PRIMARY_TOKEN}  `);
    await expect(key).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show API key" }).click();
    await expect(key).toHaveAttribute("type", "text");
    await expect(key).toHaveValue(`  ${PRIMARY_TOKEN}  `);
    await page.getByRole("button", { name: "Hide API key" }).click();
    await expect(key).toHaveAttribute("type", "password");
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/session") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Open my workspace" }).click();
    const response = await loginResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toEqual({ token: PRIMARY_TOKEN });
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === "treg_lens_session");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(cookie?.value).not.toContain(PRIMARY_TOKEN);
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 11 * 60 * 60);
    const clientState = await page.evaluate(() => ({
      cookie: document.cookie,
      local: { ...localStorage },
      session: { ...sessionStorage },
      html: document.documentElement.outerHTML,
    }));
    expect(JSON.stringify(clientState)).not.toContain(PRIMARY_TOKEN);
    expect(clientState.cookie).not.toContain("treg_lens_session");
    const publicSession = await (await page.request.get("/api/auth/session")).json();
    expect(publicSession.authenticated).toBe(true);
    expect(publicSession.workspaceId).toMatch(/^treg_[a-f0-9]{24}$/);
    expect(publicSession).not.toHaveProperty("token");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app$/);
  });

  const failures = [
    ["treg-e2e-invalid", /invalid, revoked, or does not have access/],
    ["treg-e2e-team", /team-scoped API key/],
    ["treg-e2e-unavailable", /temporarily unavailable/],
    ["treg-e2e-malformed", /unreadable validation response/],
    ["treg-e2e-unexpected", /unexpected validation response/],
    ["bad token", /without spaces or line breaks/],
  ] as const;
  for (const [token, message] of failures) {
    test(`rejects ${token} and recovers when the key is corrected`, async ({ page }) => {
      await page.goto("/login");
      const key = page.getByLabel("Treg API key", { exact: true });
      await key.fill(token);
      await page.getByRole("button", { name: "Open my workspace" }).click();
      await expect(page.locator(".key-signin").getByRole("alert")).toHaveText(message);
      await expect(page).toHaveURL(/\/login$/);
      await expect(key).toBeEnabled();
      await key.fill(PRIMARY_TOKEN);
      await expect(page.locator(".key-signin").getByRole("alert")).toHaveCount(0);
      await key.press("Enter");
      await expect(page).toHaveURL(/\/app$/);
    });
  }

  test("the compact marketing form validates the key and opens the workspace", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByRole("button", { name: "Verify key and open workspace" });
    await expect(submit).toBeDisabled();
    const key = page.getByLabel("YOUR TREG API KEY", { exact: true });
    await key.fill("treg-e2e-invalid");
    await submit.click();
    await expect(page.locator(".key-signin").getByRole("alert")).toHaveText(/invalid, revoked/);
    await key.fill(PRIMARY_TOKEN);
    await submit.click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });

  test("disables key editing and duplicate submissions while verification is in flight", async ({ page }) => {
    await page.goto("/login");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let submissions = 0;
    await page.route("**/api/auth/session", async (route) => {
      if (route.request().method() === "POST") {
        submissions++;
        await gate;
      }
      await route.continue();
    });
    const key = page.getByLabel("Treg API key", { exact: true });
    await key.fill(PRIMARY_TOKEN);
    await page.getByRole("button", { name: "Open my workspace" }).click();
    try {
      await expect(page.getByRole("button", { name: "Verifying your key…" })).toBeDisabled();
      await expect(key).toBeDisabled();
      await expect(page.getByRole("button", { name: "Show API key" })).toBeDisabled();
      expect(submissions).toBe(1);
    } finally {
      release();
    }
    await expect(page).toHaveURL(/\/app$/);
  });

  test("existing sessions offer continue and support switching keys", async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Treg Lens home" }).click();
    await expect(page).toHaveURL(/\/$/);
    const compact = page.locator("#connect");
    await expect(compact.getByText("Your Treg session is ready.")).toBeVisible();
    await expect(compact.getByRole("link", { name: "Open your workspace" })).toHaveAttribute("href", "/app");
    await page.locator(".marketing-nav").getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const form = page.locator(".signin-form-panel");
    await expect(form.getByText("Your Treg session is ready.")).toBeVisible();
    await expect(form.getByRole("link", { name: "Open your workspace" })).toHaveAttribute("href", "/app");
    await form.getByRole("button", { name: "Use a different API key" }).click();
    await expect(form.getByLabel("Treg API key", { exact: true })).toBeVisible();
    await form.getByLabel("Treg API key", { exact: true }).fill("treg-e2e-secondary");
    await form.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });

  test("handles a transient browser connection failure and permits retry", async ({ page }) => {
    await page.goto("/login");
    await page.route("**/api/auth/session", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await page.getByLabel("Treg API key", { exact: true }).fill(PRIMARY_TOKEN);
    await page.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page.locator(".key-signin").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open my workspace" })).toBeEnabled();
    await page.unroute("**/api/auth/session");
    await page.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("clears the cookie on logout, returns home, and re-gates the workspace", async ({ page, context }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("YOUR TREG API KEY", { exact: true })).toBeVisible();
    expect((await context.cookies()).find((cookie) => cookie.name === "treg_lens_session")).toBeUndefined();
    // A new tab shares the cleared cookie jar while allowing the home page's
    // Next.js link prefetches to finish. Hard-navigation during those requests
    // makes WebKit report unload cancellations as uncaught fetch errors.
    const gatedPage = await context.newPage();
    const gateErrors: string[] = [];
    gatedPage.on("pageerror", (error) => gateErrors.push(error.message));
    await gatedPage.goto("/app");
    await expect(gatedPage).toHaveURL(/\/login$/);
    await expect(gatedPage.getByLabel("Treg API key", { exact: true })).toBeVisible();
    expect(gateErrors, "The gated tab must not emit uncaught page errors").toEqual([]);
  });

  test("keeps the active session when logout fails and allows a successful retry", async ({ page }) => {
    await signIn(page);
    await page.route("**/api/auth/session", async (route) => {
      if (route.request().method() === "DELETE") await route.fulfill({ status: 503, json: { error: "Temporary test outage" } });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Could not sign out. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/app$/);
    await page.unroute("**/api/auth/session");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Public demo safeguards", () => {
  function paidRequestsFor(page: Page) {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/aeo\/(run|discover|source)$/.test(request.url()) && request.method() === "POST") requests.push(request.url());
    });
    return requests;
  }
  async function expectSignInWithoutSpending(page: Page, requests: string[]) {
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Treg API key", { exact: true })).toBeEnabled();
    expect(requests).toEqual([]);
  }
  for (const action of ["Connect Treg", "Make it yours", "Settings", "Your workspace", "Treg workspace", "Run an audit"]) {
    test(`demo gate: ${action} requires sign-in without spending`, async ({ page }) => {
      const requests = paidRequestsFor(page);
      await page.goto("/demo");
      const target = action === "Connect Treg"
        ? page.getByRole("link", { name: action })
        : page.getByRole("button", { name: action, exact: !["Your workspace", "Treg workspace"].includes(action) });
      await target.click();
      await expectSignInWithoutSpending(page, requests);
    });
  }
  test("demo gate: prompt discovery requires sign-in without spending", async ({ page }) => {
    const requests = paidRequestsFor(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
    await page.getByRole("button", { name: "Discover prompts", exact: true }).click();
    await expectSignInWithoutSpending(page, requests);
  });
  test("demo gate: source research requires sign-in without spending", async ({ page }) => {
    const requests = paidRequestsFor(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Sources & citations", exact: true }).click();
    await page.getByRole("button", { name: "Research", exact: true }).first().click();
    await expectSignInWithoutSpending(page, requests);
  });
  test("demo gate: prompt recheck requires sign-in without spending", async ({ page }) => {
    const requests = paidRequestsFor(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
    await page.locator("tbody .prompt-cell").first().click();
    await page.getByRole("button", { name: "Recheck prompt", exact: true }).click();
    await expectSignInWithoutSpending(page, requests);
  });
  test("demo gate: activity audit requires sign-in without spending", async ({ page }) => {
    const requests = paidRequestsFor(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Notifications" }).click();
    await page.locator(".notification-popover").getByRole("button", { name: "Run an audit" }).click();
    await expectSignInWithoutSpending(page, requests);
  });

  test("ignores saved private workspaces and never persists demo edits", async ({ page }) => {
    const privateData = JSON.stringify({ project: { brand: "Private Company", domain: "private.invalid", competitors: [] }, prompts: ["Private question"], runs: [], done: [], sourceResearch: {} });
    await page.addInitScript((saved) => {
      localStorage.setItem("treg-lens-workspace-v1", saved);
      localStorage.setItem("treg-lens-workspace-v1:private", saved);
    }, privateData);
    await page.goto("/demo");
    await expect(page.getByText("Private Company", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
    await page.getByRole("button", { name: "Add prompt", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "A good question opens doors." });
    await dialog.getByRole("textbox", { name: "Buyer question" }).fill("Unique transient demo question");
    await dialog.getByRole("button", { name: "Add prompt", exact: true }).click();
    await expect(page.locator(".prompt-cell").filter({ hasText: "Unique transient demo question" })).toBeVisible();
    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(stored).toEqual({ "treg-lens-workspace-v1": privateData, "treg-lens-workspace-v1:private": privateData });
    await page.reload();
    await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
    await expect(page.locator(".prompt-cell").filter({ hasText: "Unique transient demo question" })).toHaveCount(0);
  });

  test("exports clearly labeled illustrative JSON and CSV without keys", async ({ page }) => {
    await page.goto("/demo");
    for (const format of ["JSON", "CSV"]) {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const pendingDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: `Download ${format}`, exact: true }).click();
      const download = await pendingDownload;
      expect(download.suggestedFilename()).toMatch(new RegExp(`^treg-lens-demo-.*\\.${format.toLowerCase()}$`));
      const content = await readFile((await download.path())!, "utf8");
      expect(content).not.toContain(PRIMARY_TOKEN);
      expect(content).not.toContain("treg_lens_session");
      if (format === "JSON") {
        const data = JSON.parse(content);
        expect(data.demo).toBe(true);
        expect(data.runs.length).toBeGreaterThan(0);
        expect(data).not.toHaveProperty("token");
      } else {
        expect(content).toMatch(/"Prompt","Engine"/);
        expect(content.split("\n").length).toBeGreaterThan(2);
      }
    }
  });

  test("native prompt dialogs have a name, trap keyboard focus, close with Escape, and restore focus", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Add prompt", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "A good question opens doors." });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("Responsive public routes", () => {
  for (const width of [320, 390, 768, 1440]) {
    for (const [name, path] of [["marketing", "/"], ["login", "/login"], ["demo", "/demo"]] as const) {
      test(`${name} remains usable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", path === "/login" ? { name: /Let’s bring your brand into focus/ } : { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        if (path === "/") {
          await expect(page.getByLabel("YOUR TREG API KEY", { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Verify key and open workspace" })).toBeVisible();
        } else if (path === "/login") {
          await expect(page.getByLabel("Treg API key", { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Open my workspace" })).toBeVisible();
        } else if (width < 1100) {
          const menu = page.getByRole("button", { name: "Open navigation" });
          if (await menu.isVisible()) {
            await menu.click();
            await page.getByRole("button", { name: "Prompt tracking", exact: true }).click();
            await expect(page.getByRole("heading", { name: "Prompt tracking", exact: true })).toBeVisible();
            await expectNoHorizontalOverflow(page);
          }
        }
      });
    }
  }
});
