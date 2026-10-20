import { authorizedCron } from "@/lib/cron-auth";
import { tickMonitor } from "@/lib/monitoring";
import { validateSessionSecret } from "@/lib/treg-session";

// Hobby-compatible default; an enabled Pro cron gets 360s in vercel.ts.
export const maxDuration = 300;
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
