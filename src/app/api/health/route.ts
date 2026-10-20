import { connection } from "next/server";
import { withStorage } from "@/lib/storage-database";

/** Deployment readiness, without a Treg call or any workspace information. */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    await withStorage((tx) => tx.get("SELECT 1"));
    return Response.json({ status: "ok", storage: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable", storage: "unavailable" }, { status: 503, headers });
  }
}
