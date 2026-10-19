import { aeoErrorResponse, estimateAudit, readAuditRequest } from "@/lib/aeo";

export async function POST(request: Request) {
  try {
    const input = await readAuditRequest(request);
    return Response.json(await estimateAudit(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return aeoErrorResponse(error);
  }
}
