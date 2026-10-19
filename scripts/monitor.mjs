import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readConfiguration, runtimeIssue, secretIssue } from "./project.mjs";

const problem = runtimeIssue();
if (problem) throw new Error(problem);
const { secret, environment } = readConfiguration(process.cwd(), process.env, process.env.NODE_ENV || "production");
if (process.argv.includes("--pause-all")) {
  if (process.argv.slice(2).length !== 1) throw new Error("Use --pause-all by itself with the server and worker stopped.");
  const path = join(resolve(environment.TREG_DATA_DIR || "data"), "treg-lens.sqlite");
  if (!existsSync(path)) throw new Error("No database exists in TREG_DATA_DIR; no schedules were changed.");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000;");
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_schedules'").get();
    if (table) db.exec("UPDATE monitor_schedules SET enabled=0,credential=NULL,next_run_at=NULL,last_status='paused',last_error='Paused by the server operator; review billing before resuming.';");
    console.log("All monitoring schedules are paused and their stored credentials removed. Review Treg billing before re-enabling them in the workspace.");
  } finally { db.close(); }
  process.exit(0);
}
const invalid = secretIssue(secret);
if (invalid) throw new Error(invalid);
let base;
try { base = new URL(environment.MONITOR_BASE_URL || "http://127.0.0.1:3000"); }
catch { throw new Error("MONITOR_BASE_URL must be a valid HTTP or HTTPS server origin."); }
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash)
  throw new Error("MONITOR_BASE_URL must be the server origin, without credentials or a path.");
if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Remote monitoring workers require an HTTPS server origin.");
const token = createHmac("sha256", secret).update("treg-lens-monitor-runner:v1").digest("hex");
const once = process.argv.includes("--once");
if (process.argv.slice(2).some((argument) => argument !== "--once"))
  throw new Error("Usage: npm run monitor [-- --once | --pause-all]");
let stopping = false;
let wake;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; wake?.(); });
console.log(once ? "Checking for one due monitoring audit." : "Monitoring worker started. Enable audits and budgets in your workspace.");
do {
  try {
    const response = await fetch(new URL("/api/internal/monitor/tick", base), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(310_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`The server returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.processed) console.log(`Monitoring audit ${result.status === "complete" ? "completed" : "paused for review"}.`);
  } catch {
    console.error("Monitoring server unavailable. Check its origin, stable SESSION_SECRET, and server health. Paid jobs are not automatically retried.");
    if (once) process.exitCode = 1;
  }
  if (once || stopping) break;
  await new Promise((resolve) => { const timer = setTimeout(resolve, 60_000); wake = () => { clearTimeout(timer); resolve(); }; });
} while (!stopping);
