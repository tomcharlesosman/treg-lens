import { DatabaseSync } from "node:sqlite";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readConfiguration, runtimeIssue } from "./project.mjs";

/** SQLite creates a transactionally consistent backup, including WAL data. */
export function backup(root, destination, environment = process.env) {
  const issue = runtimeIssue();
  if (issue) throw new Error(issue);
  if (!destination) throw new Error("Choose a private backup filename: npm run backup -- /private/path/treg-lens.sqlite");
  const config = readConfiguration(root, environment, environment.NODE_ENV || "production").environment;
  const source = join(resolve(root, config.TREG_DATA_DIR || "data"), "treg-lens.sqlite");
  const target = resolve(root, destination);
  if (!existsSync(source)) throw new Error("No workspace database exists in TREG_DATA_DIR yet. Sign in and save your first workspace before backing up.");
  if (target === source || existsSync(target)) throw new Error("Choose a new backup filename; existing files are never overwritten.");
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // Exclusively create a private empty target. VACUUM INTO accepts an empty file
  // and will refuse nonempty files, preventing accidental backup replacement.
  closeSync(openSync(target, "wx", 0o600));
  let db;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    db.exec("PRAGMA busy_timeout=5000;");
    db.prepare("VACUUM INTO ?").run(target);
    chmodSync(target, 0o600);
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  } finally { db?.close(); }
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: npm run backup -- /private/path/treg-lens.sqlite");
    backup(process.cwd(), process.argv[2]);
    console.log("Consistent database backup created. Keep it private and retain the matching SESSION_SECRET separately. Pause all restored schedules before restarting a worker.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Database backup failed.");
    process.exitCode = 1;
  }
}
