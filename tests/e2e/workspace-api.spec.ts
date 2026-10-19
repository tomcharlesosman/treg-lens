import { test, expect, type APIRequestContext } from "@playwright/test";

const snapshot = () => ({
  project: { brand: "Treg", domain: "treg.to", competitors: ["Composio"] },
  prompts: ["Which toolkit should I use?"], runs: [], done: [], sourceResearch: {},
});
async function login(request: APIRequestContext, token = `treg-e2e-workspace-${crypto.randomUUID()}`) {
  const response = await request.post("/api/auth/session", { data: { token }, headers: { "x-forwarded-for": crypto.randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return { token, cookie: response.headers()["set-cookie"].split(";")[0] };
}
const headers = (cookie: string) => ({ cookie, "x-forwarded-for": crypto.randomUUID() });

test("durable workspace API denies anonymous users and explicit-token shortcuts", async ({ request }) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect((await request.put("/api/workspace", { data: { snapshot: snapshot(), revision: 0, token: "treg-e2e-primary" } })).status()).toBe(401);
});

test("server snapshots survive sessions, sanitize metadata, and isolate keys", async ({ request }) => {
  const first = await login(request);
  const empty = await request.get("/api/workspace", { headers: headers(first.cookie) });
  expect(await empty.json()).toEqual({ snapshot: null, revision: 0, updatedAt: null });
  expect(empty.headers()["cache-control"]).toContain("no-store");
  const draft = { ...snapshot(), token: "PRIVATE-KEY", project: { ...snapshot().project, token: "PRIVATE-KEY" } };
  const saved = await request.put("/api/workspace", { data: { snapshot: draft, revision: 0 }, headers: headers(first.cookie) });
  expect(saved.status()).toBe(200);
  const body = await saved.json();
  expect(body).toMatchObject({ snapshot: snapshot(), revision: 1, updatedAt: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain("PRIVATE-KEY");
  const sameKey = await login(request, first.token);
  expect(await (await request.get("/api/workspace", { headers: headers(sameKey.cookie) })).json()).toEqual(body);
  const differentKey = await login(request);
  expect(await (await request.get("/api/workspace", { headers: headers(differentKey.cookie) })).json()).toEqual({ snapshot: null, revision: 0, updatedAt: null });
});

test("stale and concurrent saves expose the current snapshot without silent overwrite", async ({ request }) => {
  const user = await login(request);
  await request.put("/api/workspace", { data: { snapshot: snapshot(), revision: 0 }, headers: headers(user.cookie) });
  const drafts = ["First browser", "Second browser"].map((brand) => ({ ...snapshot(), project: { ...snapshot().project, brand } }));
  const responses = await Promise.all(drafts.map((draft) => request.put("/api/workspace", { data: { snapshot: draft, revision: 1 }, headers: headers(user.cookie) })));
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const winner = await responses.find((response) => response.status() === 200)!.json();
  const conflict = await responses.find((response) => response.status() === 409)!.json();
  expect(conflict).toMatchObject({ ...winner, error: expect.stringMatching(/changed on the server/) });
  expect(await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json()).toEqual(winner);
});

test("workspace writes validate revisions, schema, origins, content and body bounds", async ({ request }) => {
  const user = await login(request);
  for (const revision of [-1, 0.5, "0", null]) {
    const response = await request.put("/api/workspace", { data: { snapshot: snapshot(), revision }, headers: headers(user.cookie) });
    expect(response.status()).toBe(400);
  }
  expect((await request.put("/api/workspace", { data: { snapshot: { project: {} }, revision: 0 }, headers: headers(user.cookie) })).status()).toBe(400);
  for (const method of ["GET", "PUT"]) {
    const response = await request.fetch("/api/workspace", { method, ...(method === "PUT" ? { data: { snapshot: snapshot(), revision: 0 } } : {}), headers: { ...headers(user.cookie), origin: "https://attacker.example" } });
    expect(response.status()).toBe(403);
  }
  expect((await request.put("/api/workspace", { data: "{}", headers: { ...headers(user.cookie), "content-type": "text/plain" } })).status()).toBe(415);
  expect((await request.put("/api/workspace", { data: Buffer.from("{broken"), headers: { ...headers(user.cookie), "content-type": "application/json" } })).status()).toBe(400);
  expect((await request.put("/api/workspace", { data: Buffer.from(JSON.stringify({ padding: "x".repeat(8 * 1024 * 1024 + 4096) })), headers: { ...headers(user.cookie), "content-type": "application/json" } })).status()).toBe(413);
  expect((await request.post("/api/workspace", { data: {}, headers: headers(user.cookie) })).status()).toBe(405);
});

test("a completed audit is durably appended and protected from a stale browser write", async ({ request }) => {
  const user = await login(request);
  const input = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], prompts: ["Which toolkit?"], engines: ["chatgpt"] };
  const response = await request.post("/api/aeo/run", { data: input, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const audit = await response.json();
  expect(audit).toMatchObject({ saved: true, auditId: expect.any(String), workspaceRevision: 1 });
  const workspace = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(workspace.snapshot.runs).toHaveLength(1);
  expect(workspace.snapshot.runs[0]).toMatchObject({ id: audit.auditId, brand: "Treg", results: audit.results });
  expect(JSON.stringify(workspace)).not.toContain(user.token);
  const stale = await request.put("/api/workspace", { data: { snapshot: snapshot(), revision: 0 }, headers: headers(user.cookie) });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).snapshot.runs[0].id).toBe(audit.auditId);
});

test("an in-memory paying-key override keeps results in the signed-in workspace", async ({ request }) => {
  const paying = await login(request);
  const owner = await login(request);
  const input = { brand: "Treg", domain: "treg.to", competitors: [], prompts: ["Which toolkit?"], engines: ["chatgpt"], token: paying.token };
  const response = await request.post("/api/aeo/run", { data: input, headers: headers(owner.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const audit = await response.json();
  expect(audit.saved).toBe(true);
  const owned = await (await request.get("/api/workspace", { headers: headers(owner.cookie) })).json();
  const other = await (await request.get("/api/workspace", { headers: headers(paying.cookie) })).json();
  expect(owned.snapshot.runs[0].id).toBe(audit.auditId);
  expect(other).toEqual({ snapshot: null, revision: 0, updatedAt: null });
});

test("an API-only explicit key saves into that key's namespace", async ({ request }) => {
  const token = `treg-e2e-workspace-api-only-${crypto.randomUUID()}`;
  const input = { brand: "Treg", domain: "treg.to", competitors: [], prompts: ["Which toolkit?"], engines: ["chatgpt"], token };
  const response = await request.post("/api/aeo/run", { data: input, headers: { "x-forwarded-for": crypto.randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  const audit = await response.json();
  expect(audit.saved).toBe(true);
  const owner = await login(request, token);
  const workspace = await (await request.get("/api/workspace", { headers: headers(owner.cookie) })).json();
  expect(workspace.snapshot.runs[0].id).toBe(audit.auditId);
});

test("storage refusal retains paid results in the response without inviting a provider retry", async ({ request }) => {
  const user = await login(request);
  const full = { ...snapshot(), prompts: ["x".repeat(8 * 1024 * 1024 - 256)] };
  const saved = await request.put("/api/workspace", { data: { snapshot: full, revision: 0 }, headers: headers(user.cookie) });
  expect(saved.status(), await saved.text()).toBe(200);
  const response = await request.post("/api/aeo/run", { data: { brand: "Treg", domain: "treg.to", competitors: [], prompts: ["Which toolkit?"], engines: ["chatgpt"] }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const audit = await response.json();
  expect(audit.saved).toBe(false);
  expect(audit.results).toHaveLength(1);
  expect(audit.storageError).toMatch(/audit completed.*do not rerun/i);
  const current = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(current.revision).toBe(1);
  expect(current.snapshot.runs).toEqual([]);
});

test("pending source reservations are unknown charges without fabricated completed evidence", async ({ request }) => {
  const user = await login(request);
  const response = await request.post("/api/aeo/source", {
    data: { brand: "Treg", url: "https://example.com/research?status=[pending]" },
    headers: headers(user.cookie),
  });
  expect(response.status(), await response.text()).toBe(200);
  const research = await response.json();
  expect(research).toMatchObject({ kind: "research", costKnown: false, totalCostUsd: null, knownCostUsd: 0, brandMentioned: null, excerpt: null });
  expect(research.errors).toHaveLength(2);
  expect(research.errors.every((issue: { error: string }) => /still processing.*not a settled charge/i.test(issue.error))).toBe(true);
  expect(research.callIds).toHaveLength(2);
  expect(JSON.stringify(research)).not.toContain(user.token);
});
