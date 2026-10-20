import { createHash, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

const CHUNK = 1024 * 1024;
const snapshot = (prompt = "Which toolkit?") => ({ project: { brand: "Treg", domain: "treg.to", competitors: [] }, prompts: [prompt], runs: [], done: [], sourceResearch: {} });
const manifest = (bytes: Buffer, revision = 0) => ({ id: randomUUID(), revision, totalBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/session", { data: { token: `treg-e2e-upload-${randomUUID()}` }, headers: { "x-forwarded-for": randomUUID() } });
  expect(response.status()).toBe(200);
  return { cookie: response.headers()["set-cookie"].split(";")[0] };
}
async function stage(request: APIRequestContext, headers: Record<string, string>, bytes: Buffer, revision = 0) {
  const value = manifest(bytes, revision);
  const created = await request.post("/api/workspace/uploads", { data: value, headers });
  expect(created.status(), await created.text()).toBe(200);
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += CHUNK, index++) {
    const response = await request.put(`/api/workspace/uploads/${value.id}/chunks/${index}`, { data: bytes.subarray(offset, offset + CHUNK), headers: { ...headers, "content-type": "application/octet-stream" } });
    expect(response.status(), await response.text()).toBe(200);
  }
  return value;
}

test("upload endpoints require a signed-in caller and reject foreign origins and malformed manifests", async ({ request }) => {
  const id = randomUUID();
  const anonymous = [
    () => request.post("/api/workspace/uploads", { data: manifest(Buffer.from("{}")) }),
    () => request.put(`/api/workspace/uploads/${id}/chunks/0`, { data: Buffer.from("{}") }),
    () => request.post(`/api/workspace/uploads/${id}/commit`),
    () => request.delete(`/api/workspace/uploads/${id}`),
  ];
  for (const action of anonymous) expect((await action()).status()).toBe(401);
  const headers = await login(request);
  expect((await request.post("/api/workspace/uploads", { data: manifest(Buffer.from("{}")), headers: { ...headers, origin: "https://attacker.example" } })).status()).toBe(403);
  expect((await request.post("/api/workspace/uploads", { data: { ...manifest(Buffer.from("{}")), totalBytes: 8 * CHUNK + 1 }, headers })).status()).toBe(400);
  expect((await request.post("/api/workspace/uploads", { data: "{broken", headers: { ...headers, "content-type": "application/json" } })).status()).toBe(400);
  expect((await request.post("/api/workspace/uploads", { data: "x".repeat(4097), headers: { ...headers, "content-type": "application/json" } })).status()).toBe(413);
});
test("chunk uploads enforce owner isolation, immutable content, bounds, complete data and abort", async ({ request }) => {
  const owner = await login(request), foreign = await login(request), bytes = Buffer.from(JSON.stringify(snapshot()));
  const value = manifest(bytes);
  expect((await request.post("/api/workspace/uploads", { data: value, headers: owner })).status()).toBe(200);
  expect((await request.post(`/api/workspace/uploads/${value.id}/commit`, { headers: owner })).status()).toBe(400);
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/0`, { data: bytes, headers: { ...foreign, "content-type": "application/octet-stream" } })).status()).toBe(404);
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/1`, { data: bytes, headers: { ...owner, "content-type": "application/octet-stream" } })).status()).toBe(400);
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/0`, { data: Buffer.alloc(CHUNK + 1), headers: { ...owner, "content-type": "application/octet-stream" } })).status()).toBe(413);
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/0`, { data: bytes, headers: { ...owner, "content-type": "text/plain" } })).status()).toBe(415);
  const chunkHeaders = { ...owner, "content-type": "application/octet-stream" };
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/0`, { data: bytes, headers: chunkHeaders })).status()).toBe(200);
  const modified = Buffer.from(bytes); modified[5] ^= 1;
  expect((await request.put(`/api/workspace/uploads/${value.id}/chunks/0`, { data: modified, headers: chunkHeaders })).status()).toBe(400);
  expect((await request.delete(`/api/workspace/uploads/${value.id}`, { headers: foreign })).status()).toBe(404);
  expect((await request.delete(`/api/workspace/uploads/${value.id}`, { headers: owner })).status()).toBe(200);
  expect((await request.post(`/api/workspace/uploads/${value.id}/commit`, { headers: owner })).status()).toBe(404);
  expect((await (await request.get("/api/workspace", { headers: owner })).json()).revision).toBe(0);
});
test("large Unicode uploads stream intact and committed replays retain their original revision after later writes", async ({ request }) => {
  const headers = await login(request);
  const draft = snapshot("🌿漢字".repeat(500_000));
  const bytes = Buffer.from(JSON.stringify(draft));
  expect(bytes.byteLength).toBeGreaterThan(4.5 * CHUNK);
  const value = await stage(request, headers, bytes);
  const committed = await request.post(`/api/workspace/uploads/${value.id}/commit`, { headers });
  expect(committed.status(), await committed.text()).toBe(200);
  expect(committed.headers()["content-length"]).toBeUndefined();
  const original = await committed.json();
  expect(original).toMatchObject({ snapshot: draft, revision: 1 });
  const read = await request.get("/api/workspace", { headers });
  expect(await read.json()).toEqual(original);
  const later = await request.put("/api/workspace", { data: { snapshot: snapshot("Later edit"), revision: 1 }, headers });
  expect(later.status()).toBe(200);
  expect((await request.post("/api/workspace/uploads", { data: value, headers })).status()).toBe(200);
  expect(await (await request.post(`/api/workspace/uploads/${value.id}/commit`, { headers })).json()).toEqual(original);
  expect((await (await request.get("/api/workspace", { headers })).json()).snapshot.prompts).toEqual(["Later edit"]);
});
test("a replaced pending upload and a stale revision cannot overwrite concurrent edits", async ({ request }) => {
  const headers = await login(request), bytes = Buffer.from(JSON.stringify(snapshot("Draft")));
  const first = await stage(request, headers, bytes);
  const replacement = await stage(request, headers, bytes);
  expect((await request.post(`/api/workspace/uploads/${first.id}/commit`, { headers })).status()).toBe(404);
  expect((await request.put("/api/workspace", { data: { snapshot: snapshot("Another tab"), revision: 0 }, headers })).status()).toBe(200);
  const conflict = await request.post(`/api/workspace/uploads/${replacement.id}/commit`, { headers });
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ revision: 1, snapshot: { prompts: ["Another tab"] } });
  expect((await (await request.get("/api/workspace", { headers })).json()).snapshot.prompts).toEqual(["Another tab"]);
});
