import { expect, test, type APIRequestContext } from "@playwright/test";

const project = { brand: "Treg", domain: "treg.to", competitors: [], onboardingCompletedAt: "2026-10-21T10:00:00Z" };
const snapshot = { project, prompts: ["Best toolkit?"], runs: [], done: [], sourceResearch: {} };
const continuity = { version: 1, dismissed: [{ brand: { name: "Treg", domain: "treg.to" }, stepId: "first-audit", dismissedAt: "2026-10-21T12:00:00Z" }] };
const headers = (cookie: string) => ({ cookie, "x-forwarded-for": crypto.randomUUID() });
async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/session", { data: { token: `treg-e2e-continuity-${crypto.randomUUID()}` }, headers: headers("") });
  expect(response.status()).toBe(200);
  return response.headers()["set-cookie"].split(";")[0];
}
test("continuity persists with workspace CAS, strips unknown fields and remains key isolated", async ({ request }) => {
  const cookie = await login(request), other = await login(request);
  const response = await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 0, snapshot: { ...snapshot, continuity: { ...continuity, token: "DO-NOT-PERSIST", dismissed: continuity.dismissed.map((entry) => ({ ...entry, credentials: "DO-NOT-PERSIST", brand: { ...entry.brand, apiKey: "DO-NOT-PERSIST" } })) } } } });
  expect(response.status(), await response.text()).toBe(200);
  const saved = await response.json();
  expect(saved.snapshot.continuity).toEqual(continuity); expect(JSON.stringify(saved)).not.toContain("DO-NOT-PERSIST");
  const stale = await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 0, snapshot: { ...snapshot, continuity: { version: 1, dismissed: [] } } } });
  expect(stale.status()).toBe(409);
  expect((await (await request.get("/api/workspace", { headers: headers(cookie) })).json()).snapshot.continuity).toEqual(continuity);
  expect((await (await request.get("/api/workspace", { headers: headers(other) })).json()).snapshot).toBeNull();
});
test("invalid continuity cannot overwrite saved work and legacy snapshots remain supported", async ({ request }) => {
  const cookie = await login(request);
  expect((await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 0, snapshot } })).status()).toBe(200);
  for (const invalid of [null, { version: 2, dismissed: [] }, { version: 1, dismissed: [continuity.dismissed[0], continuity.dismissed[0]] }, { version: 1, dismissed: [{ ...continuity.dismissed[0], dismissedAt: "invalid" }] }, { version: 1, dismissed: Array.from({ length: 129 }, (_, index) => ({ ...continuity.dismissed[0], stepId: String(index) })) }]) {
    const response = await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 1, snapshot: { ...snapshot, continuity: invalid } } });
    expect(response.status(), await response.text()).toBe(400);
  }
  const saved = await (await request.get("/api/workspace", { headers: headers(cookie) })).json();
  expect(saved.revision).toBe(1); expect(saved.snapshot.continuity).toBeUndefined();
});
test("a deliberate full snapshot restore retains preferences for multiple historical brands", async ({ request }) => {
  const cookie = await login(request);
  const preferences = { version: 1, dismissed: [...continuity.dismissed, { ...continuity.dismissed[0], brand: { name: "Treg", domain: "other.example" } }] };
  const initial = await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 0, snapshot: { ...snapshot, continuity: preferences } } });
  expect(initial.status()).toBe(200);
  const backup = (await initial.json()).snapshot;
  expect((await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 1, snapshot: { ...backup, continuity: { version: 1, dismissed: [] } } } })).status()).toBe(200);
  expect((await request.put("/api/workspace", { headers: headers(cookie), data: { revision: 2, snapshot: backup } })).status()).toBe(200);
  expect((await (await request.get("/api/workspace", { headers: headers(cookie) })).json()).snapshot.continuity).toEqual(preferences);
});
