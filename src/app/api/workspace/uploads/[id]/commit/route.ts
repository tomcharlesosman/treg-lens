import { commitWorkspaceUpload } from "@/lib/workspace-uploads";
import { workspaceUploadResponse } from "@/lib/workspace-upload-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceUploadResponse(request, async (owner) => commitWorkspaceUpload(owner, (await context.params).id));
}
