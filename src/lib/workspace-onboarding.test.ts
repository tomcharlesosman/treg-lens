import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROJECT, DEFAULT_PROMPTS, createDemoRuns } from "./workspace-data";
import { needsBrandOnboarding, updateProjectProfile } from "./workspace-onboarding";
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
