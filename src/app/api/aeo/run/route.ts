import {
  AeoError,
  aeoErrorResponse,
  readAuditRequest,
  runAudit,
} from "@/lib/aeo";
import { authorizePaidInput, authErrorResponse, getTregSession } from "@/lib/treg-auth";
import { TregAuthError, workspaceIdForToken } from "@/lib/treg-session";
import { appendWorkspaceRun } from "@/lib/workspace-repository";

export const maxDuration = 300;

// These process-local guards protect a self-hosted instance from accidental
// duplicate spending alongside per-key authentication. Multi-process operators
// should add a shared limiter; no route may use a shared operator token.
let activeRuns = 0;
const recentRequests = new Map<string, number>();

export async function POST(request: Request) {
  let acquired = false;
  try {
    const parsed = await readAuditRequest(request);
    // The signed-in workspace owns results even when its user deliberately
    // pays with a different in-memory key. API-only callers own their key's
    // namespace. Resolve both identities before starting any paid work.
    const owner = await getTregSession();
    const input = await authorizePaidInput(parsed);
    const savedWorkspaceId = owner?.workspaceId ?? workspaceIdForToken(input.token, process.env.SESSION_SECRET || "");
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
    const auditId = crypto.randomUUID();
    const audit = await runAudit(input);
    let persistence: { saved: boolean; workspaceRevision?: number; workspaceUpdatedAt?: string | null; storageError?: string };
    try {
      const workspace = appendWorkspaceRun(savedWorkspaceId, {
        id: auditId, brand: input.brand, domain: input.domain,
        prompts: input.prompts, competitors: input.competitors, engines: input.engines,
        ...audit,
      });
      persistence = { saved: true, workspaceRevision: workspace.revision, workspaceUpdatedAt: workspace.updatedAt };
    } catch {
      persistence = { saved: false, storageError: "The audit completed, but server storage is unavailable. Export these results before leaving this page; do not rerun the paid audit to save it." };
    }
    return Response.json({ ...audit, auditId, savedWorkspaceId, ...persistence }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  } finally {
    if (acquired) activeRuns -= 1;
  }
}
