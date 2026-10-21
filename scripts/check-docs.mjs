import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(root).filter((name) => name.endsWith(".md")).map((name) => join(root, name));
function collect(path) {
  for (const name of readdirSync(path)) {
    const next = join(path, name);
    if (statSync(next).isDirectory()) collect(next);
    else if (name.endsWith(".md")) files.push(next);
  }
}
for (const directory of ["docs", "src", ".github", "contracts"]) collect(join(root, directory));
function anchors(file) {
  const result = new Set();
  for (const heading of readFileSync(file, "utf8").matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = heading[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    let slug = base;
    let index = 1;
    while (result.has(slug)) slug = `${base}-${index++}`;
    result.add(slug);
  }
  return result;
}
let failures = 0;
let checked = 0;
for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
    const target = match[1] || match[2];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    const absolute = !path ? file : path.startsWith("/") ? join(root, path) : resolve(dirname(file), path);
    checked++;
    if (!existsSync(absolute)) {
      failures++;
      console.error(`${file.slice(root.length)}: missing ${target}`);
    } else if (target.includes("#") && absolute.endsWith(".md") && !anchors(absolute).has(decodeURIComponent(target.slice(target.indexOf("#") + 1)))) {
      failures++;
      console.error(`${file.slice(root.length)}: missing heading ${target}`);
    }
  }
}
console.log(`Checked ${checked} local documentation links in ${files.length} Markdown files; ${failures} missing. External URLs are not requested.`);
process.exitCode = failures ? 1 : 0;
