import assert from "node:assert/strict";
import { test } from "node:test";
import { storageMode } from "./project.mjs";

const databaseUrl = "postgresql://synthetic-user:private-test-password@example.com/test?sslmode=require";

test("forks default to SQLite and explicit local mode isolates inherited database configuration", () => {
  assert.equal(storageMode({}), "sqlite");
  assert.equal(storageMode({ VERCEL: "0" }), "sqlite");
  assert.equal(storageMode({ TREG_STORAGE: "sqlite", DATABASE_URL: databaseUrl }), "sqlite");
  assert.equal(storageMode({ TREG_STORAGE: "sqlite", DATABASE_URL: "not a URL" }), "sqlite");
});

test("a configured database selects Postgres and malformed remote settings fail without disclosure", () => {
  assert.equal(storageMode({ DATABASE_URL: databaseUrl }), "postgres");
  assert.equal(storageMode({ TREG_STORAGE: "postgres", DATABASE_URL: databaseUrl }), "postgres");
  for (const env of [
    { TREG_STORAGE: "unknown", DATABASE_URL: databaseUrl },
    { TREG_STORAGE: "sqlite ", DATABASE_URL: databaseUrl },
    { TREG_STORAGE: "postgres" },
    { TREG_STORAGE: "postgres", DATABASE_URL: "https://private-test-password@example.com/test" },
    { DATABASE_URL: "private-test-password" },
  ]) {
    assert.throws(() => storageMode(env), (error) => {
      assert.ok(!error.message.includes("private-test-password"));
      assert.ok(!error.message.includes(databaseUrl));
      return true;
    });
  }
});

test("Vercel fails closed instead of silently choosing ephemeral local storage", () => {
  assert.equal(storageMode({ VERCEL: "1", DATABASE_URL: databaseUrl }), "postgres");
  assert.throws(() => storageMode({ VERCEL: "1" }), /Vercel requires durable Postgres/);
  assert.throws(() => storageMode({ VERCEL: "1", TREG_STORAGE: "sqlite", DATABASE_URL: databaseUrl }), /Vercel requires durable Postgres/);
  assert.throws(() => storageMode({ VERCEL: "1", TREG_STORAGE: "postgres" }), /valid private DATABASE_URL/);
});
