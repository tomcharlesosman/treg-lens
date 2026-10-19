import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  TregAuthError,
  ownedToken,
  publicSession,
  readSealedTregSession,
  sealTregSession,
  sessionCookieOptions,
  validateSessionSecret,
  validateTregKey,
  type TregSession,
} from "./treg-session";

function secret(): string {
  return validateSessionSecret(process.env.SESSION_SECRET);
}

/** Server-only. Call behind Suspense in pages using Cache Components. */
export async function getTregSession(): Promise<TregSession | null> {
  const sealed = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sealed) return null;
  const session = await readSealedTregSession(sealed, secret());
  if (!session) return null;
  try {
    // Recheck revocation with an authenticated FREE endpoint. A cookie is not
    // proof that the upstream API key still works, and no paid probe is needed.
    await validateTregKey(session.token);
    return session;
  } catch (error) {
    if (
      error instanceof TregAuthError &&
      (error.status === 401 || error.status === 400)
    )
      return null;
    throw error;
  }
}

export async function createTregSession(token: unknown, secure: boolean) {
  const password = secret();
  const validated = await validateTregKey(token);
  const sealed = await sealTregSession(validated, password);
  (await cookies()).set(
    SESSION_COOKIE_NAME,
    sealed,
    sessionCookieOptions(secure),
  );
  const session = await readSealedTregSession(sealed, password);
  return publicSession(session);
}

export async function deleteTregSession(secure: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(secure),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function authorizePaidInput<T extends { token?: string }>(
  input: T,
): Promise<T & { token: string }> {
  // Explicit per-request keys remain supported for API clients. They are checked
  // independently, and never fall back to the site's TREG_TOKEN on failure.
  if (input.token)
    return {
      ...input,
      token: await validateTregKey(ownedToken(input.token, null)),
    };
  return { ...input, token: ownedToken(undefined, await getTregSession()) };
}

export function secureSessionCookie(request: Request): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

export function authErrorResponse(error: unknown): Response {
  const expected =
    error instanceof TregAuthError ||
    (error instanceof Error && error.name === "AeoError" && "status" in error);
  return Response.json(
    {
      error: expected
        ? error.message
        : "Sign-in is temporarily unavailable. Please try again shortly.",
    },
    {
      status: expected ? (error as { status: number }).status : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
