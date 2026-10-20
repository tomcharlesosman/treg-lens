import { MAX_DISCOVERY_RESEARCH, parseSavedDiscovery, type SavedDiscovery } from "./discovery-research";
import { syncPromptRecords } from "./prompt-library";
import { normalizeDomain } from "./workspace-data";
import type { WorkspaceSnapshot } from "./workspace-storage";

/** Add evidence and selected questions in one revision-checked snapshot. */
export function applyDiscovery(snapshot: WorkspaceSnapshot, receipt: SavedDiscovery, selectedIds?: string[]): WorkspaceSnapshot {
  const clean = parseSavedDiscovery(receipt);
  if (!clean) throw new Error("This research receipt is invalid.");
  const original = snapshot.discoveryResearch?.find((item) => item.id === clean.id) ?? clean;
  if (selectedIds && (selectedIds.length > 8 || new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id) => !original.result.candidates.some((candidate) => candidate.id === id))))
    throw new Error("Choose up to eight questions from this saved research.");
  if (selectedIds && (snapshot.project.brand.trim().toLowerCase() !== original.input.brand.trim().toLowerCase() ||
    normalizeDomain(snapshot.project.domain) !== normalizeDomain(original.input.domain)))
    throw new Error("Return to this research's brand before adding its questions.");
  const updated = { ...original, selectedCandidateIds: selectedIds ?? original.selectedCandidateIds };
  const candidates = selectedIds ? original.result.candidates.filter((candidate) => selectedIds.includes(candidate.id)) : [];
  const existingText = (text: string) => snapshot.prompts.find((prompt) => prompt.toLowerCase() === text.toLowerCase()) ??
    snapshot.promptRecords?.find((record) => record.text.toLowerCase() === text.toLowerCase())?.text ?? text;
  const prompts = [...new Set([...snapshot.prompts, ...candidates.map((candidate) => existingText(candidate.text))])];
  const records = candidates.length ? syncPromptRecords(snapshot.promptRecords, prompts, snapshot.project).map((record) => {
    const candidate = candidates.find((item) => item.text.toLowerCase() === record.text.toLowerCase());
    return candidate ? { ...record, provenance: "discovered" as const, archived: false, paused: false,
      evidence: { discoveryId: original.id, candidateId: candidate.id } } : record;
  }) : snapshot.promptRecords;
  return { ...snapshot, prompts,
    ...(records !== undefined ? { promptRecords: records } : {}),
    discoveryResearch: [...(snapshot.discoveryResearch ?? []).filter((item) => item.id !== updated.id), updated].slice(-MAX_DISCOVERY_RESEARCH),
  };
}
