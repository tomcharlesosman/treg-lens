/** Requests remain below the hosting platform's body limit; SQLite forks use
 * the same protocol so large backups behave identically on every deployment. */
const DIRECT_BYTES = 3 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
export type WorkspaceSaveAttempt = {
  revision: number; bytes: Uint8Array<ArrayBuffer>;
  manifest: { id: string; revision: number; totalBytes: number; sha256: string };
};
type AttemptRef = { current: WorkspaceSaveAttempt | null };

export async function saveWorkspaceSnapshot(snapshot: unknown, revision: number, pending: AttemptRef, fetcher: typeof fetch = fetch): Promise<Response> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.byteLength <= DIRECT_BYTES) {
    pending.current = null;
    return fetcher("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, revision }) });
  }
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!pending.current || pending.current.revision !== revision || pending.current.manifest.sha256 !== sha256) {
    pending.current = { revision, bytes, manifest: { id: crypto.randomUUID(), revision, totalBytes: bytes.byteLength, sha256 } };
  }
  const attempt = pending.current;
  const root = `/api/workspace/uploads/${attempt.manifest.id}`;
  const created = await fetcher("/api/workspace/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.manifest) });
  if (!created.ok) return created;
  for (let offset = 0, index = 0; offset < attempt.bytes.byteLength; offset += CHUNK_BYTES, index++) {
    const uploaded = await fetcher(`${root}/chunks/${index}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: attempt.bytes.slice(offset, offset + CHUNK_BYTES).buffer });
    if (!uploaded.ok) return uploaded;
  }
  const committed = await fetcher(`${root}/commit`, { method: "POST" });
  // The caller acknowledges success only after it parses and validates the
  // complete response. A broken response body must replay this same manifest.
  if (committed.status === 409 || committed.status === 404) pending.current = null;
  return committed;
}
