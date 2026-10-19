import {
  AeoError,
  aeoErrorResponse,
  readAuditRequest,
  runAudit,
} from "@/lib/aeo";
import { authorizePaidInput, authErrorResponse } from "@/lib/treg-auth";
import { TregAuthError } from "@/lib/treg-session";

export const maxDuration = 300;

// These process-local guards protect a self-hosted instance from accidental
// duplicate spending. A public multi-user deployment should add real auth and
// a shared durable rate limiter before setting a shared server token.
let activeRuns = 0;
const recentRequests = new Map<string, number>();

export async function POST(request: Request) {
  let acquired = false;
  try {
    const input = await authorizePaidInput(await readAuditRequest(request));
    const requester =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    for (const [key, time] of recentRequests)
      if (time < now - 60_000) recentRequests.delete(key);
    if (
      activeRuns >= 3 ||
      (recentRequests.get(requester) ?? 0) > now - 10_000
    ) {
      throw new AeoError(
        "An audit is already running or was just started. Wait a moment before starting another.",
        429,
      );
    }
    recentRequests.set(requester, now);
    activeRuns += 1;
    acquired = true;
    return Response.json(await runAudit(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  } finally {
    if (acquired) activeRuns -= 1;
  }
}
