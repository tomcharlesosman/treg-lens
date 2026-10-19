import { getTregSession, authErrorResponse } from "@/lib/treg-auth";

export async function GET() {
  try {
    return Response.json(
      { configured: Boolean(await getTregSession()) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
