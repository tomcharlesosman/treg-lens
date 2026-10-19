import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: "output/playwright/results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
    ["json", { outputFile: "output/playwright/results.json" }],
  ],
  use: {
    baseURL: "https://127.0.0.1:3100",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
    actionTimeout: 10_000,
  },
  projects: [
    { name: "api", testMatch: "*api.spec.ts" },
    {
      name: "chromium",
      testIgnore: "*api.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: "*api.spec.ts",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: "*api.spec.ts",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "node ./tests/e2e/support/start-server.mjs",
    url: "https://127.0.0.1:3100",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: "production",
      SESSION_SECRET: "treg-lens-e2e-only-secret-never-use-in-production-2026",
      TREG_TOKEN: "operator-key-must-not-be-used",
      TREG_ORG: "",
    },
  },
});
