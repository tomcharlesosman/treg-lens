import { readConfiguration, secretIssue } from "./project.mjs";
import { initializeStorage, storageKind } from "../src/lib/storage-database";

const configuration = readConfiguration(process.cwd(), process.env, process.env.NODE_ENV || "production");
Object.assign(process.env, configuration.environment);
async function main() {
try {
  const kind = storageKind();
  if (process.env.VERCEL === "1" && secretIssue(process.env.SESSION_SECRET)) {
    console.error("Configure a private SESSION_SECRET of at least 32 random characters in Vercel before deploying. This is not your Treg API key.");
    process.exitCode = 1;
    return;
  }
  await initializeStorage();
  console.log(`Treg Lens ${kind} schema is ready.`);
} catch {
  console.error("Storage migration failed. Check the selected storage mode and database connectivity. Connection values are hidden.");
  process.exitCode = 1;
}
}
void main();
