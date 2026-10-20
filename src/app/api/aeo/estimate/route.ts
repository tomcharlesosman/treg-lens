import { aeoErrorResponse, estimateAudit, readAuditRequest } from "@/lib/aeo";
import { authorizePaidInput, authErrorResponse, getTregSession } from "@/lib/treg-auth";
import { TregAuthError, workspaceIdForToken } from "@/lib/treg-session";
import { getWorkspace } from "@/lib/workspace-repository";
import { followupAuditContext } from "@/lib/audit-context";

export async function POST(request: Request) {
  try {
    const input = await readAuditRequest(request);
    if (input.followupPlanId) {
      const owner = await getTregSession();
      const validated = await authorizePaidInput(input);
      const id = owner?.workspaceId ?? workspaceIdForToken(validated.token, process.env.SESSION_SECRET || "");
      followupAuditContext(input, (await getWorkspace(id)).snapshot);
    }
    return Response.json(await estimateAudit(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  }
}
