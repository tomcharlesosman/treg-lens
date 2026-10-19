import { connection } from "next/server";
import { getDatabase } from "@/lib/database";

/** Deployment readiness, without a Treg call or any workspace information. */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    getDatabase().prepare("SELECT 1").get();
    return Response.json({ status: "ok", storage: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable", storage: "unavailable" }, { status: 503, headers });
  }
}
