import { beginWorkspaceUpload, WorkspaceUploadError } from "@/lib/workspace-uploads";
import { readUploadBody, workspaceUploadResponse } from "@/lib/workspace-upload-http";

export async function POST(request: Request) {
  return workspaceUploadResponse(request, async (owner) => {
    const bytes = await readUploadBody(request, 4096, "application/json");
    let manifest: unknown;
    try { manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new WorkspaceUploadError("Send a valid JSON upload manifest."); }
    return beginWorkspaceUpload(owner, manifest);
  });
}
