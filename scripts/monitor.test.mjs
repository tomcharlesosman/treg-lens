import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const execute = promisify(execFile);
const script = resolve("scripts/monitor.mjs");
const secret = "synthetic-monitor-runner-cli-test-secret-32-characters";
function environment() {
  const env = { ...process.env };
  for (const key of ["SESSION_SECRET", "TREG_DATA_DIR", "MONITOR_BASE_URL", "NODE_ENV"]) delete env[key];
  return env;
}

test("the separate worker loads protected configuration and authenticates one real HTTP tick", async () => {
  const root = mkdtempSync(join(tmpdir(), "treg-worker-cli-"));
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/internal/monitor/tick");
    assert.equal(request.headers.authorization, `Bearer ${createHmac("sha256", secret).update("treg-lens-monitor-runner:v1").digest("hex")}`);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ processed: false }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    writeFileSync(join(root, ".env.local"), `SESSION_SECRET=${secret}\nMONITOR_BASE_URL=http://127.0.0.1:${server.address().port}\n`);
    const result = await execute(process.execPath, [script, "--once"], { cwd: root, env: environment() });
    assert.equal(requests, 1);
    assert.match(result.stdout, /Checking for one due/);
    assert.equal((result.stdout + result.stderr).includes(secret), false);
  } finally { server.close(); rmSync(root, { recursive: true, force: true }); }
});

test("an unavailable monitoring server fails a single tick without retries or credential output", async () => {
  const root = mkdtempSync(join(tmpdir(), "treg-worker-error-"));
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.writeHead(503); response.end(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const env = { ...environment(), SESSION_SECRET: secret, MONITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` };
    await assert.rejects(() => execute(process.execPath, [script, "--once"], { cwd: root, env }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /server unavailable/);
      assert.equal(error.stderr.includes(secret), false);
      return true;
    });
    assert.equal(requests, 1);
  } finally { server.close(); rmSync(root, { recursive: true, force: true }); }
});

test("offline operator recovery pauses all restored schedules and removes credentials without changing billing", async () => {
  const root = mkdtempSync(join(tmpdir(), "treg-worker-pause-"));
  mkdirSync(join(root, "private data"));
  const path = join(root, "private data", "treg-lens.sqlite");
  let db = new DatabaseSync(path);
  db.exec("CREATE TABLE monitor_schedules (enabled INTEGER,credential TEXT,next_run_at TEXT,last_status TEXT,last_error TEXT); INSERT INTO monitor_schedules VALUES(1,'encrypted-envelope','2026-10-19T00:00:00Z','scheduled',NULL); CREATE TABLE monitor_jobs (reserved_micro INTEGER); INSERT INTO monitor_jobs VALUES(8000);");
  db.close();
  try {
    writeFileSync(join(root, ".env.local"), 'TREG_DATA_DIR="private data"\n');
    const result = await execute(process.execPath, [script, "--pause-all"], { cwd: root, env: environment() });
    assert.match(result.stdout, /All monitoring schedules are paused/);
    db = new DatabaseSync(path);
    assert.deepEqual({ ...db.prepare("SELECT enabled,credential,next_run_at,last_status FROM monitor_schedules").get() }, { enabled: 0, credential: null, next_run_at: null, last_status: "paused" });
    assert.equal(db.prepare("SELECT reserved_micro FROM monitor_jobs").get().reserved_micro, 8000);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
