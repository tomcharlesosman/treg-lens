/** Versioned, portable application schema. SQLite remains the local default. */
export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0), updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS monitor_schedules (
    workspace_id TEXT PRIMARY KEY, input_json TEXT NOT NULL, credential TEXT,
    enabled INTEGER NOT NULL, next_run_at TEXT, last_run_at TEXT,
    last_status TEXT NOT NULL, last_error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS monitor_jobs (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, month TEXT NOT NULL,
    started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL,
    reserved_micro BIGINT NOT NULL DEFAULT 0, charged_micro BIGINT,
    error TEXT, result_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS monitor_jobs_workspace_month ON monitor_jobs(workspace_id, month)`,
  `CREATE TABLE IF NOT EXISTS monitor_worker (
    id INTEGER PRIMARY KEY CHECK (id = 1), last_seen_at TEXT,
    lease_id TEXT, lease_until BIGINT
  )`,
  `INSERT INTO monitor_worker(id) VALUES (1) ON CONFLICT(id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS workspace_uploads (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expected_revision INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, committed_revision INTEGER, committed_updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS workspace_uploads_owner ON workspace_uploads(workspace_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS workspace_uploads_expiry ON workspace_uploads(expires_at)`,
  `CREATE TABLE IF NOT EXISTS workspace_upload_parts (
    upload_id TEXT NOT NULL REFERENCES workspace_uploads(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL, payload_base64 TEXT NOT NULL,
    PRIMARY KEY(upload_id, part_index)
  )`,
  `CREATE TABLE IF NOT EXISTS treg_lens_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)`,
];
