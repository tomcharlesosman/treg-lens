import { assertSameOrigin, aeoErrorResponse } from "@/lib/aeo";
import { authErrorResponse, getTregSession } from "@/lib/treg-auth";
import { TregAuthError, validateSessionSecret } from "@/lib/treg-session";
import { readToolRequest } from "@/lib/source-research";
import { getMonitorState, pauseMonitor, saveMonitor, validateMonitorInput } from "@/lib/monitoring";

const json = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
async function session() {
  const value = await getTregSession();
  if (!value) throw new TregAuthError("Sign in with your Treg key to manage monitoring.", 401);
  return value;
}
function failure(error: unknown) { return error instanceof TregAuthError ? authErrorResponse(error) : aeoErrorResponse(error); }

export async function GET() {
  try { return json(await getMonitorState((await session()).workspaceId)); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const input = validateMonitorInput(await readToolRequest(request));
    const owner = await session();
    return json(await saveMonitor(owner.workspaceId, input, owner.token, validateSessionSecret(process.env.SESSION_SECRET)));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); return json(await pauseMonitor((await session()).workspaceId)); }
  catch (error) { return failure(error); }
}
