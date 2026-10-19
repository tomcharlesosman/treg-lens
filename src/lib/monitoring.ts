import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AeoError, estimateAudit, runAudit, validateAuditInput, type AuditInput, type AuditResponse, type CostEstimate } from "./aeo";
import { getDatabase } from "./database";
import { appendWorkspaceRun } from "./workspace-repository";
import { validateSessionSecret, validateTregKey } from "./treg-session";
import type { MonitorInput, MonitorSchedule, MonitorState } from "./monitor-types";

type ScheduleRow = {
  workspace_id: string; input_json: string; credential: string | null;
  enabled: number; next_run_at: string | null; last_run_at: string | null;
  last_status: string; last_error: string | null;
};
const LEASE_MS = 10 * 60_000;
const dollars = (micro: number) => micro / 1_000_000;
const micros = (usd: number) => Math.ceil(usd * 1_000_000);
const month = (now: number) => new Date(now).toISOString().slice(0, 7);
const iso = (now: number) => new Date(now).toISOString();

function database() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitor_schedules (
      workspace_id TEXT PRIMARY KEY, input_json TEXT NOT NULL, credential TEXT,
      enabled INTEGER NOT NULL, next_run_at TEXT, last_run_at TEXT,
      last_status TEXT NOT NULL, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS monitor_jobs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, month TEXT NOT NULL,
      started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL,
      reserved_micro INTEGER NOT NULL DEFAULT 0, charged_micro INTEGER,
      error TEXT, result_json TEXT
    );
    CREATE INDEX IF NOT EXISTS monitor_jobs_workspace_month ON monitor_jobs(workspace_id, month);
    CREATE TABLE IF NOT EXISTS monitor_worker (
      id INTEGER PRIMARY KEY CHECK (id = 1), last_seen_at TEXT,
      lease_id TEXT, lease_until INTEGER
    );
    INSERT OR IGNORE INTO monitor_worker(id) VALUES (1);
  `);
  if (!db.prepare("PRAGMA table_info(monitor_jobs)").all().some((column) => column.name === "result_json"))
    db.exec("ALTER TABLE monitor_jobs ADD COLUMN result_json TEXT");
  return db;
}

function atomic<T>(fn: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try { const value = fn(); db.exec("COMMIT"); return value; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

function derivedKey(secret: string, purpose: string) {
  return createHmac("sha256", validateSessionSecret(secret)).update(purpose).digest();
}

export function runnerToken(secret: string) {
  return derivedKey(secret, "treg-lens-monitor-runner:v1").toString("hex");
}

export function authorizedRunner(header: string | null, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header?.replace(/^Bearer /, "") || "");
  const expected = Buffer.from(runnerToken(secret));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function encryptMonitorToken(token: string, workspaceId: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(secret, "treg-lens-monitor-credential:v1"), iv);
  cipher.setAAD(Buffer.from(workspaceId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMonitorToken(value: string, workspaceId: string, secret: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(secret, "treg-lens-monitor-credential:v1"), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(workspaceId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function validateMonitorInput(value: unknown): MonitorInput {
  const input = value as Partial<MonitorInput> | null;
  if (!input || typeof input !== "object" || typeof input.enabled !== "boolean")
    throw new AeoError("Choose whether monitoring is enabled.");
  if (input.intervalHours !== 24 && input.intervalHours !== 168)
    throw new AeoError("Choose daily or weekly monitoring.");
  if (!Number.isInteger(input.hourUtc) || input.hourUtc! < 0 || input.hourUtc! > 23)
    throw new AeoError("Choose a UTC hour between 0 and 23.");
  if (typeof input.perRunBudgetUsd !== "number" || !Number.isFinite(input.perRunBudgetUsd) || input.perRunBudgetUsd < 0.001 || input.perRunBudgetUsd > 1)
    throw new AeoError("Set a per-audit budget between $0.001 and $1.");
  if (typeof input.monthlyBudgetUsd !== "number" || !Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd < input.perRunBudgetUsd || input.monthlyBudgetUsd > 1000)
    throw new AeoError("Set a monthly budget between your per-audit budget and $1,000.");
  const { token: _ignored, ...config } = validateAuditInput(input.config);
  void _ignored;
  return { enabled: input.enabled, intervalHours: input.intervalHours, hourUtc: input.hourUtc!, perRunBudgetUsd: input.perRunBudgetUsd, monthlyBudgetUsd: input.monthlyBudgetUsd, config };
}

export function firstMonitorRun(hourUtc: number, now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** Keep the chosen UTC slot; skip missed intervals without catch-up spending. */
export function nextMonitorRun(previous: string, intervalHours: 24 | 168, now = Date.now()) {
  const prior = Date.parse(previous);
  const interval = intervalHours * 3_600_000;
  return iso(prior + Math.max(1, Math.floor((now - prior) / interval) + 1) * interval);
}

function spent(workspaceId: string, now: number) {
  const result = database().prepare("SELECT COALESCE(SUM(COALESCE(charged_micro, reserved_micro)), 0) AS total FROM monitor_jobs WHERE workspace_id = ? AND month = ?").get(workspaceId, month(now)) as { total: number };
  return Number(result.total);
}

export function getMonitorState(workspaceId: string, now = Date.now()): MonitorState {
  const db = database();
  const row = db.prepare("SELECT * FROM monitor_schedules WHERE workspace_id = ?").get(workspaceId) as ScheduleRow | undefined;
  const worker = db.prepare("SELECT last_seen_at FROM monitor_worker WHERE id = 1").get() as { last_seen_at: string | null };
  let schedule: MonitorSchedule | null = null;
  if (row) {
    const recoverable = db.prepare("SELECT completed_at FROM monitor_jobs WHERE workspace_id=? AND status='storage-error' AND result_json IS NOT NULL ORDER BY started_at DESC LIMIT 1").get(workspaceId);
    schedule = { ...JSON.parse(row.input_json), enabled: Boolean(row.enabled), nextRunAt: row.next_run_at, lastRunAt: row.last_run_at, lastStatus: row.last_status, lastError: row.last_error, spentMonthUsd: dollars(spent(workspaceId, now)), ...(recoverable ? { recoveryAudit: { completedAt: String(recoverable.completed_at), url: "/api/monitor/results" } } : {}) };
  }
  return { schedule, worker: { lastSeenAt: worker.last_seen_at, healthy: Boolean(worker.last_seen_at && now - Date.parse(worker.last_seen_at) < LEASE_MS) } };
}

export function saveMonitor(workspaceId: string, input: MonitorInput, token: string, secret: string, now = Date.now()) {
  const validated = validateMonitorInput(input);
  return atomic(() => {
    const db = database();
    if (db.prepare("SELECT id FROM monitor_jobs WHERE workspace_id = ? AND status = 'running'").get(workspaceId))
      throw new AeoError("An audit is running. Pause or change monitoring after it finishes.", 409);
    db.prepare(`INSERT INTO monitor_schedules(workspace_id,input_json,credential,enabled,next_run_at,last_status)
      VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET
      input_json=excluded.input_json,credential=excluded.credential,enabled=excluded.enabled,
      next_run_at=excluded.next_run_at,last_status=excluded.last_status,last_error=NULL`)
      .run(workspaceId, JSON.stringify(validated), validated.enabled ? encryptMonitorToken(token, workspaceId, secret) : null, Number(validated.enabled), validated.enabled ? firstMonitorRun(validated.hourUtc, now) : null, validated.enabled ? "scheduled" : "paused");
    return getMonitorState(workspaceId, now);
  });
}

export function pauseMonitor(workspaceId: string, now = Date.now()) {
  // A request already sent to a provider can still complete. Removing the
  // credential prevents future runs without discarding the in-flight evidence.
  database().prepare("UPDATE monitor_schedules SET enabled=0, credential=NULL, next_run_at=NULL, last_status=CASE WHEN last_status='running' THEN last_status ELSE 'paused' END WHERE workspace_id=?").run(workspaceId);
  return getMonitorState(workspaceId, now);
}

type TickDependencies = {
  now?: number;
  validate?: (token: string) => Promise<string>;
  estimate?: (input: AuditInput) => Promise<CostEstimate>;
  run?: (input: AuditInput, quote: CostEstimate, id: string) => Promise<AuditResponse>;
};

export async function tickMonitor(secret: string, dependencies: TickDependencies = {}) {
  validateSessionSecret(secret);
  const now = dependencies.now ?? Date.now();
  const db = database();
  const leaseId = randomUUID();
  const claimed = atomic(() => {
    db.prepare("UPDATE monitor_worker SET last_seen_at=? WHERE id=1").run(iso(now));
    const worker = db.prepare("SELECT lease_id, lease_until FROM monitor_worker WHERE id=1").get() as { lease_id: string | null; lease_until: number | null };
    if (worker.lease_id && Number(worker.lease_until) > now) return null;
    // A stale paid task is never retried automatically. Keep its full reserved
    // ceiling until an operator reconciles Treg activity and explicitly resumes.
    const stale = db.prepare("SELECT id,workspace_id,result_json FROM monitor_jobs WHERE status='running'").all() as { id: string; workspace_id: string; result_json: string | null }[];
    for (const row of stale) {
      const status = row.result_json ? "storage-error" : "interrupted";
      const error = row.result_json ? "The worker stopped after collecting an audit. Download the recovered audit before resuming monitoring." : "The previous worker stopped before settlement. Check Treg activity before re-enabling monitoring; the reserved budget is retained.";
      db.prepare("UPDATE monitor_schedules SET enabled=0,credential=NULL,next_run_at=NULL,last_status=?,last_error=? WHERE workspace_id=?").run(status, error, row.workspace_id);
      db.prepare("UPDATE monitor_jobs SET status=?,completed_at=?,error=? WHERE id=?").run(status, iso(now), error, row.id);
    }
    const row = db.prepare("SELECT * FROM monitor_schedules WHERE enabled=1 AND next_run_at<=? ORDER BY next_run_at LIMIT 1").get(iso(now)) as ScheduleRow | undefined;
    if (!row) { db.prepare("UPDATE monitor_worker SET lease_id=NULL,lease_until=NULL WHERE id=1").run(); return null; }
    db.prepare("UPDATE monitor_worker SET lease_id=?,lease_until=? WHERE id=1").run(leaseId, now + LEASE_MS);
    const id = randomUUID();
    db.prepare("INSERT INTO monitor_jobs(id,workspace_id,month,started_at,status) VALUES(?,?,?,?,'running')").run(id, row.workspace_id, month(now), iso(now));
    db.prepare("UPDATE monitor_schedules SET last_status='running',last_run_at=?,last_error=NULL WHERE workspace_id=?").run(iso(now), row.workspace_id);
    return { row, id, input: validateMonitorInput(JSON.parse(row.input_json)) };
  });
  if (!claimed) return { processed: false };
  const { row, id, input } = claimed;
  let paidStarted = false;
  let settledResult: AuditResponse | null = null;
  let resultStored = false;
  try {
    if (!row.credential) throw new AeoError("Reconnect your Treg key to enable monitoring.");
    const token = decryptMonitorToken(row.credential, row.workspace_id, secret);
    await (dependencies.validate ?? validateTregKey)(token);
    const config: AuditInput = { ...input.config, token };
    const quote = await (dependencies.estimate ?? estimateAudit)(config);
    const reserve = micros(quote.totalCostUsd);
    if (!Number.isSafeInteger(reserve) || reserve <= 0 || reserve > micros(input.perRunBudgetUsd))
      throw new AeoError("The live catalog estimate exceeds the per-audit budget. Increase the limit or reduce prompts and engines.", 402);
    atomic(() => {
      const current = db.prepare("SELECT enabled FROM monitor_schedules WHERE workspace_id=?").get(row.workspace_id) as { enabled: number };
      if (!current.enabled) throw new AeoError("Monitoring was paused before provider calls started.");
      if (spent(row.workspace_id, now) + reserve > micros(input.monthlyBudgetUsd))
        throw new AeoError("The monthly monitoring budget is exhausted. Increase it or re-enable monitoring next month.", 402);
      db.prepare("UPDATE monitor_jobs SET reserved_micro=? WHERE id=?").run(reserve, id);
    });
    paidStarted = true;
    const result = await (dependencies.run ?? ((data, estimate, prefix) => runAudit(data, fetch, { estimate, idempotencyPrefix: prefix })))(config, quote, id);
    settledResult = result;
    const savedRun = { id: `monitor-${id}`, ...input.config, ...result };
    // Journal the paid answer before rolling it into the bounded workspace.
    // A full workspace must not discard evidence the user already paid for.
    db.prepare("UPDATE monitor_jobs SET result_json=?,charged_micro=? WHERE id=?").run(JSON.stringify(savedRun), result.totalCostKnown === true ? micros(result.totalCostUsd) : null, id);
    resultStored = true;
    appendWorkspaceRun(row.workspace_id, savedRun);
    const uncertain = result.totalCostKnown !== true;
    const partial = result.errors.length > 0;
    const overBudget = result.totalCostUsd > quote.totalCostUsd;
    const pause = uncertain || partial || overBudget;
    const message = uncertain ? "Some charges are unsettled. The full catalog reservation is retained; check Treg activity before resuming." : overBudget ? "A provider reported charges above its reservation. Check Treg activity before resuming." : partial ? "Some engines returned errors. Successful answers were saved; review the audit before resuming." : null;
    atomic(() => {
      db.prepare("UPDATE monitor_jobs SET completed_at=?,status=?,charged_micro=?,error=? WHERE id=?").run(iso(Date.now()), partial ? "partial" : uncertain ? "unsettled" : "complete", uncertain ? null : micros(result.totalCostUsd), message, id);
      // DELETE/pause during an in-flight call must never be undone on completion.
      db.prepare(`UPDATE monitor_schedules SET enabled=CASE WHEN ? THEN 0 ELSE enabled END,
        credential=CASE WHEN ? THEN NULL ELSE credential END,
        next_run_at=CASE WHEN ? OR enabled=0 THEN NULL ELSE ? END,last_status=?,last_error=? WHERE workspace_id=?`)
        .run(Number(pause), Number(pause), Number(pause), nextMonitorRun(row.next_run_at!, input.intervalHours, now), partial ? "partial" : uncertain ? "unsettled" : "complete", message, row.workspace_id);
    });
    return { processed: true, status: pause ? "paused" : "complete" };
  } catch (error) {
    const storageError = settledResult !== null && resultStored;
    const safeError = storageError ? "The completed audit could not fit in the workspace. Download the recovered audit, export a full backup, and remove older history before resuming." : error instanceof AeoError ? error.message : paidStarted ? "The audit could not be settled. Check Treg activity before resuming; its budget reservation is retained." : "Monitoring could not start. Reconnect your Treg key and check the worker configuration.";
    atomic(() => {
      db.prepare("UPDATE monitor_jobs SET completed_at=?,status=?,charged_micro=?,error=? WHERE id=?").run(iso(Date.now()), storageError ? "storage-error" : "error", settledResult?.totalCostKnown === true ? micros(settledResult.totalCostUsd) : paidStarted ? null : 0, safeError, id);
      db.prepare("UPDATE monitor_schedules SET enabled=0,credential=NULL,next_run_at=NULL,last_status=?,last_error=? WHERE workspace_id=?").run(storageError ? "storage-error" : error instanceof AeoError && error.status === 402 ? "budget-paused" : "error", safeError, row.workspace_id);
    });
    return { processed: true, status: "paused" };
  } finally {
    db.prepare("UPDATE monitor_worker SET last_seen_at=?,lease_id=NULL,lease_until=NULL WHERE id=1 AND lease_id=?").run(iso(Date.now()), leaseId);
  }
}

export function recoverMonitorRuns(workspaceId: string) {
  return database().prepare("SELECT result_json FROM monitor_jobs WHERE workspace_id=? AND status='storage-error' AND result_json IS NOT NULL ORDER BY started_at").all(workspaceId).map((row) => JSON.parse(String(row.result_json)));
}
