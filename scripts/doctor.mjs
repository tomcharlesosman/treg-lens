import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { readConfiguration, runtimeIssue, secretIssue, storageMode } from "./project.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
let failed = false;
function check(ok, message) {
  console.log(`${ok ? "OK" : "FIX"}  ${message}`);
  if (!ok) failed = true;
}
async function portFree(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(750);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

try {
  if ([...args].some((arg) => !["--e2e", "--production"].includes(arg)))
    throw new Error("Usage: npm run doctor [-- --e2e] [-- --production]");
  const runtime = runtimeIssue();
  if (runtime) throw new Error(runtime);
  check(!runtime, runtime || `Node.js ${process.versions.node} (Node.js 24 LTS recommended)`);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const names = Object.keys({ ...manifest.dependencies, ...(!args.has("--production") && manifest.devDependencies) });
  const missing = names.filter((name) => {
    const path = join(root, "node_modules", name, "package.json");
    return !existsSync(path) || JSON.parse(readFileSync(path, "utf8")).version !== lock.packages[`node_modules/${name}`]?.version;
  });
  check(!missing.length, missing.length ? `Dependencies differ from the lockfile: ${missing.join(", ")}. Run npm ci.` : "Installed direct dependencies match package-lock.json");
  const configuration = readConfiguration(root, process.env, args.has("--production") ? "production" : process.env.NODE_ENV || "development");
  const issue = secretIssue(configuration.secret);
  check(!issue, issue ? `${issue} Source: ${configuration.source || "not configured"}.` : `SESSION_SECRET is configured (${configuration.source}); value hidden`);
  if (configuration.source !== "server environment" && configuration.secret?.includes("$"))
    console.log("NOTE  This file uses dollar signs. Next expands dotenv variables; verify the effective value at runtime or use a literal setup-generated secret.");
  try {
    const storage = storageMode(configuration.environment);
    check(true, storage === "sqlite" ? "SQLite storage selected; no external database service is required" : "Postgres storage selected; DATABASE_URL is configured and hidden (connection not tested)");
  } catch (error) {
    check(false, error instanceof Error ? error.message : "Storage configuration could not be validated.");
  }
  if (args.has("--e2e")) {
    const openssl = spawnSync("openssl", ["version"], { stdio: "ignore" });
    const help = openssl.status === 0 ? spawnSync("openssl", ["req", "-help"], { encoding: "utf8" }) : null;
    const certificateSupport = openssl.status === 0 && `${help?.stdout || ""}${help?.stderr || ""}`.includes("-addext");
    check(certificateSupport, certificateSupport ? "OpenSSL available with req -addext support for E2E HTTPS" : "Install an OpenSSL build with req -addext support and add it to PATH for E2E tests. App setup does not need it. See docs/TESTING.md.");
    if (!missing.includes("@playwright/test")) {
      const require = createRequire(import.meta.url);
      const browsers = require("@playwright/test");
      for (const name of ["chromium", "firefox", "webkit"])
        check(existsSync(browsers[name].executablePath()), `${name} browser ${existsSync(browsers[name].executablePath()) ? "installed" : "missing; run npx playwright install chromium firefox webkit"}`);
    }
    for (const port of [3100, 3101]) check(await portFree(port), `E2E port ${port} must be free (the suite never reuses an existing server)`);
  }
  console.log("No secrets were printed; no Treg or database requests were made. This checks local prerequisites, not provider availability or deployment security.");
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error(`Doctor: ${error instanceof Error ? error.message : "Could not inspect this checkout."}`);
  process.exitCode = 1;
}
