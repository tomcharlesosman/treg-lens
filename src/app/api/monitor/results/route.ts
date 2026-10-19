import { authErrorResponse, getTregSession } from "@/lib/treg-auth";
import { TregAuthError } from "@/lib/treg-session";
import { recoverMonitorRuns } from "@/lib/monitoring";

export async function GET() {
  try {
    const owner = await getTregSession();
    if (!owner) throw new TregAuthError("Sign in to recover your completed monitoring audits.", 401);
    return Response.json({ version: 1, kind: "monitoring-recovery", runs: recoverMonitorRuns(owner.workspaceId) }, {
      headers: { "Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="treg-lens-recovered-audits.json"' },
    });
  } catch (error) { return authErrorResponse(error); }
}
