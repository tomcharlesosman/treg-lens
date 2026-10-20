import assert from "node:assert/strict";
import { test } from "node:test";
import { streamJson } from "./stream-json";

test("streamed JSON round-trips Unicode above the platform response limit in bounded chunks", async () => {
  const value = { snapshot: "🌿漢字".repeat(600_000), revision: 7 };
  const response = streamJson(value, { status: 409, headers: { "Cache-Control": "private, no-store", "Content-Length": "1" } });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; assert.ok(value.length <= 64 * 1024); parts.push(value); }
  assert.deepEqual(JSON.parse(Buffer.concat(parts).toString("utf8")), value);
  assert.deepEqual(await streamJson(value).json(), value);
});
