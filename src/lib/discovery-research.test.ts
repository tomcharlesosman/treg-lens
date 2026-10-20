import assert from "node:assert/strict";
import test from "node:test";
import { createSavedDiscovery, MAX_DISCOVERY_RESEARCH, parseDiscoveryResearch, parseSavedDiscovery, suggestedDiscoverySeeds } from "./discovery-research";
import type { DiscoveryEstimate, DiscoveryResult } from "./discovery";

const estimate: DiscoveryEstimate = { currency: "USD", totalCostUsd: 0.01, maxCalls: 5, pricedAt: "2026-10-20T12:00:00Z", note: "US English; up to five calls.", breakdown: [{ label: "Keyword ideas", endpointId: "treg.google.keywords.ideas", calls: 2, costPerCallUsd: 0.001, subtotalUsd: 0.002 }, { label: "People Also Ask", endpointId: "cloro.google.serp.organic", calls: 3, costPerCallUsd: 0.002, subtotalUsd: 0.006 }] };
const result: DiscoveryResult = { candidates: [{ id: "question-1", text: "What should I consider when buying a bicycle?", kind: "question", origin: "People Also Ask", seed: "city bicycles", keyword: "city bicycles comparison", searchVolume: null, provider: "cloro" }, { id: "keyword-1", text: "commuter bicycles", kind: "keyword", origin: "Keyword idea", seed: "city bicycles", keyword: "commuter bicycles", searchVolume: 1200, provider: "anyapi" }], keywordCount: 1, questionCount: 1, totalCostUsd: 0.004, totalCostKnown: false, reservedCostUsd: 0.002, errors: [{ stage: "questions", seed: "bicycle prices", error: "A request is pending." }], callIds: ["fixture-call-1"], completedAt: "2026-10-20T12:01:00Z", locale: { country: "US", language: "en" } };
const receipt = () => createSavedDiscovery({ brand: "City Cycles", domain: "citycycles.example" }, ["city bicycles", "commuter bikes"], estimate, result);

test("discovery defaults use the reviewed business and stay empty without context", () => {
  assert.deepEqual(suggestedDiscoverySeeds({ brand: "Dentist", domain: "dentist.example", competitors: [] }), ["", ""]);
  assert.deepEqual(suggestedDiscoverySeeds({ brand: "Dentist", domain: "dentist.example", competitors: [], buyerQuestions: [{ text: "A retained older tracked question?", intent: "other", provenance: "manual" }, { text: "Which dentist treats nervous patients?", intent: "use-case", provenance: "generated" }, { text: "What does an implant cost?", intent: "purchase", provenance: "manual" }] }), ["Which dentist treats nervous patients?", "What does an implant cost?"]);
  assert.deepEqual(suggestedDiscoverySeeds({ brand: "City Cycles", domain: "citycycles.example", competitors: [], description: "Commuter bicycles. Local servicing.", audience: "City commuters" }), ["Commuter bicycles", "City commuters"]);
  assert.deepEqual(suggestedDiscoverySeeds({ brand: "City Cycles", domain: "citycycles.example", competitors: [], buyerQuestions: [{ text: "City Cycles pricing?", intent: "branded", provenance: "manual" }], description: "Bicycle servicing", audience: "BICYCLE SERVICING" }), ["Bicycle servicing", ""]);
});

test("original discovery receipts retain provenance, partial errors, unknown billing and call IDs", () => {
  const saved = receipt();
  assert.deepEqual(saved.result, result);
  assert.deepEqual(saved.estimate, estimate);
  assert.equal(saved.input.domain, "citycycles.example");
  assert.deepEqual(saved.selectedCandidateIds, []);
  assert.deepEqual(parseSavedDiscovery(JSON.parse(JSON.stringify(saved))), saved);
  const highVolume = structuredClone(saved);
  highVolume.result.candidates[1].searchVolume = 12_500_000;
  highVolume.result.totalCostUsd = 2_000_000; // Retain even anomalous reported billing for inspection.
  assert.equal(parseSavedDiscovery(highVolume)?.result.candidates[1].searchVolume, 12_500_000);
  assert.equal(parseSavedDiscovery(highVolume)?.result.totalCostUsd, 2_000_000);
  const legacy = structuredClone(saved) as unknown as { result: { callIds?: string[] } };
  delete legacy.result.callIds;
  assert.deepEqual(parseSavedDiscovery(legacy)?.result.callIds, []);
});

test("discovery parser whitelists data and refuses invalid selections or fabricated PAA volume", () => {
  const saved = receipt();
  assert.deepEqual(parseSavedDiscovery({ ...saved, token: "secret", input: { ...saved.input, token: "secret" }, result: { ...saved.result, apiKey: "secret" } }), saved);
  assert.equal(parseSavedDiscovery({ ...saved, selectedCandidateIds: ["missing"] }), null);
  assert.equal(parseSavedDiscovery({ ...saved, selectedCandidateIds: ["question-1", "question-1"] }), null);
  assert.equal(parseSavedDiscovery({ ...saved, result: { ...result, candidates: [{ ...result.candidates[0], searchVolume: 1200 }, result.candidates[1]] } }), null);
  assert.equal(parseSavedDiscovery({ ...saved, result: { ...result, questionCount: 2 } }), null);
  assert.equal(parseSavedDiscovery({ ...saved, result: { ...result, totalCostUsd: -1 } }), null);
  assert.equal(parseSavedDiscovery({ ...saved, input: { ...saved.input, seeds: ["same", "SAME"] } }), null);
  assert.equal(parseSavedDiscovery({ ...saved, estimate: { ...estimate, breakdown: [{ ...estimate.breakdown[0], endpointId: "unapproved.route" }] } }), null);
});

test("discovery history is bounded, unique and never silently truncates imported evidence", () => {
  const all = Array.from({ length: MAX_DISCOVERY_RESEARCH }, receipt);
  assert.equal(parseDiscoveryResearch(all)?.length, MAX_DISCOVERY_RESEARCH);
  assert.equal(parseDiscoveryResearch([...all, receipt()]), null);
  assert.equal(parseDiscoveryResearch([all[0], all[0]]), null);
  assert.equal(parseDiscoveryResearch([all[0], {}]), null);
});
