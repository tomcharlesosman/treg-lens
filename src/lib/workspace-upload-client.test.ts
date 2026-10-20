import assert from "node:assert/strict";
import { test } from "node:test";
import { saveWorkspaceSnapshot, type WorkspaceSaveAttempt } from "./workspace-upload-client";

test("small saves retain the existing direct PUT and conflict response contract", async () => {
  const expected = new Response(JSON.stringify({ revision: 2 }), { status: 409 });
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/workspace"); assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), { snapshot: { prompts: ["Question"] }, revision: 1 });
    return expected;
  };
  assert.equal(await saveWorkspaceSnapshot({ prompts: ["Question"] }, 1, { current: null }, fetcher), expected);
});
test("large saves bound every request and reuse a stable manifest after an ambiguous commit response", async () => {
  const snapshot = { prompts: ["🌿".repeat(900_000)] };
  const pending = { current: null as WorkspaceSaveAttempt | null };
  let firstId = "", commitCount = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/uploads")) {
      const manifest = JSON.parse(String(init?.body));
      assert.ok(manifest.totalBytes > 3 * 1024 * 1024);
      if (!firstId) firstId = manifest.id;
      assert.equal(manifest.id, firstId);
    } else if (String(url).includes("/chunks/")) assert.ok((init?.body as ArrayBuffer).byteLength <= 1024 * 1024);
    else if (String(url).endsWith("/commit") && commitCount++ === 0) throw new Error("Connection lost after commit");
    return new Response("{}", { status: 200 });
  };
  await assert.rejects(() => saveWorkspaceSnapshot(snapshot, 0, pending, fetcher), /Connection lost/);
  assert.ok(pending.current);
  assert.equal((await saveWorkspaceSnapshot(snapshot, 0, pending, fetcher)).status, 200);
  assert.equal(commitCount, 2);
  assert.equal(pending.current?.manifest.id, firstId);
});

test("a lost successful commit response body keeps the manifest available for idempotent retry", async () => {
  const snapshot = { prompts: ["x".repeat(3 * 1024 * 1024)] };
  const pending = { current: null as WorkspaceSaveAttempt | null };
  let id = "", commits = 0, serverRevision = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/uploads")) {
      const manifest = JSON.parse(String(init?.body));
      if (!id) id = manifest.id;
      assert.equal(manifest.id, id);
    }
    if (String(url).endsWith("/commit")) {
      serverRevision ||= 1;
      if (commits++ === 0) return new Response(new ReadableStream({ start(controller) { controller.error(new Error("Response body interrupted")); } }));
      return Response.json({ revision: serverRevision });
    }
    return Response.json({});
  };
  const first = await saveWorkspaceSnapshot(snapshot, 0, pending, fetcher);
  await assert.rejects(() => first.json(), /interrupted/);
  assert.ok(pending.current);
  const replay = await saveWorkspaceSnapshot(snapshot, 0, pending, fetcher);
  assert.equal((await replay.json()).revision, 1);
  assert.equal(serverRevision, 1);
  assert.equal(commits, 2);
});
