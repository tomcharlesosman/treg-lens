import { AeoError, aeoErrorResponse } from "@/lib/aeo";
import {
  estimateDiscovery,
  runDiscovery,
  validateDiscoveryInput,
} from "@/lib/discovery";
import { readToolRequest } from "@/lib/source-research";
import { authorizePaidInput, authErrorResponse } from "@/lib/treg-auth";
import { TregAuthError } from "@/lib/treg-session";

export const maxDuration = 300;
let activeRuns = 0;
const recentRequests = new Map<string, number>();

export async function POST(request: Request) {
  let acquired = false;
  try {
    const parsed = validateDiscoveryInput(await readToolRequest(request));
    if (parsed.estimateOnly)
      return Response.json(await estimateDiscovery(parsed), {
        headers: { "Cache-Control": "no-store" },
      });
    const input = await authorizePaidInput(parsed);
    const requester =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    for (const [key, time] of recentRequests)
      if (time < now - 60_000) recentRequests.delete(key);
    if (activeRuns >= 3 || (recentRequests.get(requester) ?? 0) > now - 10_000)
      throw new AeoError(
        "Discovery is already running or was just started. Wait a moment before starting another.",
        429,
      );
    recentRequests.set(requester, now);
    activeRuns += 1;
    acquired = true;
    return Response.json(await runDiscovery(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  } finally {
    if (acquired) activeRuns -= 1;
  }
}
