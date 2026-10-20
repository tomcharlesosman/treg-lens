import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Production sessions must retain Secure cookies. A real TLS listener lets
// WebKit exercise them too; it does not trust HTTP loopback like Chromium.
const temporary = mkdtempSync(join(tmpdir(), "treg-lens-e2e-"));
mkdirSync(resolve("output/playwright"), { recursive: true });
writeFileSync(resolve("output/playwright/server-info.json"), JSON.stringify({ dataDirectory: join(temporary, "data") }));
const key = join(temporary, "localhost.key");
const cert = join(temporary, "localhost.crt");
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
} catch {
  rmSync(temporary, { recursive: true, force: true });
  throw new Error("E2E HTTPS setup needs OpenSSL on PATH with support for req -addext. Run npm run doctor -- --e2e and see docs/TESTING.md. Temporary certificate files were removed.");
}

const next = spawn(
  process.execPath,
  [
    "--require",
    resolve("tests/e2e/support/treg-fixture.cjs"),
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  { env: { ...process.env, VERCEL: "", TREG_STORAGE: "sqlite", TREG_DATA_DIR: join(temporary, "data") }, stdio: "inherit" },
);

const server = createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  (incoming, outgoing) => {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: 3101,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, "x-forwarded-proto": "https" },
      },
      (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end("The local test server is unavailable.");
    });
    incoming.on("aborted", () => upstream.destroy());
    outgoing.on("close", () => {
      if (!outgoing.writableEnded) upstream.destroy();
    });
    incoming.pipe(upstream);
  },
);

function cleanup() {
  server.close();
  next.kill("SIGTERM");
  // Windows can retain the SQLite file lock briefly while Next terminates.
  rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
process.once("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    cleanup();
    process.exit(0);
  });
next.once("exit", (code) => process.exit(code || 0));

let ready = false;
for (let attempt = 0; attempt < 150; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:3101/");
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* Wait until Next's production listener is ready. */
  }
  await delay(100);
}
if (!ready) throw new Error("The production test server did not start.");
server.listen(3100, "127.0.0.1");
