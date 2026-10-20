import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { withStorage, type StorageRow, type StorageSession } from "./storage-database";
import { getWorkspaceInSession, saveWorkspaceInSession, WorkspaceConflictError, type WorkspaceEnvelope } from "./workspace-repository";
import { MAX_WORKSPACE_BYTES, sanitizeWorkspaceSnapshot } from "./workspace-validation";
import { validateSessionSecret } from "./treg-session";

export const WORKSPACE_UPLOAD_CHUNK_BYTES = 1024 * 1024;
export const WORKSPACE_UPLOAD_TTL_MS = 15 * 60 * 1000;
export type WorkspaceUploadManifest = { id: string; revision: number; totalBytes: number; sha256: string };
export class WorkspaceUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "WorkspaceUploadError"; }
}
function stagingKey() {
  return createHmac("sha256", validateSessionSecret(process.env.SESSION_SECRET)).update("treg-lens-workspace-upload-parts:v1").digest();
}
function encryptPart(owner: string, id: string, index: number, value: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stagingKey(), iv);
  cipher.setAAD(Buffer.from(`${owner}:${id}:${index}`));
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptPart(owner: string, id: string, index: number, envelope: string) {
  try {
    const [version, encodedIv, encodedTag, encodedPayload, extra] = envelope.split(".");
    if (version !== "v1" || extra !== undefined) throw new Error("Invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", stagingKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAAD(Buffer.from(`${owner}:${id}:${index}`));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encodedPayload, "base64url")), decipher.final()]);
  } catch { throw new WorkspaceUploadError("Stored upload data could not be verified. Your saved workspace has not changed.", 503); }
}
function identifier(id: string) {
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)) throw new WorkspaceUploadError("Invalid workspace upload ID.");
}
function ownerId(owner: string) {
  if (!/^treg_[a-f\d]{24}$/.test(owner)) throw new WorkspaceUploadError("Invalid workspace namespace.");
}
export function parseUploadManifest(value: unknown): WorkspaceUploadManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceUploadError("Send a valid workspace upload manifest.");
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || typeof data.sha256 !== "string" || !/^[a-f\d]{64}$/.test(data.sha256) || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0 || !Number.isSafeInteger(data.totalBytes) || Number(data.totalBytes) < 1 || Number(data.totalBytes) > MAX_WORKSPACE_BYTES) throw new WorkspaceUploadError("Workspace uploads require a revision, SHA-256 checksum and at most 8 MiB of UTF-8 snapshot data.");
  identifier(data.id);
  return { id: data.id, sha256: data.sha256, revision: Number(data.revision), totalBytes: Number(data.totalBytes) };
}
async function readUpload(tx: StorageSession, owner: string, id: string, now: number): Promise<StorageRow> {
  const row = await tx.get("SELECT * FROM workspace_uploads WHERE id=? AND workspace_id=? AND expires_at>?", id, owner, new Date(now).toISOString());
  if (!row) throw new WorkspaceUploadError("This workspace upload was replaced, expired or is unavailable. Your local changes are retained.", 404);
  return row;
}
async function pruneCommitted(tx: StorageSession, owner: string) {
  await tx.run(`DELETE FROM workspace_uploads WHERE workspace_id=? AND committed_revision IS NOT NULL
    AND id NOT IN (SELECT id FROM workspace_uploads WHERE workspace_id=? AND committed_revision IS NOT NULL ORDER BY committed_revision DESC LIMIT 2)`, owner, owner);
}
export async function beginWorkspaceUpload(owner: string, value: unknown, now = Date.now()) {
  ownerId(owner);
  const manifest = parseUploadManifest(value);
  return withStorage(async (tx) => {
    await tx.run("DELETE FROM workspace_uploads WHERE expires_at<=?", new Date(now).toISOString());
    await pruneCommitted(tx, owner);
    const existing = await tx.get("SELECT * FROM workspace_uploads WHERE id=?", manifest.id);
    if (existing) {
      if (existing.workspace_id !== owner) throw new WorkspaceUploadError("This workspace upload is unavailable.", 404);
      if (Number(existing.expected_revision) !== manifest.revision || Number(existing.total_bytes) !== manifest.totalBytes || existing.sha256 !== manifest.sha256) throw new WorkspaceUploadError("An existing upload manifest cannot be changed.");
      return { id: manifest.id, expiresAt: String(existing.expires_at), chunkBytes: WORKSPACE_UPLOAD_CHUNK_BYTES };
    }
    const current = await getWorkspaceInSession(tx, owner);
    if (current.revision !== manifest.revision) throw new WorkspaceConflictError(current);
    // Replacing an abandoned draft prevents a closed tab from blocking saves.
    // Committed markers remain available for safe, idempotent response replay.
    await tx.run("DELETE FROM workspace_uploads WHERE workspace_id=? AND committed_revision IS NULL", owner);
    const expiresAt = new Date(now + WORKSPACE_UPLOAD_TTL_MS).toISOString();
    await tx.run("INSERT INTO workspace_uploads(id,workspace_id,expected_revision,total_bytes,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?)", manifest.id, owner, manifest.revision, manifest.totalBytes, manifest.sha256, new Date(now).toISOString(), expiresAt);
    return { id: manifest.id, expiresAt, chunkBytes: WORKSPACE_UPLOAD_CHUNK_BYTES };
  }, { write: true, lock: `workspace:${owner}` });
}
export async function putWorkspaceUploadChunk(owner: string, id: string, index: number, payload: Uint8Array, now = Date.now()) {
  ownerId(owner); identifier(id);
  if (!Number.isSafeInteger(index) || index < 0 || payload.byteLength > WORKSPACE_UPLOAD_CHUNK_BYTES) throw new WorkspaceUploadError("Invalid workspace upload chunk.");
  const buffer = Buffer.from(payload);
  return withStorage(async (tx) => {
    const row = await readUpload(tx, owner, id, now);
    const total = Number(row.total_bytes);
    const expected = Math.min(WORKSPACE_UPLOAD_CHUNK_BYTES, total - index * WORKSPACE_UPLOAD_CHUNK_BYTES);
    if (expected <= 0 || buffer.byteLength !== expected) throw new WorkspaceUploadError("The workspace chunk size or index does not match its manifest.");
    const previous = await tx.get("SELECT payload_base64 FROM workspace_upload_parts WHERE upload_id=? AND part_index=?", id, index);
    if (previous) {
      if (!decryptPart(owner, id, index, String(previous.payload_base64)).equals(buffer)) throw new WorkspaceUploadError("An uploaded workspace chunk cannot be changed.");
      return { index, received: true };
    }
    if (row.committed_revision !== null) throw new WorkspaceUploadError("This workspace upload has already been committed.");
    await tx.run("INSERT INTO workspace_upload_parts(upload_id,part_index,payload_base64) VALUES(?,?,?)", id, index, encryptPart(owner, id, index, buffer));
    return { index, received: true };
  }, { write: true, lock: `workspace:${owner}` });
}
export async function commitWorkspaceUpload(owner: string, id: string, now = Date.now()): Promise<WorkspaceEnvelope> {
  ownerId(owner); identifier(id);
  return withStorage(async (tx) => {
    const row = await readUpload(tx, owner, id, now);
    const parts = await tx.all("SELECT part_index,payload_base64 FROM workspace_upload_parts WHERE upload_id=? ORDER BY part_index", id);
    const count = Math.ceil(Number(row.total_bytes) / WORKSPACE_UPLOAD_CHUNK_BYTES);
    if (parts.length !== count || parts.some((part, index) => Number(part.part_index) !== index)) throw new WorkspaceUploadError("The workspace upload is incomplete.");
    const buffer = Buffer.concat(parts.map((part) => decryptPart(owner, id, Number(part.part_index), String(part.payload_base64))));
    if (buffer.byteLength !== Number(row.total_bytes) || createHash("sha256").update(buffer).digest("hex") !== row.sha256) throw new WorkspaceUploadError("The workspace upload checksum does not match. Your saved workspace has not changed.");
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
    catch { throw new WorkspaceUploadError("Upload a valid UTF-8 JSON workspace snapshot."); }
    const snapshot = sanitizeWorkspaceSnapshot(value);
    if (row.committed_revision !== null) return { snapshot, revision: Number(row.committed_revision), updatedAt: String(row.committed_updated_at) };
    const saved = await saveWorkspaceInSession(tx, owner, snapshot, Number(row.expected_revision));
    await tx.run("UPDATE workspace_uploads SET committed_revision=?,committed_updated_at=? WHERE id=?", saved.revision, saved.updatedAt, id);
    await pruneCommitted(tx, owner);
    return saved;
  }, { write: true, lock: `workspace:${owner}` });
}
export async function abortWorkspaceUpload(owner: string, id: string, now = Date.now()) {
  ownerId(owner); identifier(id);
  return withStorage(async (tx) => {
    await readUpload(tx, owner, id, now);
    await tx.run("DELETE FROM workspace_uploads WHERE id=? AND workspace_id=? AND committed_revision IS NULL", id, owner);
    return { aborted: true };
  }, { write: true, lock: `workspace:${owner}` });
}
