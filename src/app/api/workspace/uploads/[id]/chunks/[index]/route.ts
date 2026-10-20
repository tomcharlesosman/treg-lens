import { putWorkspaceUploadChunk, WORKSPACE_UPLOAD_CHUNK_BYTES, WorkspaceUploadError } from "@/lib/workspace-uploads";
import { readUploadBody, workspaceUploadResponse } from "@/lib/workspace-upload-http";

export async function PUT(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  return workspaceUploadResponse(request, async (owner) => {
    const { id, index } = await context.params;
    if (!/^(?:0|[1-9]\d*)$/.test(index)) throw new WorkspaceUploadError("Invalid workspace chunk index.");
    return putWorkspaceUploadChunk(owner, id, Number(index), await readUploadBody(request, WORKSPACE_UPLOAD_CHUNK_BYTES, "application/octet-stream"));
  });
}
