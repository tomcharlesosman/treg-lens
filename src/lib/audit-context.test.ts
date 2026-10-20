import assert from "node:assert/strict";
import { test } from "node:test";
import { auditContext } from "./audit-context";
import { createPromptRecord } from "./prompt-library";
import type { WorkspaceSnapshot } from "./workspace-storage";
import type { AuditInput } from "./aeo";

const input: AuditInput = { brand: "Acme", domain: "acme.com", competitors: ["Rival", "New rival"], prompts: ["Which tool suits agencies?"], engines: ["chatgpt"] };
const project = { brand: "Acme", domain: "acme.com", competitors: ["Rival"], competitorDetails: [{ name: "Rival", domain: "www.rival.com", reason: "Reviewed", sourceUrl: "https://rival.com/about" }] };
const snapshot: WorkspaceSnapshot = { project, prompts: input.prompts, promptRecords: [{ ...createPromptRecord(input.prompts[0], project), id: "reviewed-question" }], runs: [], done: [], sourceResearch: {} };

test("audit metadata freezes selected reviewed identities without extra profile evidence", () => {
  const context = auditContext(input, snapshot);
  assert.deepEqual(context.competitorDetails, [{ name: "Rival", domain: "rival.com" }, { name: "New rival" }]);
  assert.deepEqual(context.measurement?.prompts, [{ id: "reviewed-question", text: input.prompts[0], kind: "neutral" }]);
  snapshot.project.competitorDetails![0].domain = "later-edit.com";
  assert.equal(context.competitorDetails?.[0].domain, "rival.com");
});

test("another brand cannot inherit current workspace competitor domains or prompt annotations", () => {
  const context = auditContext({ ...input, brand: "Another", domain: "another.com" }, snapshot);
  assert.deepEqual(context.competitorDetails, [{ name: "Rival" }, { name: "New rival" }]);
  assert.notEqual(context.measurement?.prompts[0].id, "reviewed-question");
});
