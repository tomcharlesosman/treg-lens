import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./setup.mjs";
import { readConfiguration, runtimeIssue } from "./project.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "treg-lens-setup-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".env.example"), "# Local configuration\nSESSION_SECRET=\n");
  return root;
}
const stable = "synthetic-existing-session-secret-never-use-in-production";

test("setup creates a private random secret without needing OpenSSL or external services", (t) => {
  const root = fixture(t);
  assert.deepEqual(setup(root, {}), { created: true, source: ".env.local" });
  assert.match(readConfiguration(root, {}).secret, /^[A-Za-z0-9_-]{64}$/);
  if (process.platform !== "win32") assert.equal(statSync(join(root, ".env.local")).mode & 0o077, 0);
});

test("repeated setup preserves the exact existing environment and namespace", (t) => {
  const root = fixture(t);
  const original = `# Keep comments\nSESSION_SECRET='${stable}'\nPRIVATE_SETTING=synthetic-value\n`;
  writeFileSync(join(root, ".env.local"), original);
  setup(root, {});
  setup(root, {});
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
});

test("setup fills an empty assignment and preserves other Windows-format settings", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env.local"), "# Existing\r\nSESSION_SECRET=\r\nKEEP=unchanged\r\n", { mode: 0o644 });
  setup(root, {});
  assert.match(readFileSync(join(root, ".env.local"), "utf8"), /KEEP=unchanged\r\n/);
  assert.equal(readConfiguration(root, {}).secret.length, 64);
  if (process.platform !== "win32") assert.equal(statSync(join(root, ".env.local")).mode & 0o077, 0);
});

test("setup appends a missing assignment without replacing unrelated environment values", (t) => {
  const root = fixture(t);
  const previous = "KEEP=unchanged\n";
  writeFileSync(join(root, ".env.local"), previous);
  setup(root, {});
  assert.ok(readFileSync(join(root, ".env.local"), "utf8").startsWith(previous));
  assert.equal(readConfiguration(root, {}).secret.length, 64);
});

test("setup refuses to rotate a nonempty invalid secret or disclose its value", (t) => {
  const root = fixture(t);
  const original = "SESSION_SECRET=sensitive-short\n";
  writeFileSync(join(root, ".env.local"), original);
  assert.throws(() => setup(root, {}), (error) => {
    assert.match(error.message, /never replaced automatically/);
    assert.ok(!error.message.includes("sensitive-short"));
    return true;
  });
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
});

test("setup honors a valid inherited secret without creating a competing file", (t) => {
  const root = fixture(t);
  assert.deepEqual(setup(root, { SESSION_SECRET: stable }), { created: false, source: "server environment" });
  assert.equal(existsSync(join(root, ".env.local")), false);
});

test("an empty shell override fails with a remedy and leaves local files untouched", (t) => {
  const root = fixture(t);
  assert.throws(() => setup(root, { SESSION_SECRET: "" }), /Unset it before local setup/);
  assert.equal(existsSync(join(root, ".env.local")), false);
});

test("a higher-priority empty local override cannot silently shadow a generated secret", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env.development.local"), "SESSION_SECRET=\n");
  assert.throws(() => setup(root, {}), /overrides .env.local/);
  assert.equal(existsSync(join(root, ".env.local")), false);
});

test("configuration checks respect development, production, and inherited precedence", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env"), "SESSION_SECRET=base\n");
  writeFileSync(join(root, ".env.local"), "SESSION_SECRET=local\n");
  writeFileSync(join(root, ".env.development.local"), "SESSION_SECRET=development\n");
  writeFileSync(join(root, ".env.production.local"), "SESSION_SECRET=production\n");
  assert.equal(readConfiguration(root, {}).secret, "development");
  assert.equal(readConfiguration(root, {}, "production").secret, "production");
  assert.equal(readConfiguration(root, { NODE_ENV: "production" }).secret, "production");
  assert.equal(readConfiguration(root, { SESSION_SECRET: stable }).source, "server environment");
});

test("runtime checks accept the documented minimum and reject older Node versions", () => {
  for (const version of ["22.13.0", "22.22.3", "24.0.0", "24.15.0"]) assert.equal(runtimeIssue(version), null);
  for (const version of ["20.19.0", "22.12.0", "18.0.0", "unknown"]) assert.match(runtimeIssue(version), /Node.js 22.13/);
});

test("duplicate empty assignments fail without claiming configuration or changing the file", (t) => {
  const root = fixture(t);
  const previous = "SESSION_SECRET=\nSESSION_SECRET=\n";
  writeFileSync(join(root, ".env.local"), previous);
  assert.throws(() => setup(root, {}), /Multiple SESSION_SECRET assignments/);
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), previous);
});

test("test-mode setup refuses to generate an ignored development configuration", (t) => {
  const root = fixture(t);
  assert.throws(() => setup(root, { NODE_ENV: "test" }), /NODE_ENV=test ignores .env.local/);
  assert.equal(existsSync(join(root, ".env.local")), false);
});
