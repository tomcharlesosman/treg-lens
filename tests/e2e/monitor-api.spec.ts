import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const input = {
  enabled: true,
  intervalHours: 24,
  hourUtc: 3,
  perRunBudgetUsd: 0.05,
  monthlyBudgetUsd: 1,
  config: {
    brand: "Treg",
    domain: "treg.to",
    competitors: ["Composio"],
    prompts: ["Which AI visibility toolkit should I choose?"],
    engines: ["chatgpt"],
  },
};

async function body(response: APIResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const value = await response.json();
  expect(JSON.stringify(value)).not.toMatch(/PRIVATE-UPSTREAM-DETAIL|operator-key-must-not-be-used/);
  return value;
}
async function login(request: APIRequestContext, token = `treg-e2e-monitor-${randomUUID()}`) {
  const response = await request.post("/api/auth/session", {
    data: { token },
    headers: { "x-forwarded-for": `monitor-test-${randomUUID()}` },
  });
  const session = await body(response);
  expect(session.authenticated).toBe(true);
  return { token, cookie: response.headers()["set-cookie"].split(";")[0], workspaceId: session.workspaceId };
}

test("health reports durable storage readiness without authentication or tenant details", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", storage: "ready" });
});

test("monitoring requires a verified session and the internal runner rejects user credentials", async ({ request }) => {
  await body(await request.get("/api/monitor"), 401);
  await body(await request.put("/api/monitor", { data: input }), 401);
  await body(await request.delete("/api/monitor"), 401);
  await body(await request.post("/api/internal/monitor/tick"), 401);
  const session = await login(request);
  await body(await request.post("/api/internal/monitor/tick", { headers: { cookie: session.cookie } }), 401);
  await body(await request.post("/api/internal/monitor/tick", { headers: { authorization: `Bearer ${session.token}` } }), 401);
  await body(await request.post("/api/internal/monitor/tick", { headers: { authorization: "Bearer invalid-runner" } }), 401);
});

test("schedule configuration persists, is isolated per key, and never returns retained credentials", async ({ request }) => {
  const first = await login(request);
  const original = await body(await request.get("/api/monitor", { headers: { cookie: first.cookie } }));
  expect(original.schedule).toBeNull();
  expect(typeof original.worker.healthy).toBe("boolean");
  const configured = await body(await request.put("/api/monitor", { headers: { cookie: first.cookie }, data: input }));
  expect(configured.schedule).toMatchObject(input);
  expect(configured.schedule.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T03:00:00\.000Z$/);
  expect(Date.parse(configured.schedule.nextRunAt)).toBeGreaterThan(Date.now() - 1000);
  expect(configured.schedule.lastStatus).toBe("scheduled");
  expect(configured.schedule.spentMonthUsd).toBe(0);
  expect(JSON.stringify(configured)).not.toContain(first.token);
  expect(configured.schedule).not.toHaveProperty("credential");
  expect(configured.schedule.config).not.toHaveProperty("token");
  const second = await login(request);
  expect(second.workspaceId).not.toBe(first.workspaceId);
  expect((await body(await request.get("/api/monitor", { headers: { cookie: second.cookie } }))).schedule).toBeNull();
  const retained = await body(await request.get("/api/monitor", { headers: { cookie: first.cookie } }));
  expect(retained.schedule).toEqual(configured.schedule);
  const paused = await body(await request.delete("/api/monitor", { headers: { cookie: first.cookie } }));
  expect(paused.schedule).toMatchObject({ enabled: false, nextRunAt: null, lastStatus: "paused", spentMonthUsd: 0 });
  expect(JSON.stringify(paused)).not.toContain(first.token);
});

test("daily monitoring can be deliberately changed to weekly and paused through PUT", async ({ request }) => {
  const session = await login(request);
  await body(await request.put("/api/monitor", { headers: { cookie: session.cookie }, data: input }));
  const weekly = { ...input, intervalHours: 168, hourUtc: 21, perRunBudgetUsd: 0.02, monthlyBudgetUsd: 0.1 };
  const updated = await body(await request.put("/api/monitor", { headers: { cookie: session.cookie }, data: weekly }));
  expect(updated.schedule).toMatchObject(weekly);
  expect(updated.schedule.nextRunAt).toMatch(/T21:00:00\.000Z$/);
  const paused = await body(await request.put("/api/monitor", { headers: { cookie: session.cookie }, data: { ...weekly, enabled: false } }));
  expect(paused.schedule).toMatchObject({ ...weekly, enabled: false, nextRunAt: null, lastStatus: "paused" });
  const read = await body(await request.get("/api/monitor", { headers: { cookie: session.cookie } }));
  expect(read.schedule).toEqual(paused.schedule);
});

for (const [name, change] of [
  ["non-boolean consent", { enabled: "yes" }],
  ["unsupported frequency", { intervalHours: 1 }],
  ["invalid UTC hour", { hourUtc: 24 }],
  ["fractional UTC hour", { hourUtc: 3.5 }],
  ["zero run budget", { perRunBudgetUsd: 0 }],
  ["run budget above one dollar", { perRunBudgetUsd: 1.01 }],
  ["monthly budget below run ceiling", { monthlyBudgetUsd: 0.01 }],
  ["monthly budget above maximum", { monthlyBudgetUsd: 1000.01 }],
  ["empty prompt set", { config: { ...input.config, prompts: [] } }],
  ["more than eight prompts", { config: { ...input.config, prompts: Array.from({ length: 9 }, (_, index) => `Question ${index}?`) } }],
  ["unknown engine", { config: { ...input.config, engines: ["unknown"] } }],
] as const) {
  test(`monitoring refuses ${name} without creating a schedule`, async ({ request }) => {
    const session = await login(request);
    const rejected = await body(await request.put("/api/monitor", { headers: { cookie: session.cookie }, data: { ...input, ...change } }), 400);
    expect(typeof rejected.error).toBe("string");
    expect((await body(await request.get("/api/monitor", { headers: { cookie: session.cookie } }))).schedule).toBeNull();
  });
}

test("monitoring mutations enforce origin, JSON, body size, and supported methods", async ({ request }) => {
  const session = await login(request);
  const headers = { cookie: session.cookie };
  await body(await request.put("/api/monitor", { headers: { ...headers, origin: "https://untrusted.example" }, data: input }), 403);
  await body(await request.delete("/api/monitor", { headers: { ...headers, origin: "https://untrusted.example" } }), 403);
  await body(await request.put("/api/monitor", { headers: { ...headers, "content-type": "text/plain" }, data: JSON.stringify(input) }), 415);
  await body(await request.put("/api/monitor", { headers: { ...headers, "content-type": "application/json" }, data: "{broken" }), 400);
  await body(await request.put("/api/monitor", { headers, data: { ...input, oversized: "x".repeat(17_000) } }), 413);
  expect((await request.post("/api/monitor", { headers, data: input })).status()).toBe(405);
  expect((await request.get("/api/internal/monitor/tick")).status()).toBe(405);
  expect((await body(await request.get("/api/monitor", { headers }))).schedule).toBeNull();
});

