import { AeoError, aeoErrorResponse } from "@/lib/aeo";
import {
  estimateDiscovery,
  runDiscovery,
  validateDiscoveryInput,
} from "@/lib/discovery";
import { readToolRequest } from "@/lib/source-research";
import { authorizePaidInput, authErrorResponse, getTregSession } from "@/lib/treg-auth";
import { TregAuthError, workspaceIdForToken } from "@/lib/treg-session";
import { appendWorkspaceDiscovery, getWorkspace } from "@/lib/workspace-repository";
import { createSavedDiscovery } from "@/lib/discovery-research";

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
    const owner = await getTregSession();
    const input = await authorizePaidInput(parsed);
    const savedWorkspaceId = owner?.workspaceId ?? workspaceIdForToken(input.token, process.env.SESSION_SECRET || "");
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
    const original = await getWorkspace(savedWorkspaceId).catch(() => null);
    const sameBrand = original?.snapshot?.project.brand.toLowerCase() === input.brand.toLowerCase();
    const previousDomain = sameBrand ? original?.snapshot?.project.domain ?? "" : "";
    // Old snapshots allowed arbitrary domain strings. Never discover an invalid
    // receipt context only after the user's provider calls have been charged.
    const domain = input.domain ?? (previousDomain.length <= 253 && !/[\u0000-\u001f\u007f]/.test(previousDomain) ? previousDomain : "");
    const result = await runDiscovery(input);
    const estimate = result.acceptedEstimate;
    if (!estimate) throw new Error("Discovery did not retain its accepted estimate.");
    const savedReceipt = createSavedDiscovery({ brand: input.brand, domain }, input.seeds, estimate, result);
    let persistence: { saved: boolean; storageError?: string };
    try {
      await appendWorkspaceDiscovery(savedWorkspaceId, savedReceipt);
      persistence = { saved: true };
    } catch {
      persistence = { saved: false, storageError: "Research completed but server storage is unavailable. Keep or export this receipt; do not repeat the paid research to save it." };
    }
    return Response.json({ ...result, savedReceipt, savedWorkspaceId, ...persistence }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  } finally {
    if (acquired) activeRuns -= 1;
  }
}
