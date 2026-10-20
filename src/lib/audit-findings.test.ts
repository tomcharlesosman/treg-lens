import { strict as assert } from "node:assert";
import { test } from "node:test";
import { auditFindings } from "./audit-findings";
import { safeEvidenceUrl } from "./workspace-profile";
import type { AnswerResult } from "./aeo";
import type { SavedRun } from "./workspace-data";

const answer = (patch: Partial<AnswerResult> = {}): AnswerResult => ({
  id: "answer-one", prompt: "Which product fits?", engine: "chatgpt", answer: "Contoso fits this need.",
  mentionedBrands: ["Contoso"], brandMentioned: false, position: null,
  citations: [{ url: "https://guide.example.com/products", domain: "guide.example.com", title: "A guide" }],
  costUsd: 0.005, costKnown: true, completedAt: "2026-10-20T12:00:00Z", ...patch,
});
const run = (patch: Partial<SavedRun> = {}): SavedRun => ({
  id: "run-one", brand: "Acme", domain: "acme.example.com", competitors: ["Contoso"],
  prompts: ["Which product fits?"], engines: ["chatgpt", "gemini"],
  results: [answer()], errors: [{ prompt: "Which product fits?", engine: "gemini", error: "Interrupted" }],
  totalCostUsd: 0.005, totalCostKnown: false, completedAt: "2026-10-20T12:00:00Z", ...patch,
});

test("partial first findings link competitor gaps to the exact saved answer without counting failures as absence", () => {
  const result = auditFindings(run());
  assert.equal(result.requested, 2);
  assert.equal(result.answered, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.findings[0].kind, "competitor");
  assert.match(result.findings[0].detail, /1 of 1 answered/);
  assert.equal(result.findings[0].answer.id, "answer-one");
  assert.equal(result.findings[1].sourceUrl, "https://guide.example.com/products");
});

test("blank and duplicate answer cells do not inflate findings or citation counts", () => {
  const result = auditFindings(run({ results: [answer(), answer({ id: "duplicate" }), answer({ id: "empty", engine: "gemini", answer: "  " })] }));
  assert.equal(result.answered, 1);
  assert.equal(result.missing, 1);
  assert.match(result.findings.find((finding) => finding.kind === "source")!.detail, /1 answered check/);
  const missing = auditFindings(run({ results: [] }));
  assert.equal(missing.findings.length, 0);
  assert.equal(missing.mentioned, 0);
});

test("findings keep unsafe links and own-domain citations out of source recommendations", () => {
  assert.equal(safeEvidenceUrl("javascript:alert(1)"), null);
  assert.equal(safeEvidenceUrl("https://name:password@guide.example.com/"), null);
  const result = auditFindings(run({ results: [answer({ brandMentioned: true, mentionedBrands: ["Acme"], citations: [
    { url: "javascript:alert(1)", domain: "guide.example.com", title: "Unsafe" },
    { url: "https://acme.example.com/about", domain: "acme.example.com", title: "Own page" },
  ] })] }));
  assert.equal(result.findings.some((finding) => finding.kind === "source"), false);
  assert.equal(result.findings[0].kind, "presence");
});
