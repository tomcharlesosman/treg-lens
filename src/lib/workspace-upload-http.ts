import { assertSameOrigin } from "./aeo";
import { authErrorResponse, getTregSession } from "./treg-auth";
import { TregAuthError } from "./treg-session";
import { WorkspaceConflictError, WorkspaceValidationError } from "./workspace-repository";
import { WorkspaceUploadError } from "./workspace-uploads";
import { streamJson } from "./stream-json";

const headers = { "Cache-Control": "private, no-store" };
export async function workspaceUploadResponse(request: Request, operation: (owner: string) => Promise<unknown>): Promise<Response> {
  try {
    assertSameOrigin(request);
    const owner = await getTregSession();
    if (!owner) throw new TregAuthError("Sign in with your Treg API key to save this workspace.", 401);
    return streamJson(await operation(owner.workspaceId), { headers });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    if (error instanceof WorkspaceConflictError) return streamJson({ error: error.message, ...error.current }, { status: 409, headers });
    if (error instanceof WorkspaceUploadError || error instanceof WorkspaceValidationError) return Response.json({ error: error.message }, { status: error instanceof WorkspaceUploadError ? error.status : 400, headers });
    if (error instanceof Error && error.name === "AeoError" && "status" in error) return Response.json({ error: error.message }, { status: Number(error.status), headers });
    return Response.json({ error: "Workspace storage is unavailable. Your local changes are retained." }, { status: 503, headers });
  }
}
export async function readUploadBody(request: Request, limit: number, contentType: string): Promise<Buffer> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith(contentType)) throw new WorkspaceUploadError(`Send this request as ${contentType}.`, 415);
  if (Number(request.headers.get("content-length")) > limit) throw new WorkspaceUploadError("Workspace upload request exceeds its size limit.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (reader) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new WorkspaceUploadError("Workspace upload request exceeds its size limit.", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
