import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDiscovery } from "./discovery-workspace";
import type { SavedDiscovery } from "./discovery-research";
import { sanitizeWorkspaceSnapshot } from "./workspace-validation";
import { buildMeasurementScope } from "./measurement";
import type { WorkspaceSnapshot } from "./workspace-storage";

const receiptFixture = (): SavedDiscovery => ({
  id: "receipt-one", input: { brand: "Acme", domain: "acme.com", seeds: ["Agency software", "Research tools"] },
  estimate: { currency: "USD", totalCostUsd: 0.01, maxCalls: 5, breakdown: [], note: "Fixture", pricedAt: "2026-10-20T12:00:00Z" },
  result: { candidates: [{ id: "candidate-one", text: "Which tools suit agencies?", kind: "question", origin: "People Also Ask", seed: "Agency software", keyword: "Research tools", searchVolume: null, provider: "cloro" }], keywordCount: 0, questionCount: 1, totalCostUsd: 0, totalCostKnown: false, reservedCostUsd: 0.01, errors: [], completedAt: "2026-10-20T12:00:00Z", locale: { country: "US", language: "en" }, callIds: ["call-one"] },
  selectedCandidateIds: [],
});
const snapshot = (): WorkspaceSnapshot => ({ project: { brand: "Acme", domain: "acme.com", competitors: [] }, prompts: ["Existing question"], runs: [], done: ["kept"], sourceResearch: {} });

test("import keeps original paid research and selected provenance in the same restorable snapshot", () => {
  const receipt = receiptFixture();
  const saved = applyDiscovery(snapshot(), receipt);
  assert.deepEqual(saved.prompts, ["Existing question"]);
  const imported = sanitizeWorkspaceSnapshot(applyDiscovery(saved, receipt, ["candidate-one"]));
  assert.deepEqual(imported.prompts, ["Existing question", "Which tools suit agencies?"]);
  assert.deepEqual(imported.done, ["kept"]);
  assert.deepEqual(imported.discoveryResearch?.[0].result, receipt.result);
  assert.deepEqual(imported.promptRecords?.find((item) => item.text === "Which tools suit agencies?")?.evidence, { discoveryId: receipt.id, candidateId: "candidate-one" });
  assert.equal(imported.promptRecords?.find((item) => item.text === "Which tools suit agencies?")?.provenance, "discovered");
  assert.deepEqual(applyDiscovery(imported, receipt, ["candidate-one"]), imported);
});

test("reopening an existing receipt cannot replace its original evidence or import into another brand", () => {
  const receipt = receiptFixture();
  const saved = applyDiscovery(snapshot(), receipt);
  assert.deepEqual(applyDiscovery(saved, { ...receipt, result: { ...receipt.result, totalCostKnown: true, totalCostUsd: 0.02 } }).discoveryResearch?.[0].result, receipt.result);
  assert.throws(() => applyDiscovery(saved, receipt, ["not-a-candidate"]), /Choose up to/);
  assert.throws(() => applyDiscovery({ ...saved, project: { ...saved.project, brand: "Another" } }, receipt, ["candidate-one"]), /Return to/);
});

test("new metadata strips nested credentials and rejects inconsistent measurement scope without changing legacy snapshots", () => {
  const legacy = snapshot();
  assert.deepEqual(sanitizeWorkspaceSnapshot(legacy), legacy);
  const imported = applyDiscovery(legacy, receiptFixture(), ["candidate-one"]);
  const scope = buildMeasurementScope({ ...legacy.project, prompts: ["Existing question"], engines: ["chatgpt"] });
  const run = { id: "run-one", ...legacy.project, prompts: ["Existing question"], engines: ["chatgpt"], measurement: scope, results: [], errors: [], totalCostUsd: 0, completedAt: "2026-10-20T12:00:00Z" };
  const clean = sanitizeWorkspaceSnapshot({ ...imported, promptRecords: imported.promptRecords?.map((item) => ({ ...item, token: "PRIVATE" })), discoveryResearch: [{ ...receiptFixture(), input: { ...receiptFixture().input, token: "PRIVATE" } }], runs: [{ ...run, measurement: { ...scope, brand: { ...scope.brand, token: "PRIVATE" } } }] });
  assert.doesNotMatch(JSON.stringify(clean), /PRIVATE|token/);
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...legacy, runs: [{ ...run, domain: "different.com" }] }), /valid workspace/);
  assert.throws(() => sanitizeWorkspaceSnapshot({ ...legacy, runs: [{ ...run, prompts: ["Unrelated question"] }] }), /valid workspace/);
});
