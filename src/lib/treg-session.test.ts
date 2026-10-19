import assert from "node:assert/strict";
import test from "node:test";
import { sealData } from "iron-session";
import { assertSameOrigin } from "./aeo";
import {
  SESSION_TTL_SECONDS,
  TregAuthError,
  ownedToken,
  publicSession,
  readSealedTregSession,
  sealTregSession,
  sessionCookieOptions,
  validateLoginToken,
  validateSessionSecret,
  validateTregKey,
  workspaceIdForToken,
} from "./treg-session";

const secret = "test-only-stable-session-encryption-secret-42";
const token = "treg_test_private_credential_never_in_a_response";

test("sessions encrypt the API key and expose only a stable non-secret workspace namespace", async () => {
  const sealed = await sealTregSession(token, secret);
  assert.doesNotMatch(sealed, /treg_test_private|credential_never/);
  const session = await readSealedTregSession(sealed, secret);
  assert.ok(session);
  assert.equal(session.token, token);
  assert.equal(
    session.expiresAt - session.issuedAt,
    SESSION_TTL_SECONDS * 1000,
  );
  const outward = publicSession(session);
  assert.deepEqual(Object.keys(outward).sort(), [
    "authenticated",
    "workspaceId",
  ]);
  assert.equal(outward.authenticated, true);
  assert.equal(outward.workspaceId, workspaceIdForToken(token, secret));
  assert.doesNotMatch(
    JSON.stringify(outward),
    /credential_never|token|issuedAt|expiresAt/,
  );
  assert.equal(
    workspaceIdForToken(token, secret),
    workspaceIdForToken(token, secret),
  );
  assert.notEqual(
    workspaceIdForToken(token, secret),
    workspaceIdForToken(`${token}_other`, secret),
  );
  assert.notEqual(
    workspaceIdForToken(token, secret),
    workspaceIdForToken(token, `${secret}_rotation`),
  );
});

test("tampered, expired, incorrectly shaped, and rotated-key cookies fail closed", async () => {
  const now = Date.now();
  const sealed = await sealTregSession(token, secret, now);
  const changed =
    sealed.slice(0, 30) + (sealed[30] === "A" ? "B" : "A") + sealed.slice(31);
  assert.equal(await readSealedTregSession(changed, secret), null);
  assert.equal(await readSealedTregSession(sealed, `${secret}_rotated`), null);
  assert.equal(
    await readSealedTregSession(
      sealed,
      secret,
      now + SESSION_TTL_SECONDS * 1000 + 1,
    ),
    null,
  );
  assert.equal(await readSealedTregSession(undefined, secret), null);
  assert.equal(await readSealedTregSession("not-a-cookie", secret), null);
  const invalidShape = await sealData(
    {
      token,
      workspaceId: "forged-namespace",
      issuedAt: now,
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
    },
    { password: secret },
  );
  assert.equal(await readSealedTregSession(invalidShape, secret), null);
  const longLived = await sealData(
    {
      token,
      workspaceId: workspaceIdForToken(token, secret),
      issuedAt: now,
      expiresAt: now + SESSION_TTL_SECONDS * 2000,
    },
    { password: secret },
  );
  assert.equal(await readSealedTregSession(longLived, secret), null);
});

test("cookie security options are HttpOnly, host-scoped, SameSite Lax, and limited to 12 hours", () => {
  assert.deepEqual(sessionCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 43200,
  });
  assert.equal(sessionCookieOptions(false).secure, false);
  assert.throws(() => validateSessionSecret(undefined), TregAuthError);
  assert.throws(() => validateSessionSecret("too-short"), TregAuthError);
  assert.throws(() => validateLoginToken("x".repeat(2049)), TregAuthError);
  assert.throws(() => validateLoginToken("header\r\ninjection"), TregAuthError);
  assert.throws(() => validateLoginToken("contains spaces"), TregAuthError);
});

test("real validation uses only a free authenticated metadata endpoint and accepts zero balance", async () => {
  let calls = 0;
  const result = await validateTregKey(token, async (url, init) => {
    calls += 1;
    assert.equal(
      String(url),
      "https://treg.to/catalog/endpoints/cloro.ai-search.chatgpt.scrape/access",
    );
    assert.equal(init?.method, "GET");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Treg-Token"), token);
    assert.equal(headers.get("X-Treg-Org"), null);
    assert.ok(init?.signal);
    return Response.json({
      tier: "platform",
      estimated_cost_usd: 0.0036,
      balance_micro: 0,
    });
  });
  assert.equal(result, token);
  assert.equal(calls, 1);
});

test("invalid or revoked keys and unscoped identity tokens produce actionable safe errors", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      () =>
        validateTregKey(token, async () =>
          Response.json({ token, balance: 100 }, { status }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TregAuthError);
        assert.equal(error.status, 401);
        assert.match(error.message, /invalid, revoked/);
        assert.doesNotMatch(error.message, /credential_never|balance/);
        return true;
      },
    );
  }
  await assert.rejects(
    () =>
      validateTregKey(token, async () =>
        Response.json({ detail: "choose an org" }, { status: 400 }),
      ),
    (error: unknown) =>
      error instanceof TregAuthError &&
      error.status === 400 &&
      /team-scoped/.test(error.message),
  );
});

test("upstream failures, malformed responses and timeouts cannot authenticate a key or leak it", async () => {
  const failing: Array<typeof fetch> = [
    async () => Response.json({ token }, { status: 503 }),
    async () => new Response("<html>upstream unavailable</html>"),
    async () => Response.json({}),
    async () => {
      throw new DOMException(`timeout involving ${token}`, "TimeoutError");
    },
  ];
  for (const fetcher of failing) {
    await assert.rejects(
      () => validateTregKey(token, fetcher),
      (error: unknown) => {
        assert.ok(error instanceof TregAuthError);
        assert.equal(error.status, 503);
        assert.doesNotMatch(error.message, /credential_never|treg_test/);
        return true;
      },
    );
  }
});

test("public API credential selection cannot inherit the operator environment token", async () => {
  const previous = process.env.TREG_TOKEN;
  process.env.TREG_TOKEN = "operator-key-that-must-never-be-used-for-visitors";
  try {
    assert.throws(
      () => ownedToken(undefined, null),
      (error: unknown) =>
        error instanceof TregAuthError && error.status === 401,
    );
    assert.equal(ownedToken(token, null), token);
    const session = await readSealedTregSession(
      await sealTregSession(token, secret),
      secret,
    );
    assert.equal(ownedToken(undefined, session), token);
    assert.deepEqual(publicSession(null), {
      authenticated: false,
      workspaceId: null,
    });
  } finally {
    if (previous === undefined) delete process.env.TREG_TOKEN;
    else process.env.TREG_TOKEN = previous;
  }
});

test("authentication mutations reject cross-origin requests while accepting proxied actual Host", () => {
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://lens.com/api/auth/session", {
          method: "DELETE",
          headers: { origin: "https://evil.com" },
        }),
      ),
    /Cross-origin/,
  );
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
});
