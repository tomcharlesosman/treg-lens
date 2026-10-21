import { citationAnalytics, citationOwnership } from "./citation-analytics";
import { assertImmutableEvidenceReports, createEvidenceReport, parseEvidenceReports } from "./evidence-reports";
import { buildMeasurementScope, comparableTrend, measureRun, measurementScopeKey, validateMeasurementScope, type RunMeasurement } from "./measurement";
import { buildPagePlanFollowup, comparePagePlanRuns } from "./page-plans";
import { activePromptTexts, classifyPrompt, editPromptRecord, legacyPromptId, syncPromptRecords, validatePromptRecords } from "./prompt-library";
import { evidenceMatchesDomain, safeEvidenceUrl } from "./workspace-profile";
import { sanitizeWorkspaceSnapshot } from "./workspace-validation";
import { portableCost } from "./portable-contracts";
import { deriveWorkspaceContinuity } from "./workspace-continuity";

export const PORTABLE_OPERATIONS = ["questions.identity", "questions.lifecycle", "scope.build", "scope.same", "measurement.run", "measurement.trend", "citation.url", "citation.ownership", "citation.analytics", "plans.compare", "plans.followup", "reports.create", "reports.immutable", "workspace.sanitize", "money.convert", "continuity.project"] as const;

function measurement(point: RunMeasurement) {
  return { recorded: point.recorded, requested: point.requested, answered: point.answered, missing: point.missing, coverage: point.coverage,
    mentionRate: point.mentionRate, citationRate: point.citationRate, comparable: point.comparable, answerIds: point.answers.map((answer) => answer.id) };
}

/** Adapter projections are specified in contracts/v1/manifest.json; domain logic stays in its real modules. */
export function evaluatePortableContract(operation: string, value: unknown): unknown {
  switch (operation) {
    case "questions.identity": {
      const input = value as { text: string; project: Parameters<typeof classifyPrompt>[1] };
      return { id: legacyPromptId(input.text), kind: classifyPrompt(input.text, input.project) };
    }
    case "questions.lifecycle": {
      const input = value as { records: Parameters<typeof syncPromptRecords>[0]; prompts: string[]; project: Parameters<typeof syncPromptRecords>[2]; edit?: { id: string; text: string } };
      const synced = syncPromptRecords(input.records, input.prompts, input.project);
      const records = input.edit ? editPromptRecord(synced, input.edit.id, input.edit.text, input.project) : synced;
      return { records, active: activePromptTexts(records), valid: validatePromptRecords(records) };
    }
    case "scope.build": {
      const input = value as { audit: Parameters<typeof buildMeasurementScope>[0]; records?: Parameters<typeof buildMeasurementScope>[1] };
      const scope = buildMeasurementScope(input.audit, input.records);
      return { scope, valid: validateMeasurementScope(scope) };
    }
    case "scope.same": {
      const input = value as { left: Parameters<typeof measurementScopeKey>[0]; right: Parameters<typeof measurementScopeKey>[0] };
      return { same: measurementScopeKey(input.left) === measurementScopeKey(input.right), leftValid: validateMeasurementScope(input.left), rightValid: validateMeasurementScope(input.right) };
    }
    case "measurement.run": {
      const input = value as { run: Parameters<typeof measureRun>[0]; filter?: Parameters<typeof measureRun>[1] };
      return measurement(measureRun(input.run, input.filter));
    }
    case "measurement.trend": {
      const input = value as { runs: Parameters<typeof comparableTrend>[0]; project: Parameters<typeof comparableTrend>[1]; filter?: Parameters<typeof comparableTrend>[2] };
      const result = comparableTrend(input.runs, input.project, input.filter);
      return { latestId: result.latest?.run.id ?? null, previousId: result.previous?.run.id ?? null, pointIds: result.points.map((point) => point.run.id), excluded: result.excluded, delta: result.delta };
    }
    case "citation.url": {
      const input = value as { url: string; domain: string };
      return { safeUrl: safeEvidenceUrl(input.url), matchesDomain: evidenceMatchesDomain(input.url, input.domain) };
    }
    case "citation.ownership": {
      const input = value as { url: string; run: Parameters<typeof citationOwnership>[1] };
      return citationOwnership(input.url, input.run);
    }
    case "citation.analytics": {
      const input = value as { runs: Parameters<typeof citationAnalytics>[0]; ownership?: Parameters<typeof citationAnalytics>[1] };
      const result = citationAnalytics(input.runs, input.ownership);
      const counts = (page: typeof result.pages[number] | typeof result.domains[number]) => ({ domain: page.domain, answerCount: page.answerCount, promptCount: page.promptCount, engineCounts: page.engineCounts, coverage: page.coverage, ownerships: page.ownerships,
        evidence: page.evidence.map((row) => ({ runId: row.runId, answerId: row.answer.id, ownership: row.ownership, owner: row.owner ?? null })) });
      return { answered: result.answered, emptyAnswers: result.emptyAnswers, unsafeCitations: result.unsafeCitations,
        pages: result.pages.map((page) => ({ url: page.url, title: page.title, ...counts(page) })), domains: result.domains.map(counts),
        brands: result.brands.map(({ name, role, domain, answered, mentioned, cited, mentionRate, citationRate }) => ({ name, role, domain, answered, mentioned, cited, mentionRate, citationRate })) };
    }
    case "plans.compare": {
      const input = value as { plan: Parameters<typeof comparePagePlanRuns>[0]; runs: Parameters<typeof comparePagePlanRuns>[1] };
      const result = comparePagePlanRuns(input.plan, input.runs);
      return { baseline: result.baseline ? measurement(result.baseline) : null, followup: result.followup ? measurement(result.followup) : null,
        comparable: result.comparable, delta: result.delta, reasons: result.reasons };
    }
    case "plans.followup": {
      const input = value as { plan: Parameters<typeof buildPagePlanFollowup>[0]; runs: Parameters<typeof buildPagePlanFollowup>[1] };
      try { return { available: true, ...buildPagePlanFollowup(input.plan, input.runs) }; }
      catch (error) { return { available: false, error: error instanceof Error ? error.message : "Unknown error" }; }
    }
    case "reports.create": {
      const input = value as Parameters<typeof createEvidenceReport>[0];
      try { const report = createEvidenceReport(input); return { valid: true, report, roundTripEqual: JSON.stringify(parseEvidenceReports([report])?.[0]) === JSON.stringify(report) }; }
      catch { return { valid: false }; }
    }
    case "reports.immutable": {
      const input = value as { previous: Parameters<typeof assertImmutableEvidenceReports>[0]; next: Parameters<typeof assertImmutableEvidenceReports>[1] };
      try { assertImmutableEvidenceReports(input.previous, input.next); return { allowed: true }; }
      catch { return { allowed: false }; }
    }
    case "workspace.sanitize": {
      try { return { valid: true, snapshot: sanitizeWorkspaceSnapshot(value) }; }
      catch { return { valid: false }; }
    }
    case "money.convert": {
      try { return { valid: true, value: portableCost(value as Parameters<typeof portableCost>[0]) }; }
      catch { return { valid: false }; }
    }
    case "continuity.project": {
      const result = deriveWorkspaceContinuity(value as Parameters<typeof deriveWorkspaceContinuity>[0]);
      return { steps: result.steps.map(({ id, action }) => ({ id, action })),
        recent: result.recent.map(({ id, at, action }) => ({ id, at, action })), dismissedCount: result.dismissedCount };
    }
    default: throw new Error(`Unsupported portable operation: ${operation}`);
  }
}
