import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROJECT, DEFAULT_PROMPTS, createDemoRuns, type OnboardingResearch, type Project } from "./workspace-data";
import { appendResearchReceipt, needsBrandOnboarding, updateProjectProfile } from "./workspace-onboarding";
import { sanitizeWorkspaceSnapshot } from "./workspace-validation";

const snapshot = () => ({ project: DEFAULT_PROJECT, prompts: DEFAULT_PROMPTS, runs: [], done: [], sourceResearch: {} });
const completed = "2026-10-20T12:00:00.000Z";

test("new and untouched example workspaces need setup; established workspaces keep their history", () => {
  assert.equal(needsBrandOnboarding(snapshot()), true);
  assert.equal(needsBrandOnboarding({ ...snapshot(), project: { brand: "", domain: "", competitors: [] }, prompts: [] }), true);
  assert.equal(needsBrandOnboarding({ ...snapshot(), project: { ...DEFAULT_PROJECT, brand: "My brand" } }), false);
  assert.equal(needsBrandOnboarding({ ...snapshot(), prompts: ["My own buyer question"] }), false);
  assert.equal(needsBrandOnboarding({ ...snapshot(), runs: createDemoRuns() }), false);
  assert.equal(needsBrandOnboarding({ ...snapshot(), project: { ...DEFAULT_PROJECT, onboardingCompletedAt: completed } }), false);
});

test("reviewed profile survives backup round trips while unknown credentials are excluded", () => {
  const project = { ...DEFAULT_PROJECT, description: "An API toolkit for builders.", onboardingCompletedAt: completed };
  const saved = sanitizeWorkspaceSnapshot({ ...snapshot(), project: { ...project, token: "PRIVATE" } });
  assert.deepEqual(saved.project, project);
  assert.deepEqual(sanitizeWorkspaceSnapshot(saved), saved);
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE/);
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...snapshot(), project: { ...project, description: "x".repeat(1201) } }));
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...snapshot(), project: { ...project, onboardingCompletedAt: "not a date" } }));
});

test("audits and settings retain onboarding completion without carrying a description to a different brand", () => {
  const original = { ...DEFAULT_PROJECT, description: "Original business", onboardingCompletedAt: completed };
  assert.deepEqual(updateProjectProfile(original, { ...DEFAULT_PROJECT, domain: "https://www.treg.to/about" }), {
    ...DEFAULT_PROJECT, domain: "https://www.treg.to/about", description: original.description, onboardingCompletedAt: completed,
  });
  assert.deepEqual(updateProjectProfile(original, { brand: "Another", domain: "example.com", competitors: [] }), {
    brand: "Another", domain: "example.com", competitors: [], onboardingCompletedAt: completed,
  });
  assert.equal(updateProjectProfile(original, { ...DEFAULT_PROJECT, description: "" }).description, "");
});

const receipt = (id = "research-1"): OnboardingResearch => ({
  kind: "research", url: "https://treg.to/aeo", domain: "treg.to", brand: "Treg",
  input: { url: "https://treg.to/aeo", audience: "Agent builders", market: { country: "US", language: "en" } },
  description: "Tools for builders.", audience: "Agent builders", market: { country: "US", language: "en" },
  competitors: [{ name: "Composio", domain: "composio.dev", reason: "Agent tools", sourceUrl: "https://composio.dev/tools" }],
  questions: ["Which agent tools should I use?", "How do these tools compare?"],
  buyerQuestions: [
    { text: "Which agent tools should I use?", intent: "category", provenance: "generated" },
    { text: "How do these tools compare?", intent: "comparison", provenance: "generated", reason: "Compare alternatives" },
  ],
  sources: [{ title: "Composio tools", url: "https://composio.dev/tools" }],
  totalCostUsd: null, knownCostUsd: 0, costKnown: false,
  errors: [{ step: "research", error: "Charge not yet confirmed." }], callIds: [id], completedAt: completed,
});
const detailedProject = (): Project => ({
  ...DEFAULT_PROJECT, audience: "Agent builders", market: { country: "US", language: "en" },
  competitorDetails: receipt().competitors, buyerQuestions: receipt().buyerQuestions,
  researchReceipts: [receipt()], onboardingCompletedAt: completed,
});

test("reviewed evidence, unselected questions and original receipts survive bounded credential-free backups", () => {
  const project = detailedProject();
  const input = { ...snapshot(), prompts: [receipt().questions[0]], project: {
    ...project, token: "PRIVATE", competitorDetails: project.competitorDetails?.map((item) => ({ ...item, token: "PRIVATE" })),
    buyerQuestions: project.buyerQuestions?.map((item) => ({ ...item, authorization: "PRIVATE" })),
    researchReceipts: [{ ...receipt(), apiKey: "PRIVATE", input: { ...receipt().input, token: "PRIVATE" }, sources: receipt().sources.map((source) => ({ ...source, token: "PRIVATE" })) }],
  } };
  const saved = sanitizeWorkspaceSnapshot(input);
  assert.deepEqual(saved.project, project);
  assert.deepEqual(saved.prompts, [receipt().questions[0]]);
  assert.equal(saved.project.buyerQuestions?.length, 2);
  assert.equal(saved.project.researchReceipts?.[0].questions.length, 2);
  assert.deepEqual(saved.project.researchReceipts?.[0], receipt());
  assert.deepEqual(sanitizeWorkspaceSnapshot(saved), saved);
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE|apiKey|authorization/);
});

test("same-brand updates preserve metadata while changed competitors lose stale evidence and other brands stay separate", () => {
  const previous = detailedProject();
  const same = updateProjectProfile(previous, { ...DEFAULT_PROJECT, competitors: ["Composio", "New rival"] });
  assert.deepEqual(same.researchReceipts, previous.researchReceipts);
  assert.deepEqual(same.buyerQuestions, previous.buyerQuestions);
  assert.equal(same.audience, previous.audience);
  assert.equal(same.competitorDetails?.[0].domain, "composio.dev");
  const removed = updateProjectProfile(previous, { ...DEFAULT_PROJECT, competitors: ["New rival"] });
  assert.deepEqual(removed.competitorDetails, []);
  const changed = updateProjectProfile(previous, { brand: "Different", domain: "different.com", competitors: [] });
  for (const key of ["audience", "market", "competitorDetails", "buyerQuestions"] as const)
    assert.equal(changed[key], undefined);
  assert.deepEqual(changed.researchReceipts, previous.researchReceipts);
});

test("receipt history keeps last five original outcomes and applying one receipt twice is harmless", () => {
  let history: OnboardingResearch[] = [];
  for (let i = 0; i < 7; i++) history = appendResearchReceipt(history, receipt(`call-${i}`));
  assert.equal(history.length, 5);
  assert.deepEqual(history.map((item) => item.callIds[0]), ["call-2", "call-3", "call-4", "call-5", "call-6"]);
  assert.deepEqual(appendResearchReceipt(history, receipt("call-6")), history);
  assert.equal(history[0].costKnown, false);
  assert.equal(history[0].totalCostUsd, null);
});

test("metadata rejects unsupported markets and malformed or oversized imports; unmatched evidence is never verified", () => {
  for (const extra of [
    { audience: "x".repeat(601) }, { market: { country: "GB", language: "en" } },
    { market: { country: "US", language: "en", token: "PRIVATE" } },
    { buyerQuestions: [{ text: "Question?", intent: "invalid", provenance: "manual" }] },
    { buyerQuestions: Array.from({ length: 17 }, (_, i) => ({ text: `${i}?`, intent: "other", provenance: "manual" })) },
    { competitorDetails: [{ name: "Composio", domain: "https://user:secret@composio.dev/" }] },
    ...["lan", "home", "example", "internal", "local"].map((suffix) => ({
      researchReceipts: [{ ...receipt(), sources: [{ title: "Private", url: `http://router.${suffix}/` }] }],
    })),
    { researchReceipts: [{ ...receipt(), input: { url: "http://localhost/", market: { country: "US", language: "en" } } }] },
    { researchReceipts: Array.from({ length: 6 }, () => receipt()) },
    { researchReceipts: [{ ...receipt(), completedAt: "invalid" }] },
    { researchReceipts: [{ ...receipt(), costKnown: false, totalCostUsd: 0 }] },
  ]) assert.throws(() => sanitizeWorkspaceSnapshot({ ...snapshot(), project: { ...detailedProject(), ...extra } }));
  const saved = sanitizeWorkspaceSnapshot({ ...snapshot(), project: {
    ...detailedProject(), competitorDetails: [
      { name: "Composio", domain: "composio.dev", sourceUrl: "https://composio.dev/not-cited" },
      { name: "Removed rival", domain: "rival.com" },
    ],
  } });
  assert.deepEqual(saved.project.competitorDetails, [{ name: "Composio", domain: "composio.dev" }]);
});
