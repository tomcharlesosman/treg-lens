import { assertSameOrigin } from "@/lib/aeo";
import { getTregSession, authErrorResponse } from "@/lib/treg-auth";
import { TregAuthError } from "@/lib/treg-session";
import {
  getWorkspace, saveWorkspace, MAX_WORKSPACE_BYTES,
  WorkspaceConflictError, WorkspaceValidationError,
} from "@/lib/workspace-repository";

const headers = { "Cache-Control": "private, no-store" };
class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function session() {
  const value = await getTregSession();
  if (!value) throw new TregAuthError("Sign in with your Treg API key to access this workspace.", 401);
  return value;
}
async function readWorkspaceRequest(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new RequestError("Send the request as JSON.", 415);
  if (Number(request.headers.get("content-length")) > MAX_WORKSPACE_BYTES)
    throw new RequestError("Workspace request is too large (8 MiB maximum).", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_WORKSPACE_BYTES) {
      await reader.cancel();
      throw new RequestError("Workspace request is too large (8 MiB maximum).", 413);
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError("Send a valid JSON workspace request.", 400); }
}
function failure(error: unknown): Response {
  if (error instanceof TregAuthError) return authErrorResponse(error);
  if (error instanceof WorkspaceConflictError)
    return Response.json({ error: error.message, ...error.current }, { status: 409, headers });
  if (error instanceof WorkspaceValidationError || error instanceof RequestError)
    return Response.json({ error: error.message }, { status: error instanceof RequestError ? error.status : 400, headers });
  if (error instanceof Error && error.name === "AeoError" && "status" in error)
    return Response.json({ error: error.message }, { status: Number(error.status), headers });
  return Response.json({ error: "Server workspace storage is unavailable. Your local changes have not been overwritten." }, { status: 503, headers });
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json(getWorkspace((await session()).workspaceId), { headers });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await session();
    const body = await readWorkspaceRequest(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new WorkspaceValidationError();
    const data = body as Record<string, unknown>;
    if (typeof data.revision !== "number") throw new WorkspaceValidationError();
    return Response.json(saveWorkspace(owner.workspaceId, data.snapshot, data.revision), { headers });
  } catch (error) { return failure(error); }
}
