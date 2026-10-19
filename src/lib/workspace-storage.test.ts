import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoRuns,
  DEFAULT_PROJECT,
  DEFAULT_PROMPTS,
} from "./workspace-data";
import { parseWorkspaceSnapshot } from "./workspace-storage";

const snapshot = () => ({
  project: DEFAULT_PROJECT,
  prompts: DEFAULT_PROMPTS,
  runs: createDemoRuns(),
  done: ["first move"],
  sourceResearch: {},
});

test("valid saved answers survive restoration without changing metrics or evidence", () => {
  const saved = snapshot();
  assert.deepEqual(parseWorkspaceSnapshot(JSON.stringify(saved)), saved);
});

test("malformed storage cannot hydrate values that crash the workspace", () => {
  assert.equal(parseWorkspaceSnapshot(null), null);
  assert.equal(parseWorkspaceSnapshot("{broken"), null);
  const mutations = [
    { project: { domain: "treg.to", competitors: [] } },
    { project: { ...DEFAULT_PROJECT, competitors: [null] } },
    { prompts: [null] },
    { runs: [{ ...createDemoRuns()[0], results: null }] },
    {
      runs: [
        {
          ...createDemoRuns()[0],
          results: [{ ...createDemoRuns()[0].results[0], citations: [null] }],
        },
      ],
    },
    { runs: [{ ...createDemoRuns()[0], completedAt: "invalid date" }] },
  ];
  for (const mutation of mutations)
    assert.equal(
      parseWorkspaceSnapshot(JSON.stringify({ ...snapshot(), ...mutation })),
      null,
    );
});

test("older snapshots receive optional defaults while invalid cached research is ignored", () => {
  const saved = snapshot();
  const restored = parseWorkspaceSnapshot(
    JSON.stringify({
      project: saved.project,
      prompts: saved.prompts,
      runs: saved.runs,
      done: "corrupt",
      sourceResearch: { broken: { title: "Incomplete old cache" } },
    }),
  );
  assert(restored);
  assert.deepEqual(restored.runs, saved.runs);
  assert.deepEqual(restored.done, []);
  assert.deepEqual(restored.sourceResearch, {});
});
