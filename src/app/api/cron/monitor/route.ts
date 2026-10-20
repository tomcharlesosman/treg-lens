import { authorizedCron } from "@/lib/cron-auth";
import { tickMonitor } from "@/lib/monitoring";
import { validateSessionSecret } from "@/lib/treg-session";

// Keep duration in vercel.ts so the optional Pro dispatcher can use 360s.
// A route-level export would override that setting for every hosting plan.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!authorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET))
    return Response.json({ error: "Cron authorization is required." }, { status: 401, headers });
  try {
    return Response.json(await tickMonitor(validateSessionSecret(process.env.SESSION_SECRET)), { headers });
  } catch {
    return Response.json({ error: "The monitoring tick could not complete. Review worker health before resuming paused work." }, { status: 503, headers });
  }
}
