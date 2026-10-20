/** A completed JSON value sent in bounded chunks, including large backups.
 * Serialization happens before sending headers so failures remain HTTP errors.
 */
export function streamJson(value: unknown, init: ResponseInit = {}): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let offset = 0;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.delete("Content-Length");
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 64 * 1024, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  }), { ...init, headers });
}
