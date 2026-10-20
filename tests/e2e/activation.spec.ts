import { test, expect, expectNoHorizontalOverflow } from "./support/auth-helpers";
import { saveServerSnapshot, signIn, storedFixture, waitForServerSave } from "./support/workspace-helpers";
import type { OnboardingResearch } from "../../src/lib/workspace-data";

const receipt: OnboardingResearch = {
  kind: "research", url: "https://treg.to/about", domain: "treg.to", brand: "Treg", description: "A synthetic test profile.",
  audience: "Independent software teams", market: { country: "US", language: "en" },
  competitors: [{ name: "Composio", domain: "composio.dev" }], questions: ["Which toolkit fits a small team?"],
  sources: [{ url: "https://treg.to/about", title: "Original brand profile" }],
  totalCostUsd: 0.005, knownCostUsd: 0.005, costKnown: true, errors: [], callIds: ["synthetic-receipt-one"], completedAt: "2026-10-20T12:00:00.000Z",
};

test("saved buyer context and original research remain available after settings changes and reload", async ({ page }) => {
  await signIn(page);
  const snapshot = storedFixture();
  await saveServerSnapshot(page, { ...snapshot, project: { ...snapshot.project, audience: receipt.audience, market: receipt.market, buyerQuestions: [{ text: "An unselected question worth keeping?", intent: "purchase", provenance: "generated" }], researchReceipts: [receipt], onboardingCompletedAt: receipt.completedAt } });
  await page.reload();
  await page.getByRole("button", { name: "Brand research and sources", exact: true }).click();
  const research = page.getByRole("dialog", { name: "Brand research and sources" });
  await research.locator("summary").click();
  await expect(research.getByRole("link", { name: "Original brand profile" })).toHaveAttribute("href", "https://treg.to/about");
  await expect(research).toContainText("synthetic-receipt-one");
  await research.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Your workspace." });
  await expect(settings.getByLabel("Who are your buyers?", { exact: true })).toHaveValue(receipt.audience!);
  await expect(settings.getByLabel("Measurement coverage")).toContainText("United States / English");
  await settings.getByText("Saved buyer-question ideas", { exact: true }).click();
  await expect(settings).toContainText("An unselected question worth keeping?");
  await settings.getByLabel("Who are your buyers?", { exact: true }).fill("Small SaaS product teams in the UK");
  await settings.getByRole("button", { name: "Save changes" }).click();
  await waitForServerSave(page);
  await page.reload();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.project.audience).toBe("Small SaaS product teams in the UK");
  expect(saved.snapshot.project.market).toEqual({ country: "US", language: "en" });
  expect(saved.snapshot.project.researchReceipts).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Brand research and sources", exact: true })).toBeVisible();
});

test("partial first findings expose exact answer evidence, uncertain costs and phone-safe next actions", async ({ page, browserName }) => {
  await signIn(page);
  const snapshot = storedFixture();
  const answer = snapshot.runs[1].results[1];
  await saveServerSnapshot(page, { ...snapshot, runs: [{ ...snapshot.runs[1], prompts: [answer.prompt], engines: [answer.engine, "gemini"], results: [answer], totalCostKnown: false, errors: [{ prompt: answer.prompt, engine: "gemini", error: "Synthetic interruption" }] }] });
  await page.reload();
  const findings = page.getByRole("region", { name: "Latest audit findings" });
  await expect(findings).toContainText("1 of 2 requested answers collected");
  await expect(findings).toContainText("Missing answers are not evidence");
  await expect(findings).toContainText("final charge is not fully confirmed");
  await expect(findings).toContainText("Composio appeared where Treg did not");
  await findings.getByRole("button", { name: "View answer evidence", exact: true }).first().click();
  const evidence = page.getByRole("dialog", { name: "Answer evidence", exact: true });
  await expect(evidence).toContainText(answer.prompt);
  await expect(evidence).toContainText("Alternative tools");
  await expect(evidence).toContainText("Model API");
  await evidence.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(findings.getByRole("button", { name: "Review this audit" })).toBeVisible();
  if (browserName === "chromium") await page.screenshot({ path: "output/playwright/activation-findings-phone.png", fullPage: true });
  await findings.getByRole("button", { name: "Review this audit" }).click();
  await expect(page.getByRole("dialog", { name: "Treg visibility audit", exact: true })).toContainText("Synthetic interruption");
});
