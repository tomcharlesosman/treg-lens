import { abortWorkspaceUpload } from "@/lib/workspace-uploads";
import { workspaceUploadResponse } from "@/lib/workspace-upload-http";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceUploadResponse(request, async (owner) => abortWorkspaceUpload(owner, (await context.params).id));
}
