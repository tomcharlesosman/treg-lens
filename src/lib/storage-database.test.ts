import assert from "node:assert/strict";
import { test } from "node:test";
import { storageKind } from "./storage-database";

test("storage selection keeps local forks simple and refuses ephemeral Vercel persistence", () => {
  const names = ["TREG_STORAGE", "DATABASE_URL", "VERCEL"] as const;
  const before = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.equal(storageKind(), "sqlite");
    process.env.DATABASE_URL = "postgresql://user:private@database.example/db";
    assert.equal(storageKind(), "postgres");
    process.env.TREG_STORAGE = "sqlite";
    assert.equal(storageKind(), "sqlite");
    process.env.VERCEL = "1";
    assert.throws(() => storageKind(), /Vercel requires durable Postgres/);
    delete process.env.TREG_STORAGE;
    assert.equal(storageKind(), "postgres");
    delete process.env.DATABASE_URL;
    assert.throws(() => storageKind(), /Configure DATABASE_URL/);
    process.env.TREG_STORAGE = "postgres";
    assert.throws(() => storageKind(), /requires DATABASE_URL/);
    process.env.DATABASE_URL = "private-malformed-value";
    assert.throws(() => storageKind(), (error: unknown) => error instanceof Error && !error.message.includes("private-malformed-value"));
    process.env.TREG_STORAGE = "invalid";
    assert.throws(() => storageKind(), /must be sqlite or postgres/);
  } finally {
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; });
  }
});
