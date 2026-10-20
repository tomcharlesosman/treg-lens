import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const state = globalThis as typeof globalThis & {
  __tregLensDatabases?: Map<string, DatabaseSync>;
};

function protect(path: string, directory = false): void {
  const info = lstatSync(/* turbopackIgnore: true */ path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))
    throw new Error("The application data path must be a regular private directory or file.");
  chmodSync(/* turbopackIgnore: true */ path, directory ? 0o700 : 0o600);
}

/** One SQLite connection per data path and Node process, including dev reloads. */
export function getDatabase(): DatabaseSync {
  // These paths belong to the running user's private data, never build assets.
  // Keep the bundler from resolving dynamic paths into whole-project traces.
  const directory = resolve(/* turbopackIgnore: true */ process.env.TREG_DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), "data"));
  const path = join(/* turbopackIgnore: true */ directory, "treg-lens.sqlite");
  const databases = state.__tregLensDatabases ??= new Map();
  const cached = databases.get(path);
  if (cached) return cached;
  mkdirSync(/* turbopackIgnore: true */ directory, { recursive: true, mode: 0o700 });
  protect(directory, true);
  for (const file of [path, `${path}-wal`, `${path}-shm`])
    if (existsSync(/* turbopackIgnore: true */ file)) protect(file);
  const database = new DatabaseSync(/* turbopackIgnore: true */ path);
  try {
    protect(path);
    database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    database.exec(`CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      updated_at TEXT NOT NULL
    )`);
    for (const file of [`${path}-wal`, `${path}-shm`])
      if (existsSync(/* turbopackIgnore: true */ file)) protect(file);
    databases.set(path, database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
