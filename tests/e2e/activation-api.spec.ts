import { test, expect } from "@playwright/test";

test("audit approval rejects unsupported markets and fresh prices above the accepted estimate", async ({ request }) => {
  const input = { brand: "Treg", domain: "treg.to", competitors: [], prompts: ["Which toolkit fits?"], engines: ["chatgpt"], token: "treg-e2e-activation-" + crypto.randomUUID() };
  const market = await request.post("/api/aeo/run", { data: { ...input, market: { country: "GB", language: "en" } } });
  expect(market.status()).toBe(400);
  expect(await market.text()).toContain("United States / English");
  const increased = await request.post("/api/aeo/run", { headers: { "x-forwarded-for": "ceiling-" + crypto.randomUUID() }, data: { ...input, market: { country: "US", language: "en" }, maxCostUsd: 0.000001 } });
  expect(increased.status()).toBe(409);
  expect(await increased.text()).toContain("No paid calls were made");
});
