import { expect, test, type APIRequestContext } from "@playwright/test";
import { createPromptRecord } from "../../src/lib/prompt-library";

const project = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], competitorDetails: [{ name: "Composio", domain: "composio.dev" }] };
const prompts = ["Which research tools suit agencies?"];
async function login(request: APIRequestContext, token = `treg-e2e-research-${crypto.randomUUID()}`) {
  const response = await request.post("/api/auth/session", { data: { token }, headers: { "x-forwarded-for": crypto.randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return { token, cookie: response.headers()["set-cookie"].split(";")[0], ...(await response.json()) };
}
const headers = (cookie: string) => ({ cookie, "x-forwarded-for": crypto.randomUUID() });

test("paid audit freezes reviewed prompt and competitor identities, and backup-shaped saves retain them", async ({ request }) => {
  const user = await login(request);
  const record = { ...createPromptRecord(prompts[0], project), id: "reviewed-prompt-one", topic: "Agency research" };
  const initial = { project, prompts, promptRecords: [record], runs: [], done: [], sourceResearch: {} };
  expect((await request.put("/api/workspace", { data: { snapshot: initial, revision: 0 }, headers: headers(user.cookie) })).status()).toBe(200);
  const response = await request.post("/api/aeo/run", { data: { ...project, prompts, engines: ["chatgpt"], maxCostUsd: 0.1 }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const audit = await response.json();
  expect(audit.saved).toBe(true);
  expect(audit.measurement.prompts).toEqual([{ id: record.id, text: prompts[0], kind: "neutral" }]);
  expect(audit.competitorDetails).toEqual(project.competitorDetails);
  const saved = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(saved.snapshot.runs[0].measurement).toEqual(audit.measurement);
  const restored = await request.put("/api/workspace", { data: { snapshot: { ...saved.snapshot, project: { ...project, competitorDetails: [{ name: "Composio", domain: "different-domain.com" }] } }, revision: saved.revision }, headers: headers(user.cookie) });
  expect(restored.status(), await restored.text()).toBe(200);
  const changed = await restored.json();
  expect(changed.snapshot.runs[0].competitorDetails).toEqual(project.competitorDetails);
  expect(changed.snapshot.promptRecords).toEqual([record]);
  const inconsistent = structuredClone(changed.snapshot);
  inconsistent.runs[0].measurement.brand.domain = "unrelated.com";
  expect((await request.put("/api/workspace", { data: { snapshot: inconsistent, revision: changed.revision }, headers: headers(user.cookie) })).status()).toBe(400);
  expect((await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json()).revision).toBe(changed.revision);
});

test("discovery evidence belongs to the signed-in workspace even with an explicit alternate paying key", async ({ request }) => {
  const user = await login(request);
  const paying = `treg-e2e-research-paying-${crypto.randomUUID()}`;
  const response = await request.post("/api/aeo/discover", { data: { brand: project.brand, domain: project.domain, seeds: ["Agency research", "Research tools"], maxCostUsd: 0.1, token: paying }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(200);
  const discovery = await response.json();
  expect(discovery.saved).toBe(true);
  expect(discovery.savedWorkspaceId).toBe(user.workspaceId);
  const saved = await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json();
  expect(saved.snapshot.discoveryResearch).toEqual([discovery.savedReceipt]);
  expect(saved.snapshot.discoveryResearch[0].result.callIds.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).not.toContain(paying);
  const alternate = await login(request, paying);
  expect((await (await request.get("/api/workspace", { headers: headers(alternate.cookie) })).json()).snapshot).toBeNull();
});

test("discovery refuses an increased price beyond the accepted ceiling without storing a paid receipt", async ({ request }) => {
  const user = await login(request);
  const response = await request.post("/api/aeo/discover", { data: { brand: project.brand, seeds: ["Agency research", "Research tools"], maxCostUsd: 0 }, headers: headers(user.cookie) });
  expect(response.status(), await response.text()).toBe(409);
  expect((await response.json()).error).toMatch(/above|increased|exceed/i);
  expect(await (await request.get("/api/workspace", { headers: headers(user.cookie) })).json()).toMatchObject({ snapshot: null, revision: 0 });
});
