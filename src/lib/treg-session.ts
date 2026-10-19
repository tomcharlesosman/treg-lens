import { createHmac } from "node:crypto";
import { sealData, unsealData } from "iron-session";

export const SESSION_COOKIE_NAME = "treg_lens_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MAX_TOKEN_LENGTH = 2048;

export type TregSession = {
  token: string;
  workspaceId: string;
  issuedAt: number;
  expiresAt: number;
};
export class TregAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TregAuthError";
  }
}

export function validateLoginToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > MAX_TOKEN_LENGTH ||
    !/^[!-~]+$/.test(value.trim())
  ) {
    throw new TregAuthError(
      "Paste a valid Treg team API key, without spaces or line breaks.",
      400,
    );
  }
  return value.trim();
}

export function validateSessionSecret(value: string | undefined): string {
  if (!value || value.trim().length < 32) {
    throw new TregAuthError(
      "Server sign-in is not configured. Set SESSION_SECRET to a stable random value of at least 32 characters.",
      503,
    );
  }
  return value;
}

/** A non-secret, deployment-specific namespace. Never return the API key itself. */
export function workspaceIdForToken(token: string, secret: string): string {
  return `treg_${createHmac("sha256", validateSessionSecret(secret)).update("treg-lens-workspace:").update(token).digest("hex").slice(0, 24)}`;
}

export async function sealTregSession(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const key = validateLoginToken(token);
  const password = validateSessionSecret(secret);
  const data: TregSession = {
    token: key,
    workspaceId: workspaceIdForToken(key, password),
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const sealed = await sealData(data, { password, ttl: SESSION_TTL_SECONDS });
  // Avoid issuing a cookie the browser would silently refuse.
  if (sealed.length > 3800)
    throw new TregAuthError(
      "This API key is too long for a browser session. Use a standard Treg team API key.",
      400,
    );
  return sealed;
}

export async function readSealedTregSession(
  sealed: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<TregSession | null> {
  if (!sealed || sealed.length > 4096) return null;
  try {
    const password = validateSessionSecret(secret);
    const data = await unsealData<Partial<TregSession>>(sealed, {
      password,
      ttl: SESSION_TTL_SECONDS,
    });
    if (
      !data ||
      typeof data.token !== "string" ||
      typeof data.workspaceId !== "string" ||
      typeof data.issuedAt !== "number" ||
      typeof data.expiresAt !== "number" ||
      !Number.isFinite(data.issuedAt) ||
      !Number.isFinite(data.expiresAt) ||
      data.issuedAt > now + 30_000 ||
      data.expiresAt <= now ||
      data.expiresAt > data.issuedAt + SESSION_TTL_SECONDS * 1000 ||
      data.workspaceId !== workspaceIdForToken(data.token, password)
    )
      return null;
    validateLoginToken(data.token);
    return data as TregSession;
  } catch {
    // Tampering, expiry, malformed payloads, and key rotation all fail closed.
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Free authenticated metadata lookup: balance is deliberately irrelevant. */
export async function validateTregKey(
  value: unknown,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const token = validateLoginToken(value);
  let response: Response;
  try {
    response = await fetcher(
      "https://treg.to/catalog/endpoints/cloro.ai-search.chatgpt.scrape/access",
      {
        method: "GET",
        headers: { accept: "application/json", "X-Treg-Token": token },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new TregAuthError(
      "Treg's key validation service is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new TregAuthError(
      "This Treg API key is invalid, revoked, or does not have access. Check the key in your Treg team settings.",
      401,
    );
  if (response.status === 400 || response.status === 422)
    throw new TregAuthError(
      "This key could not select a Treg team. Create a team-scoped API key in Treg and use that key to sign in.",
      400,
    );
  if (!response.ok)
    throw new TregAuthError(
      "Treg's key validation service is temporarily unavailable. Please try again shortly.",
      503,
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TregAuthError(
      "Treg returned an unreadable validation response. Please try again shortly.",
      503,
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).tier !== "string"
  ) {
    throw new TregAuthError(
      "Treg returned an unexpected validation response. Please try again shortly.",
      503,
    );
  }
  return token;
}

/** Pure selection helper: public requests can never inherit an operator key. */
export function ownedToken(
  explicitToken: string | undefined,
  session: TregSession | null,
): string {
  if (explicitToken) return validateLoginToken(explicitToken);
  if (session) return session.token;
  throw new TregAuthError(
    "Sign in with your Treg API key to run this request.",
    401,
  );
}

export function publicSession(session: TregSession | null): {
  authenticated: boolean;
  workspaceId: string | null;
} {
  return {
    authenticated: Boolean(session),
    workspaceId: session?.workspaceId ?? null,
  };
}
