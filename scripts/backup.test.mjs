import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backup } from "./backup.mjs";

test("online database backups include committed WAL records and use private, new files", () => {
  const root = mkdtempSync(join(tmpdir(), "treg-backup-test-"));
  mkdirSync(join(root, "data"));
  const db = new DatabaseSync(join(root, "data", "treg-lens.sqlite"));
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence (answer TEXT); INSERT INTO evidence VALUES ('Paid evidence retained');");
    const target = backup(root, "private backups/first.sqlite", {});
    const copied = new DatabaseSync(target, { readOnly: true });
    try { assert.equal(copied.prepare("SELECT answer FROM evidence").get().answer, "Paid evidence retained"); }
    finally { copied.close(); }
    if (process.platform !== "win32") assert.equal(statSync(target).mode & 0o777, 0o600);
    const original = readFileSync(target);
    assert.throws(() => backup(root, "private backups/first.sqlite", {}), /never overwritten/);
    assert.deepEqual(readFileSync(target), original);
    assert.throws(() => backup(root, "data/treg-lens.sqlite", {}), /never overwritten/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("backup configuration follows the server data directory and refuses missing databases", () => {
  const root = mkdtempSync(join(tmpdir(), "treg-backup-config-"));
  mkdirSync(join(root, "custom data"));
  const db = new DatabaseSync(join(root, "custom data", "treg-lens.sqlite"));
  db.exec("CREATE TABLE config (version INTEGER); INSERT INTO config VALUES (1);");
  db.close();
  try {
    writeFileSync(join(root, ".env.local"), 'TREG_DATA_DIR="custom data"\n');
    assert.ok(exists(backup(root, "backup.sqlite", {})));
    assert.throws(() => backup(root, undefined, {}), /filename/);
    assert.throws(() => backup(root, "missing.sqlite", { TREG_DATA_DIR: "absent" }), /No workspace database/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function exists(path) { return statSync(path).size > 0; }
