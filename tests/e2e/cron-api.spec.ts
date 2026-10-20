import { test, expect } from "@playwright/test";

test("hosted cron denies anonymous callers, fake bearer values, and spoofed Vercel headers", async ({ request }) => {
  const cases: Record<string, string>[] = [
    {},
    { authorization: "Bearer undefined" },
    { authorization: "Bearer invalid-private-secret", "user-agent": "vercel-cron/1.0", "x-vercel-cron-schedule": "* * * * *" },
  ];
  for (const headers of cases) {
    const response = await request.get("/api/cron/monitor", { headers });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ error: "Cron authorization is required." });
  }
});
