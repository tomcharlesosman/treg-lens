import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDatabase } from "./database";
import { getWorkspace } from "./workspace-repository";
import { authorizedRunner, decryptMonitorToken, encryptMonitorToken, firstMonitorRun, getMonitorState, nextMonitorRun, pauseMonitor, recoverMonitorRuns, runnerToken, saveMonitor, tickMonitor, validateMonitorInput } from "./monitoring";
import type { MonitorInput } from "./monitor-types";
import type { AuditResponse, CostEstimate } from "./aeo";

const directory = mkdtempSync(join(tmpdir(), "treg-monitor-test-"));
process.env.TREG_DATA_DIR = directory;
const owner = "treg_0123456789abcdef01234567";
const other = "treg_abcdef0123456789abcdef01";
const secret = "unit-test-monitor-stable-secret-at-least-32-characters";
const key = "synthetic-user-key-for-scheduler-unit-tests";
const now = Date.parse("2026-10-19T12:00:00Z");
const input: MonitorInput = { enabled: true, intervalHours: 24, hourUtc: 13, perRunBudgetUsd: 0.01, monthlyBudgetUsd: 1, config: { brand: "Treg", domain: "treg.to", competitors: [], prompts: ["Which API toolkit should I choose?"], engines: ["chatgpt"] } };
const quote: CostEstimate = { currency: "USD", totalCostUsd: 0.008, callCount: 1, byEngine: [{ engine: "chatgpt", endpointId: "cloro.ai-search.chatgpt.scrape", calls: 1, costPerCallUsd: 0.008, subtotalUsd: 0.008 }], pricedAt: new Date(now).toISOString(), note: "Synthetic catalog quote" };
const result: AuditResponse = { results: [{ id: "call-one", prompt: input.config.prompts[0], engine: "chatgpt", answer: "Treg provides useful APIs.", citations: [], mentionedBrands: ["Treg"], brandMentioned: true, position: 1, costUsd: 0.006, costKnown: true, completedAt: new Date(now).toISOString() }], errors: [], totalCostUsd: 0.006, totalCostKnown: true, completedAt: new Date(now).toISOString() };

beforeEach(() => {
  getMonitorState(owner, now);
  getDatabase().exec("DELETE FROM monitor_jobs; DELETE FROM monitor_schedules; DELETE FROM workspaces; UPDATE monitor_worker SET last_seen_at=NULL,lease_id=NULL,lease_until=NULL;");
});
after(() => { getDatabase().close(); rmSync(directory, { recursive: true, force: true }); });
function due(value = input) {
  saveMonitor(owner, value, key, secret, now);
  getDatabase().prepare("UPDATE monitor_schedules SET next_run_at=? WHERE workspace_id=?").run(new Date(now).toISOString(), owner);
}
function fake(overrides: Parameters<typeof tickMonitor>[1] = {}) {
  return { now, validate: async (token: string) => { assert.equal(token, key); return token; }, estimate: async () => quote, run: async () => result, ...overrides };
}

test("monitoring requires explicit bounded cadence, cost limits, and allowlisted audit inputs", () => {
  assert.deepEqual(validateMonitorInput(input), input);
  for (const invalid of [null, {}, { ...input, enabled: "true" }, { ...input, intervalHours: 1 }, { ...input, hourUtc: 24 }, { ...input, perRunBudgetUsd: 0 }, { ...input, perRunBudgetUsd: 1.01 }, { ...input, monthlyBudgetUsd: NaN }, { ...input, monthlyBudgetUsd: 0.001 }, { ...input, config: { ...input.config, engines: ["arbitrary-provider"] } }]) assert.throws(() => validateMonitorInput(invalid));
  assert.equal("token" in validateMonitorInput({ ...input, config: { ...input.config, token: key } }).config, false);
});

test("credentials are authenticated encryption bound to the owner and never in public state", () => {
  const encrypted = encryptMonitorToken(key, owner, secret);
  assert.notEqual(encrypted, encryptMonitorToken(key, owner, secret));
  assert.equal(decryptMonitorToken(encrypted, owner, secret), key);
  assert.throws(() => decryptMonitorToken(encrypted, other, secret));
  assert.throws(() => decryptMonitorToken(encrypted, owner, secret + "changed"));
  assert.throws(() => decryptMonitorToken(encrypted.slice(0, -3), owner, secret));
  const state = saveMonitor(owner, input, key, secret, now);
  assert.equal(JSON.stringify(state).includes(key), false);
  assert.equal(JSON.stringify(state).includes("credential"), false);
  assert.equal(getMonitorState(other, now).schedule, null);
  assert.equal(readFileSync(join(directory, "treg-lens.sqlite-wal")).includes(Buffer.from(key)), false);
});

test("runner authentication is independent from sessions and rejects malformed bearer values", () => {
  const token = runnerToken(secret);
  assert.equal(authorizedRunner(`Bearer ${token}`, secret), true);
  for (const value of [null, "", token, "Bearer wrong", `bearer ${token}`, `Bearer ${token} `]) assert.equal(authorizedRunner(value, secret), false);
  assert.equal(authorizedRunner(`Bearer ${token}`, secret + "rotated"), false);
});

test("the first run uses the next chosen UTC hour, never an immediate paid call", () => {
  assert.equal(firstMonitorRun(13, now), "2026-10-19T13:00:00.000Z");
  assert.equal(firstMonitorRun(12, now), "2026-10-20T12:00:00.000Z");
  assert.equal(firstMonitorRun(0, Date.parse("2026-12-31T23:59:59Z")), "2027-01-01T00:00:00.000Z");
});

test("late workers preserve the UTC cadence and skip missed runs without catch-up charges", () => {
  assert.equal(nextMonitorRun("2026-10-18T09:00:00.000Z", 24, now), "2026-10-20T09:00:00.000Z");
  assert.equal(nextMonitorRun("2026-10-01T09:00:00.000Z", 168, now), "2026-10-22T09:00:00.000Z");
  assert.equal(nextMonitorRun("2026-12-31T09:00:00.000Z", 24, Date.parse("2027-01-01T08:00:00Z")), "2027-01-01T09:00:00.000Z");
});

test("an idle tick sends a heartbeat without validating a key or making provider calls", async () => {
  saveMonitor(owner, input, key, secret, now);
  const unreachable = async () => { throw new Error("No call expected"); };
  assert.deepEqual(await tickMonitor(secret, { now, validate: unreachable, estimate: unreachable, run: unreachable }), { processed: false });
  assert.equal(getMonitorState(owner, now).worker.healthy, true);
  assert.equal(getMonitorState(owner, now + 600_001).worker.healthy, false);
});

test("a successful scheduled audit reserves its exact quote, stores real evidence, and settles actual cost", async () => {
  due();
  const state = await tickMonitor(secret, fake({ run: async (data, reservedQuote, id) => {
    assert.equal(data.token, key);
    assert.equal(reservedQuote, quote);
    assert.match(id, /^[a-f\d-]{36}$/);
    assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.008);
    return result;
  } }));
  assert.deepEqual(state, { processed: true, status: "complete" });
  const saved = getWorkspace(owner);
  assert.equal(saved.snapshot?.runs.length, 1);
  assert.match(saved.snapshot!.runs[0].id, /^monitor-/);
  assert.equal(saved.snapshot!.runs[0].results[0].answer, result.results[0].answer);
  assert.equal(JSON.stringify(saved).includes(key), false);
  assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.006);
  assert.equal(getMonitorState(owner, now).schedule?.nextRunAt, "2026-10-20T12:00:00.000Z");
  assert.deepEqual(await tickMonitor(secret, fake()), { processed: false });
});

test("per-run and monthly budgets stop provider calls before spending", async () => {
  for (const value of [{ ...input, perRunBudgetUsd: 0.004 }, { ...input, perRunBudgetUsd: 0.008, monthlyBudgetUsd: 0.01 }]) {
    getDatabase().exec("DELETE FROM monitor_jobs; DELETE FROM monitor_schedules;");
    due(value);
    if (value.monthlyBudgetUsd === 0.01) getDatabase().prepare("INSERT INTO monitor_jobs(id,workspace_id,month,started_at,status,reserved_micro,charged_micro) VALUES('previous',?,'2026-10',?,'complete',6000,6000)").run(owner, new Date(now).toISOString());
    let called = false;
    await tickMonitor(secret, fake({ run: async () => { called = true; return result; } }));
    assert.equal(called, false);
    assert.equal(getMonitorState(owner, now).schedule?.enabled, false);
    assert.equal(getMonitorState(owner, now).schedule?.lastStatus, "budget-paused");
  }
});

test("unsettled charges retain the whole reservation and pause instead of silently retrying", async () => {
  due();
  let calls = 0;
  await tickMonitor(secret, fake({ run: async () => { calls++; return { ...result, totalCostUsd: 0, totalCostKnown: false }; } }));
  assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.008);
  assert.equal(getMonitorState(owner, now).schedule?.enabled, false);
  assert.match(getMonitorState(owner, now).schedule!.lastError!, /unsettled/);
  await tickMonitor(secret, fake({ run: async () => { calls++; return result; } }));
  assert.equal(calls, 1);
});

test("partial results are preserved and paused for review", async () => {
  due();
  await tickMonitor(secret, fake({ run: async () => ({ ...result, errors: [{ prompt: input.config.prompts[0], engine: "gemini", error: "Temporarily unavailable" }] }) }));
  assert.equal(getWorkspace(owner).snapshot?.runs[0].results.length, 1);
  assert.equal(getMonitorState(owner, now).schedule?.lastStatus, "partial");
  assert.equal(getMonitorState(owner, now).schedule?.enabled, false);
});

test("a durable lease prevents duplicate spend across simultaneous worker ticks", async () => {
  due();
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const first = tickMonitor(secret, fake({ run: async () => { entered(); await waiting; return result; } }));
  await ready;
  assert.deepEqual(await tickMonitor(secret, fake()), { processed: false });
  assert.throws(() => saveMonitor(owner, input, key, secret, now), /running/);
  release();
  await first;
  assert.equal(getWorkspace(owner).snapshot?.runs.length, 1);
});

test("pausing in flight removes the credential and cannot be undone by job completion", async () => {
  due();
  await tickMonitor(secret, fake({ run: async () => { pauseMonitor(owner, now); return result; } }));
  assert.equal(getWorkspace(owner).snapshot?.runs.length, 1);
  assert.equal(getMonitorState(owner, now).schedule?.enabled, false);
  assert.equal(getMonitorState(owner, now).schedule?.nextRunAt, null);
  assert.equal(getDatabase().prepare("SELECT credential FROM monitor_schedules WHERE workspace_id=?").get(owner)?.credential, null);
});

test("worker crashes retain budget and require explicit resumption, including after process restart", async () => {
  due();
  getDatabase().prepare("INSERT INTO monitor_jobs(id,workspace_id,month,started_at,status,reserved_micro) VALUES('interrupted-job',?,'2026-10',?,'running',8000)").run(owner, new Date(now - 700_000).toISOString());
  getDatabase().prepare("UPDATE monitor_worker SET lease_id='old-process',lease_until=? WHERE id=1").run(now - 1);
  let called = false;
  assert.deepEqual(await tickMonitor(secret, fake({ run: async () => { called = true; return result; } })), { processed: false });
  assert.equal(called, false);
  assert.equal(getMonitorState(owner, now).schedule?.lastStatus, "interrupted");
  assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.008);
});

test("a lost response keeps the reservation and redacts provider or credential details", async () => {
  due();
  await tickMonitor(secret, fake({ run: async () => { throw new Error(`PRIVATE ACCOUNT ${key}`); } }));
  const state = getMonitorState(owner, now);
  assert.equal(state.schedule?.spentMonthUsd, 0.008);
  assert.equal(state.schedule?.enabled, false);
  assert.equal(JSON.stringify(state).includes(key), false);
  assert.match(state.schedule!.lastError!, /not be settled/);
});

test("a crash after collecting the paid answer exposes recovery without repeating the provider call", async () => {
  due();
  const saved = { id: "monitor-collected", ...input.config, ...result };
  getDatabase().prepare("INSERT INTO monitor_jobs(id,workspace_id,month,started_at,status,reserved_micro,charged_micro,result_json) VALUES('collected',?,'2026-10',?,'running',8000,6000,?)").run(owner, new Date(now - 700_000).toISOString(), JSON.stringify(saved));
  await tickMonitor(secret, fake({ run: async () => { throw new Error("Provider must not be called twice"); } }));
  assert.equal(getMonitorState(owner, now).schedule?.lastStatus, "storage-error");
  assert.equal(getMonitorState(owner, now).schedule?.recoveryAudit?.url, "/api/monitor/results");
  assert.deepEqual(recoverMonitorRuns(owner), [saved]);
  assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.006);
});

test("paid evidence and actual charges survive a full workspace without exporting monitoring credentials", async () => {
  const { saveWorkspace } = await import("./workspace-repository");
  const full = saveWorkspace(owner, {
    project: { brand: "Treg", domain: "treg.to", competitors: [] },
    prompts: ["x".repeat(8 * 1024 * 1024 - 256)], runs: [], done: [], sourceResearch: {},
  }, 0);
  due();
  await tickMonitor(secret, fake());
  const row = getDatabase().prepare("SELECT result_json, reserved_micro, charged_micro FROM monitor_jobs WHERE workspace_id=?").get(owner);
  assert.ok(row?.result_json, "Completed provider evidence needs a durable recovery copy even when workspace append fails");
  const recovered = JSON.parse(String(row.result_json));
  assert.equal(recovered.results[0].answer, result.results[0].answer);
  assert.equal(recovered.totalCostUsd, result.totalCostUsd);
  assert.equal(row.reserved_micro, 8000);
  assert.equal(row.charged_micro, 6000);
  assert.equal(getMonitorState(owner, now).schedule?.spentMonthUsd, 0.006);
  assert.equal(getMonitorState(owner, now).schedule?.enabled, false);
  assert.deepEqual(getWorkspace(owner), full);
  assert.equal(JSON.stringify(recovered).includes(key), false);
  assert.equal("credential" in recovered, false);
  assert.equal("token" in recovered, false);
});
