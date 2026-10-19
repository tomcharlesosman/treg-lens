import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, expect, type APIRequestContext } from "@playwright/test";

// Public synthetic test configuration, not a deployment credential.
const runner = createHmac("sha256", "treg-lens-e2e-only-secret-never-use-in-production-2026")
  .update("treg-lens-monitor-runner:v1").digest("hex");
const configuration = {
  enabled: true, intervalHours: 24, hourUtc: 7, perRunBudgetUsd: 0.05, monthlyBudgetUsd: 1,
  config: { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Which AI toolkit?"], engines: ["chatgpt"] },
};
type User = { token: string; cookie: string; workspaceId: string };

async function login(request: APIRequestContext, token = `treg-e2e-worker-${randomUUID()}`): Promise<User> {
  const response = await request.post("/api/auth/session", { data: { token }, headers: { "x-forwarded-for": randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  const session = await response.json();
  return { token, cookie: response.headers()["set-cookie"].split(";")[0], workspaceId: session.workspaceId };
}
async function configure(request: APIRequestContext, user: User, value = configuration) {
  const response = await request.put("/api/monitor", { data: value, headers: { cookie: user.cookie } });
  expect(response.status(), await response.text()).toBe(200);
}
function database<T>(callback: (db: DatabaseSync) => T): T {
  const info = JSON.parse(readFileSync(resolve("output/playwright/server-info.json"), "utf8"));
  const directory = resolve(info.dataDirectory);
  // Never modify a live application's database if this file is missing/stale.
  expect(directory.startsWith(`${resolve(tmpdir())}${sep}treg-lens-e2e-`)).toBe(true);
  const db = new DatabaseSync(join(directory, "treg-lens.sqlite"));
  db.exec("PRAGMA busy_timeout=5000");
  try { return callback(db); } finally { db.close(); }
}
function due(user: User) {
  expect(user.workspaceId).toMatch(/^treg_[a-f\d]{24}$/);
  const previous = new Date();
  previous.setUTCHours(configuration.hourUtc, 0, 0, 0);
  if (previous.getTime() >= Date.now()) previous.setUTCDate(previous.getUTCDate() - 1);
  database((db) => {
    const changed = db.prepare("UPDATE monitor_schedules SET next_run_at=? WHERE workspace_id=?").run(previous.toISOString(), user.workspaceId);
    expect(Number(changed.changes)).toBe(1);
  });
  return previous;
}
async function tick(request: APIRequestContext) {
  const response = await request.post("/api/internal/monitor/tick", { headers: { authorization: `Bearer ${runner}` } });
  expect(response.status(), await response.text()).toBe(200);
}
async function settled(request: APIRequestContext, user: User, status: string) {
  // Another concurrent test's authorized heartbeat may claim our due job.
  // Pump and inspect this owner only; the production lease prevents duplicates.
  await expect.poll(async () => {
    await tick(request);
    const response = await request.get("/api/monitor", { headers: { cookie: user.cookie } });
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()).schedule.lastStatus;
  }, { timeout: 15_000 }).toBe(status);
  return (await (await request.get("/api/monitor", { headers: { cookie: user.cookie } })).json()).schedule;
}
async function workspace(request: APIRequestContext, user: User) {
  const response = await request.get("/api/workspace", { headers: { cookie: user.cookie } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
function jobs(user: User) {
  return database((db) => db.prepare("SELECT status,reserved_micro,charged_micro,result_json FROM monitor_jobs WHERE workspace_id=? ORDER BY started_at,id").all(user.workspaceId));
}

test("a due weekly monitor executes all real adapters, saves evidence, and preserves its chosen UTC slot", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, intervalHours: 168, config: { ...configuration.config, engines: ["chatgpt", "perplexity", "gemini", "google"] } });
  const prior = due(user);
  const schedule = await settled(request, user, "complete");
  expect(schedule).toMatchObject({ enabled: true, spentMonthUsd: 0.008, lastError: null });
  expect(schedule.nextRunAt).toBe(new Date(prior.getTime() + 168 * 3_600_000).toISOString());
  expect(new Date(schedule.nextRunAt).getUTCHours()).toBe(7);
  const saved = await workspace(request, user);
  expect(saved.snapshot.runs).toHaveLength(1);
  const run = saved.snapshot.runs[0];
  expect(run).toMatchObject({ id: expect.stringMatching(/^monitor-/), brand: "Treg", totalCostUsd: 0.008, totalCostKnown: true, errors: [] });
  expect(run.results).toHaveLength(4);
  expect(run.results.every((answer: { brandMentioned: boolean }) => answer.brandMentioned)).toBe(true);
  expect(jobs(user)).toHaveLength(1);
  expect(jobs(user)[0]).toMatchObject({ status: "complete", reserved_micro: 8000, charged_micro: 8000 });
  expect(JSON.stringify(saved)).not.toContain(user.token);
});

test("unknown scheduled charges pause and retain the full reservation with the answer", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, config: { ...configuration.config, prompts: ["Compare tools [unknown-cost]"] } });
  due(user);
  const schedule = await settled(request, user, "unsettled");
  expect(schedule).toMatchObject({ enabled: false, nextRunAt: null, spentMonthUsd: 0.002 });
  expect(schedule.lastError).toMatch(/unsettled|reservation/i);
  const saved = await workspace(request, user);
  expect(saved.snapshot.runs[0]).toMatchObject({ totalCostKnown: false, totalCostUsd: 0 });
  expect(saved.snapshot.runs[0].results).toHaveLength(1);
  expect(jobs(user)[0]).toMatchObject({ status: "unsettled", reserved_micro: 2000, charged_micro: null });
  await tick(request);
  expect(jobs(user)).toHaveLength(1);
});

test("partial scheduled runs keep successful answers, settle known charges, and pause", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, config: { ...configuration.config, prompts: ["Compare tools [partial]"], engines: ["chatgpt", "gemini"] } });
  due(user);
  const schedule = await settled(request, user, "partial");
  expect(schedule).toMatchObject({ enabled: false, nextRunAt: null, spentMonthUsd: 0.002 });
  const saved = await workspace(request, user);
  expect(saved.snapshot.runs[0].results).toHaveLength(1);
  expect(saved.snapshot.runs[0].errors).toHaveLength(1);
  expect(jobs(user)[0]).toMatchObject({ status: "partial", reserved_micro: 4000, charged_micro: 2000 });
});

test("revocation after configuration prevents provider calls and pauses the retained schedule", async ({ request }) => {
  const user = await login(request, `treg-e2e-worker-revoked-${randomUUID()}`);
  await configure(request, user);
  due(user);
  await expect.poll(async () => {
    await tick(request);
    return database((db) => db.prepare("SELECT last_status FROM monitor_schedules WHERE workspace_id=?").get(user.workspaceId)?.last_status);
  }, { timeout: 15_000 }).toBe("error");
  expect(jobs(user)).toHaveLength(1);
  expect(jobs(user)[0]).toMatchObject({ status: "error", reserved_micro: 0, charged_micro: 0, result_json: null });
  const row = database((db) => db.prepare("SELECT enabled,credential,next_run_at FROM monitor_schedules WHERE workspace_id=?").get(user.workspaceId));
  expect(row).toMatchObject({ enabled: 0, credential: null, next_run_at: null });
  expect((await request.get("/api/monitor", { headers: { cookie: user.cookie } })).status()).toBe(401);
});

test("a fresh quote above the per-audit ceiling is refused before any provider result", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, perRunBudgetUsd: 0.001 });
  due(user);
  const schedule = await settled(request, user, "budget-paused");
  expect(schedule).toMatchObject({ enabled: false, spentMonthUsd: 0 });
  expect(schedule.lastError).toMatch(/per-audit budget/);
  expect(jobs(user)[0]).toMatchObject({ reserved_micro: 0, charged_micro: 0, result_json: null });
  expect((await workspace(request, user)).snapshot).toBeNull();
});

test("monthly accounting prevents another paid run after the remaining budget is insufficient", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, perRunBudgetUsd: 0.002, monthlyBudgetUsd: 0.003 });
  due(user);
  await settled(request, user, "complete");
  due(user);
  const schedule = await settled(request, user, "budget-paused");
  expect(schedule).toMatchObject({ enabled: false, spentMonthUsd: 0.002 });
  expect(schedule.lastError).toMatch(/monthly monitoring budget/);
  expect((await workspace(request, user)).snapshot.runs).toHaveLength(1);
  const attempts = jobs(user);
  expect(attempts).toHaveLength(2);
  expect(attempts.find((job) => job.status === "error")).toMatchObject({ reserved_micro: 0, charged_micro: 0, result_json: null });
});

test("a completed scheduled audit can be recovered privately when the workspace is full", async ({ request }) => {
  const user = await login(request);
  const full = { project: { brand: "Treg", domain: "treg.to", competitors: [] }, prompts: ["x".repeat(8 * 1024 * 1024 - 256)], runs: [], done: [], sourceResearch: {} };
  const saved = await request.put("/api/workspace", { data: { snapshot: full, revision: 0 }, headers: { cookie: user.cookie } });
  expect(saved.status(), await saved.text()).toBe(200);
  await configure(request, user);
  due(user);
  const schedule = await settled(request, user, "storage-error");
  expect(schedule).toMatchObject({ enabled: false, spentMonthUsd: 0.002, recoveryAudit: { url: "/api/monitor/results" } });
  const response = await request.get("/api/monitor/results", { headers: { cookie: user.cookie } });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const recovered = await response.json();
  expect(recovered).toMatchObject({ version: 1, kind: "monitoring-recovery" });
  expect(recovered.runs).toHaveLength(1);
  expect(recovered.runs[0].results).toHaveLength(1);
  expect(recovered.runs[0].totalCostUsd).toBe(0.002);
  expect(JSON.stringify(recovered)).not.toContain(user.token);
  expect((await workspace(request, user)).snapshot.runs).toEqual([]);
  const other = await login(request);
  expect((await (await request.get("/api/monitor/results", { headers: { cookie: other.cookie } })).json()).runs).toEqual([]);
});

test("a pending provider response retains the quoted ceiling rather than settling its reservation header", async ({ request }) => {
  const user = await login(request);
  await configure(request, user, { ...configuration, config: { ...configuration.config, prompts: ["Compare tools [pending]"] } });
  due(user);
  const schedule = await settled(request, user, "partial");
  expect(schedule).toMatchObject({ enabled: false, nextRunAt: null, spentMonthUsd: 0.002 });
  const saved = await workspace(request, user);
  const audit = saved.snapshot.runs[0];
  expect(audit.results).toEqual([]);
  expect(audit.errors).toHaveLength(1);
  expect(audit.errors[0].error).toMatch(/pending|processing|unsettled/i);
  expect(audit.totalCostKnown).toBe(false);
  expect(audit.totalCostUsd).toBe(0);
  expect(jobs(user)[0]).toMatchObject({ status: "partial", reserved_micro: 2000, charged_micro: null });
});
