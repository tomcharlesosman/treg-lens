import assert from "node:assert/strict";
import test from "node:test";
import { activePromptTexts, classifyPrompt, cleanPromptRecords, createPromptRecord, editPromptRecord, legacyPromptId, syncPromptRecords, validatePromptRecords } from "./prompt-library";
import type { Project } from "./workspace-data";
const project: Project = { brand: "Treg", domain: "treg.to", competitors: ["Composio"], buyerQuestions: [{ text: "Which toolkit?", intent: "category", provenance: "generated" }] };

test("legacy identities are deterministic, portable and sensitive to exact wording", () => {
  assert.equal(legacyPromptId(" Which toolkit? "), legacyPromptId("Which toolkit?"));
  assert.notEqual(legacyPromptId("Which toolkit?"), legacyPromptId("Which Toolkit?"));
  assert.match(legacyPromptId("Which toolkit?"), /^prompt-[a-f0-9]{32}$/);
});
test("classification finds brand, website and competitors using word boundaries", () => {
  assert.equal(classifyPrompt("How does Treg compare?", project), "branded");
  assert.equal(classifyPrompt("Is composio suitable?", project), "branded");
  assert.equal(classifyPrompt("Does treg.to support APIs?", project), "branded");
  assert.equal(classifyPrompt("What about Tregory?", project), "neutral");
  assert.equal(classifyPrompt("Best toolkit for research?", project), "neutral");
});
test("inventory reconciliation preserves provenance, paused records and historical identities", () => {
  const first = syncPromptRecords(undefined, ["Which toolkit?", "How does Treg compare?"], project);
  assert.equal(first[0].provenance, "generated");
  assert.equal(first[0].intent, "category");
  first[0] = { ...first[0], paused: true, topic: "Research", provenance: "discovered", evidence: { discoveryId: "d1", candidateId: "c1" } };
  const next = syncPromptRecords(first, [], project);
  assert.equal(next[0].archived, false);
  assert.equal(next[0].paused, true);
  assert.equal(next[1].archived, true);
  assert.deepEqual(next[0].evidence, { discoveryId: "d1", candidateId: "c1" });
  assert.deepEqual(activePromptTexts(next), []);
  const restored = syncPromptRecords(next, ["How does Treg compare?"], project);
  assert.equal(restored[1].id, first[1].id);
  assert.equal(restored[1].archived, false);
});
test("wording edits archive original evidence and create manual identities without misattributing discovery", () => {
  const original = { ...createPromptRecord("Which toolkit?", project), provenance: "discovered" as const, evidence: { discoveryId: "d", candidateId: "c" } };
  const next = editPromptRecord([original], original.id, "Which toolkit for agencies?", project);
  assert.equal(next.length, 2);
  assert.equal(next[0].archived, true);
  assert.deepEqual(next[0].evidence, original.evidence);
  assert.equal(next[1].provenance, "manual");
  assert.equal(next[1].evidence, undefined);
  assert.notEqual(next[1].id, original.id);
  assert.deepEqual(activePromptTexts(next), ["Which toolkit for agencies?"]);
  assert.deepEqual(editPromptRecord(next, next[1].id, "Which toolkit for agencies?", project), next);
});
test("duplicate edits are refused and restoring exact historical wording keeps its identity", () => {
  const first = createPromptRecord("Which toolkit?", project), other = createPromptRecord("Other question?", project);
  assert.equal(editPromptRecord([first, other], first.id, "OTHER QUESTION?", project)[0], first);
  const edited = editPromptRecord([first], first.id, "New question?", project);
  const restored = editPromptRecord(edited, edited[1].id, first.text, project);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].id, first.id);
  assert.equal(restored[0].archived, false);
  assert.equal(restored[1].archived, true);
});
test("inventory validation rejects malformed metadata and projections strip arbitrary imported fields", () => {
  const first = createPromptRecord("Which toolkit?", project);
  assert.equal(validatePromptRecords([first]), true);
  for (const invalid of [{ ...first, id: "" }, { ...first, text: "" }, { ...first, kind: "unknown" }, { ...first, topic: "a".repeat(101) }, { ...first, evidence: { discoveryId: "d", candidateId: "" } }]) assert.equal(validatePromptRecords([invalid]), false);
  assert.equal(validatePromptRecords([first, first]), false);
  assert.deepEqual(cleanPromptRecords([{ ...first, token: "private" } as typeof first]), [first]);
});

test("case-only wording edits create a new identity while other active case-insensitive duplicates remain blocked", () => {
  const first = createPromptRecord("Which toolkit?", project);
  const changed = editPromptRecord([first], first.id, "WHICH TOOLKIT?", project);
  assert.equal(changed.length, 2);
  assert.equal(changed[0].archived, true);
  assert.equal(changed[1].text, "WHICH TOOLKIT?");
  assert.notEqual(changed[1].id, first.id);
  const other = createPromptRecord("Other question?", project);
  const existing = [first, other];
  assert.equal(editPromptRecord(existing, first.id, "OTHER QUESTION?", project), existing);
});
