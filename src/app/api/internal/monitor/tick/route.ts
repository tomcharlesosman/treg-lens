import { authorizedRunner, tickMonitor } from "@/lib/monitoring";
import { validateSessionSecret } from "@/lib/treg-session";

export const maxDuration = 300;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const secret = validateSessionSecret(process.env.SESSION_SECRET);
    if (!authorizedRunner(request.headers.get("authorization"), secret))
      return Response.json({ error: "Runner authorization is required." }, { status: 401, headers });
    return Response.json(await tickMonitor(secret), { headers });
  } catch {
    return Response.json({ error: "The monitoring worker could not complete this tick. Check server health; no automatic retry of a paid job occurs." }, { status: 503, headers });
  }
}
