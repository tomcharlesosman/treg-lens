import { Pool, type PoolClient } from "@neondatabase/serverless";
import { getDatabase } from "./database";
import { STORAGE_SCHEMA, STORAGE_SCHEMA_VERSION } from "./storage-schema";
import { resolve } from "node:path";

export type StorageRow = Record<string, string | number | bigint | null | Uint8Array>;
export type StorageValue = string | number | bigint | null | Uint8Array;
export interface StorageSession {
  get(sql: string, ...parameters: StorageValue[]): Promise<StorageRow | undefined>;
  all(sql: string, ...parameters: StorageValue[]): Promise<StorageRow[]>;
  run(sql: string, ...parameters: StorageValue[]): Promise<void>;
}
type Options = { write?: boolean; lock?: string };
const state = globalThis as typeof globalThis & {
  __tregStorageQueues?: Map<string, Promise<unknown>>;
  __tregStorageReady?: Set<string>;
};

/** Explicit test/local overrides never inherit a deployment database by accident. */
export function storageKind(): "sqlite" | "postgres" {
  const selected = process.env.TREG_STORAGE;
  if (selected && selected !== "sqlite" && selected !== "postgres")
    throw new Error("TREG_STORAGE must be sqlite or postgres.");
  if (selected === "sqlite") {
    if (process.env.VERCEL === "1") throw new Error("Vercel requires durable Postgres storage.");
    return "sqlite";
  }
  if (selected === "postgres" || process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL) throw new Error("Postgres storage requires DATABASE_URL.");
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
        throw new Error("Invalid database URL.");
    } catch { throw new Error("DATABASE_URL must be a valid Postgres connection URL; value hidden."); }
    return "postgres";
  }
  if (process.env.VERCEL === "1") throw new Error("Configure DATABASE_URL before deploying on Vercel.");
  return "sqlite";
}

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}
function postgresSession(client: PoolClient): StorageSession {
  const query = async (sql: string, parameters: StorageValue[]) =>
    client.query(postgresSql(sql), parameters);
  return {
    get: async (sql, ...parameters) => (await query(sql, parameters)).rows[0],
    all: async (sql, ...parameters) => (await query(sql, parameters)).rows,
    run: async (sql, ...parameters) => { await query(sql, parameters); },
  };
}

async function postgres<T>(fn: (tx: StorageSession) => Promise<T>, options: Options, migrate = false): Promise<T> {
  // Request-scoped connections are closed before returning. No idle sockets,
  // additional pool lifecycle package, or cross-invocation transaction state.
  const connectionString = migrate
    ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000, query_timeout: 30_000 });
  let client: PoolClient | undefined;
  let transaction = false;
  try {
    client = await pool.connect();
    const tx = postgresSession(client);
    if (options.write) {
      await client.query("BEGIN"); transaction = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [options.lock || "treg-lens"]);
    }
    if (!migrate) {
      const ready = state.__tregStorageReady ??= new Set();
      if (!ready.has(connectionString!)) {
        const row = await tx.get("SELECT version FROM treg_lens_schema WHERE id=1");
        if (Number(row?.version) !== STORAGE_SCHEMA_VERSION) throw new Error("Run npm run db:migrate before starting this deployment.");
        ready.add(connectionString!);
      }
    }
    const result = await fn(tx);
    if (transaction) { await client.query("COMMIT"); transaction = false; }
    return result;
  } catch (error) {
    if (client && transaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    // Socket cleanup must not turn an acknowledged commit into an ambiguous
    // save failure or replace the transaction's original exception.
    await pool.end().catch(() => {});
  }
}

async function sqlite<T>(fn: (tx: StorageSession) => Promise<T>, options: Options): Promise<T> {
  // A runtime queue key must not make the bundler trace the user's data folder.
  const path = resolve(/* turbopackIgnore: true */ process.env.TREG_DATA_DIR || "data");
  const queues = state.__tregStorageQueues ??= new Map();
  const previous = queues.get(path) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const db = getDatabase();
    const ready = state.__tregStorageReady ??= new Set();
    if (!ready.has(path)) {
      for (const sql of STORAGE_SCHEMA) db.exec(sql);
      if (!db.prepare("PRAGMA table_info(monitor_jobs)").all().some((row) => row.name === "result_json"))
        db.exec("ALTER TABLE monitor_jobs ADD COLUMN result_json TEXT");
      db.prepare("INSERT INTO treg_lens_schema(id,version) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version").run(STORAGE_SCHEMA_VERSION);
      ready.add(path);
    }
    const tx: StorageSession = {
      get: async (sql, ...parameters) => db.prepare(sql).get(...parameters),
      all: async (sql, ...parameters) => db.prepare(sql).all(...parameters),
      run: async (sql, ...parameters) => { db.prepare(sql).run(...parameters); },
    };
    if (options.write) db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(tx);
      if (options.write) db.exec("COMMIT");
      return result;
    } catch (error) {
      if (options.write) db.exec("ROLLBACK");
      throw error;
    }
  });
  queues.set(path, operation.then(() => {}, () => {}));
  return operation;
}

/** All queries of a transaction must use its supplied session, never nest this. */
export function withStorage<T>(fn: (tx: StorageSession) => Promise<T>, options: Options = {}): Promise<T> {
  return storageKind() === "postgres" ? postgres(fn, options) : sqlite(fn, options);
}

/** Explicit, repeatable schema migration; never executed during next build. */
export async function initializeStorage(): Promise<void> {
  if (storageKind() === "sqlite") { await sqlite(async () => {}, {}); return; }
  await postgres(async (tx) => {
    for (const sql of STORAGE_SCHEMA) await tx.run(sql);
    await tx.run("ALTER TABLE monitor_jobs ADD COLUMN IF NOT EXISTS result_json TEXT");
    await tx.run("INSERT INTO treg_lens_schema(id,version) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version", STORAGE_SCHEMA_VERSION);
  }, { write: true, lock: "treg-lens-schema" }, true);
}
