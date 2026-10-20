import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { getDatabase } from "./database";
import { getWorkspace, saveWorkspace, WorkspaceConflictError } from "./workspace-repository";
import { abortWorkspaceUpload, beginWorkspaceUpload, commitWorkspaceUpload, parseUploadManifest, putWorkspaceUploadChunk, WORKSPACE_UPLOAD_CHUNK_BYTES, WORKSPACE_UPLOAD_TTL_MS, WorkspaceUploadError } from "./workspace-uploads";

const directory = mkdtempSync(join(tmpdir(), "treg-upload-unit-"));
const previous = { directory: process.env.TREG_DATA_DIR, storage: process.env.TREG_STORAGE, secret: process.env.SESSION_SECRET };
let sequence = 0;
const owner = () => `treg_${(++sequence).toString(16).padStart(24, "0")}`;
const snapshot = (prompt = "Which toolkit?") => ({ project: { brand: "Treg", domain: "treg.to", competitors: [] }, prompts: [prompt], runs: [], done: [], sourceResearch: {} });
const manifest = (bytes: Uint8Array, revision = 0) => ({ id: randomUUID(), revision, totalBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
async function stage(account: string, bytes: Uint8Array, revision = 0) {
  const value = manifest(bytes, revision);
  await beginWorkspaceUpload(account, value);
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += WORKSPACE_UPLOAD_CHUNK_BYTES, index++) await putWorkspaceUploadChunk(account, value.id, index, bytes.subarray(offset, offset + WORKSPACE_UPLOAD_CHUNK_BYTES));
  return value;
}
before(() => { process.env.TREG_DATA_DIR = directory; process.env.TREG_STORAGE = "sqlite"; process.env.SESSION_SECRET = "synthetic-upload-test-secret-".repeat(3); });
after(() => {
  getDatabase().close();
  if (previous.directory === undefined) delete process.env.TREG_DATA_DIR; else process.env.TREG_DATA_DIR = previous.directory;
  if (previous.storage === undefined) delete process.env.TREG_STORAGE; else process.env.TREG_STORAGE = previous.storage;
  if (previous.secret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous.secret;
  rmSync(directory, { recursive: true, force: true });
});

test("upload manifests reject invalid IDs, digests, revisions and byte limits", () => {
  const valid = manifest(Buffer.from("{}"));
  for (const changed of [{ id: "invalid" }, { sha256: "a" }, { revision: -1 }, { revision: 0.5 }, { totalBytes: 0 }, { totalBytes: 8 * 1024 * 1024 + 1 }]) assert.throws(() => parseUploadManifest({ ...valid, ...changed }), WorkspaceUploadError);
  assert.deepEqual(parseUploadManifest(valid), valid);
});
test("multi-part UTF-8 snapshots assemble correctly across character boundaries", async () => {
  const account = owner();
  const value = snapshot("🌿漢字".repeat(220_000));
  const upload = await stage(account, Buffer.from(JSON.stringify(value)));
  const saved = await commitWorkspaceUpload(account, upload.id);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.snapshot, value);
  assert.deepEqual(await getWorkspace(account), saved);
});
test("parts and committed snapshots remain isolated from another verified key", async () => {
  const account = owner(), foreign = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const upload = await stage(account, bytes);
  for (const action of [() => beginWorkspaceUpload(foreign, upload), () => putWorkspaceUploadChunk(foreign, upload.id, 0, bytes), () => commitWorkspaceUpload(foreign, upload.id), () => abortWorkspaceUpload(foreign, upload.id)]) await assert.rejects(action, (error) => error instanceof WorkspaceUploadError && error.status === 404);
  assert.equal((await commitWorkspaceUpload(account, upload.id)).revision, 1);
});
test("manifest and identical chunk replays succeed but changed data is immutable", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const upload = await stage(account, bytes);
  assert.equal((await beginWorkspaceUpload(account, upload)).id, upload.id);
  await putWorkspaceUploadChunk(account, upload.id, 0, bytes);
  await assert.rejects(() => beginWorkspaceUpload(account, { ...upload, sha256: "a".repeat(64) }), WorkspaceUploadError);
  const changed = Buffer.from(bytes); changed[5] ^= 1;
  await assert.rejects(() => putWorkspaceUploadChunk(account, upload.id, 0, changed), WorkspaceUploadError);
  assert.deepEqual((await commitWorkspaceUpload(account, upload.id)).snapshot, snapshot());
});
test("missing, oversized, out-of-range and wrongly sized chunks never mutate the workspace", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const upload = manifest(bytes);
  await beginWorkspaceUpload(account, upload);
  await assert.rejects(() => commitWorkspaceUpload(account, upload.id), /incomplete/);
  for (const [index, part] of [[-1, bytes], [1, bytes], [0, bytes.subarray(1)], [0, Buffer.alloc(WORKSPACE_UPLOAD_CHUNK_BYTES + 1)]] as const) await assert.rejects(() => putWorkspaceUploadChunk(account, upload.id, index, part), WorkspaceUploadError);
  assert.equal((await getWorkspace(account)).revision, 0);
});
test("commit enforces the original revision and cannot overwrite a later audit or edit", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot("Upload draft")));
  const upload = await stage(account, bytes);
  const edited = await saveWorkspace(account, snapshot("Saved by another tab"), 0);
  await assert.rejects(() => commitWorkspaceUpload(account, upload.id), WorkspaceConflictError);
  assert.deepEqual(await getWorkspace(account), edited);
});
test("commit replay returns the original committed snapshot and revision after later edits", async () => {
  const account = owner(), upload = await stage(account, Buffer.from(JSON.stringify(snapshot("Original upload"))));
  const original = await commitWorkspaceUpload(account, upload.id);
  const later = await saveWorkspace(account, snapshot("Later edit"), original.revision);
  await beginWorkspaceUpload(account, upload);
  await abortWorkspaceUpload(account, upload.id);
  assert.deepEqual(await commitWorkspaceUpload(account, upload.id), original);
  assert.deepEqual(await getWorkspace(account), later);
});
test("a new manifest replaces an abandoned pending draft without deleting committed replay evidence", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const old = await stage(account, bytes);
  const replacement = await stage(account, bytes);
  await assert.rejects(() => commitWorkspaceUpload(account, old.id), (error) => error instanceof WorkspaceUploadError && error.status === 404);
  const original = await commitWorkspaceUpload(account, replacement.id);
  await stage(account, bytes, original.revision);
  assert.deepEqual(await commitWorkspaceUpload(account, replacement.id), original);
});
test("expiry and explicit abort remove access to pending upload data", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const expiring = manifest(bytes);
  await beginWorkspaceUpload(account, expiring, 1_000);
  await assert.rejects(() => putWorkspaceUploadChunk(account, expiring.id, 0, bytes, 1_000 + WORKSPACE_UPLOAD_TTL_MS), (error) => error instanceof WorkspaceUploadError && error.status === 404);
  const aborting = await stage(account, bytes);
  await abortWorkspaceUpload(account, aborting.id);
  await assert.rejects(() => commitWorkspaceUpload(account, aborting.id), (error) => error instanceof WorkspaceUploadError && error.status === 404);
  assert.equal((await getWorkspace(account)).revision, 0);
});
test("digest, UTF-8, JSON and workspace schema failures leave saved data intact", async () => {
  const account = owner();
  for (const bytes of [Buffer.from([0xff]), Buffer.from("{invalid"), Buffer.from("{}")]) {
    const upload = await stage(account, bytes);
    await assert.rejects(() => commitWorkspaceUpload(account, upload.id));
  }
  const bytes = Buffer.from(JSON.stringify(snapshot()));
  const upload = { ...manifest(bytes), sha256: "0".repeat(64) };
  await beginWorkspaceUpload(account, upload);
  await putWorkspaceUploadChunk(account, upload.id, 0, bytes);
  await assert.rejects(() => commitWorkspaceUpload(account, upload.id), /checksum/);
  assert.equal((await getWorkspace(account)).revision, 0);
});

test("temporary chunks are encrypted, authenticated to their owner and stripped of unknown credentials at commit", async () => {
  const account = owner(), foreign = owner();
  const raw = { ...snapshot(), token: "PRIVATE-UPLOAD-TOKEN", headers: { authorization: "PRIVATE-UPLOAD-HEADER" } };
  const bytes = Buffer.from(JSON.stringify(raw));
  const upload = await stage(account, bytes);
  const db = getDatabase();
  const row = db.prepare("SELECT payload_base64 FROM workspace_upload_parts WHERE upload_id=?").get(upload.id)!;
  const encrypted = String(row.payload_base64);
  assert.match(encrypted, /^v1\./);
  assert.doesNotMatch(encrypted, /PRIVATE-UPLOAD/);
  assert.notEqual(encrypted, bytes.toString("base64"));
  // Moving database rows to a different namespace cannot decrypt their content.
  db.prepare("UPDATE workspace_uploads SET workspace_id=? WHERE id=?").run(foreign, upload.id);
  await assert.rejects(() => commitWorkspaceUpload(foreign, upload.id), /could not be verified/);
  db.prepare("UPDATE workspace_uploads SET workspace_id=? WHERE id=?").run(account, upload.id);
  const saved = await commitWorkspaceUpload(account, upload.id);
  assert.deepEqual(saved.snapshot, snapshot());
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE-UPLOAD/);
  const pieces = encrypted.split(".");
  pieces[2] = "A".repeat(pieces[2].length);
  db.prepare("UPDATE workspace_upload_parts SET payload_base64=? WHERE upload_id=?").run(pieces.join("."), upload.id);
  await assert.rejects(() => commitWorkspaceUpload(account, upload.id), /could not be verified/);
  assert.deepEqual(await getWorkspace(account), saved);
});

test("staging retains at most two completed uploads and one pending upload per owner", async () => {
  const account = owner(), bytes = Buffer.from(JSON.stringify(snapshot()));
  const completed: { id: string }[] = [];
  for (let revision = 0; revision < 4; revision++) {
    const upload = await stage(account, bytes, revision);
    await commitWorkspaceUpload(account, upload.id);
    completed.push(upload);
  }
  const pending = await stage(account, bytes, 4);
  const rows = getDatabase().prepare("SELECT id,committed_revision FROM workspace_uploads WHERE workspace_id=?").all(account);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.committed_revision === null).length, 1);
  assert.ok(rows.some((row) => row.id === pending.id));
  await assert.rejects(() => commitWorkspaceUpload(account, completed[0].id), (error) => error instanceof WorkspaceUploadError && error.status === 404);
  assert.equal((await commitWorkspaceUpload(account, completed[2].id)).revision, 3);
  assert.equal((await commitWorkspaceUpload(account, completed[3].id)).revision, 4);
  assert.equal((await getWorkspace(account)).revision, 4);
});
