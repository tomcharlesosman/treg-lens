import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfiguration, runtimeIssue, secretIssue } from "./project.mjs";

export function setup(root, environment = process.env) {
  const runtime = runtimeIssue();
  if (runtime) throw new Error(runtime);
  const configured = readConfiguration(root, environment);
  if (configured.secret?.trim()) {
    const issue = secretIssue(configured.secret);
    if (issue) throw new Error(`${issue} Source: ${configured.source}.`);
    return { created: false, source: configured.source };
  }
  if (configured.source === "server environment")
    throw new Error("SESSION_SECRET is empty in your shell environment. Unset it before local setup, or configure a valid server secret. No files were changed.");
  if (environment.NODE_ENV === "test")
    throw new Error("NODE_ENV=test ignores .env.local. Unset NODE_ENV before development setup. The automated tests configure their own synthetic secrets. No files were changed.");

  const path = join(root, ".env.local");
  const existed = existsSync(path);
  const previous = existed
    ? readFileSync(path, "utf8")
    : readFileSync(join(root, ".env.example"), "utf8");
  if ([...previous.matchAll(/^[ \t]*(?:export[ \t]+)?SESSION_SECRET[ \t]*=/gm)].length > 1)
    throw new Error("Multiple SESSION_SECRET assignments make this file ambiguous. Keep one deliberate assignment before running setup. No files were changed.");
  const secret = randomBytes(48).toString("base64url");
  const emptyAssignment = /^[ \t]*(?:export[ \t]+)?SESSION_SECRET[ \t]*=[ \t]*(?:""|'')?[ \t]*(?:#[^\r\n]*)?(?=\r?$)/m;
  const next = emptyAssignment.test(previous)
    ? previous.replace(emptyAssignment, `SESSION_SECRET=${secret}`)
    : `${previous}${previous.endsWith("\n") ? "" : "\n"}SESSION_SECRET=${secret}\n`;
  // An existing higher-priority empty file would still shadow .env.local.
  if (configured.source && configured.source !== ".env.local" && configured.source.endsWith(".local"))
    throw new Error(`An empty SESSION_SECRET in ${configured.source} overrides .env.local. Remove that empty assignment, then run npm run setup. No files were changed.`);
  if (existed && process.platform !== "win32") chmodSync(path, 0o600);
  writeFileSync(path, next, { mode: 0o600, flag: existed ? "w" : "wx" });
  return { created: !existed, source: ".env.local" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: npm run setup (no flags). This command preserves existing nonempty secrets.");
    const root = fileURLToPath(new URL("../", import.meta.url));
    const result = setup(root);
    console.log(result.created
      ? "Created private .env.local with a random SESSION_SECRET. Its value is not printed."
      : `Configuration ready in ${result.source}. Existing nonempty secrets were preserved.`);
    console.log("Next: npm run doctor, then npm run dev. Open http://localhost:3000/demo to explore without a Treg key.");
  } catch (error) {
    console.error(`Setup: ${error instanceof Error ? error.message : "Could not configure this checkout."}`);
    process.exitCode = 1;
  }
}
