import { assertSameOrigin } from "@/lib/aeo";
import { readToolRequest } from "@/lib/source-research";
import {
  authErrorResponse,
  createTregSession,
  deleteTregSession,
  getTregSession,
  secureSessionCookie,
} from "@/lib/treg-auth";
import { TregAuthError, publicSession } from "@/lib/treg-session";

export const maxDuration = 30;
const attempts = new Map<string, { count: number; started: number }>();

export async function POST(request: Request) {
  try {
    const body = await readToolRequest(request);
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.started < now - 5 * 60_000) attempts.delete(key);
    const address =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const attempt = attempts.get(address) ?? { count: 0, started: now };
    if (attempt.count >= 20)
      throw new TregAuthError(
        "Too many sign-in attempts. Wait a few minutes before trying again.",
        429,
      );
    attempts.set(address, { ...attempt, count: attempt.count + 1 });
    const token =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).token
        : undefined;
    const session = await createTregSession(
      token,
      secureSessionCookie(request),
    );
    return Response.json(session, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function GET() {
  try {
    return Response.json(publicSession(await getTregSession()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteTregSession(secureSessionCookie(request));
    return Response.json(
      { authenticated: false, workspaceId: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
