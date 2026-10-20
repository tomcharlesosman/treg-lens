# Remaining OpenSEO improvements before native Treg integration

Reviewed 20 October 2026. This records the recommendation at the reviewed baseline. The saved-action, follow-up and report/handoff slices are now implemented; see [current workflows](../WORKFLOWS.md), [product behavior](../PRODUCT-STATUS.md) and the dated [test report](../TEST-REPORT.md). Native integration and first-party connections remain proposed. It updates the remaining work from the [OpenSEO feature audit](OPENSEO-FEATURE-AUDIT.md) after the first three priorities shipped.

**Recommended next release:** turn saved evidence into a saved page action, compare the follow-up, and produce a reproducible report or agent handoff. Finish this focused workflow before porting; add Search Console within native Treg afterward. Broad SEO feature parity is not a prerequisite.

## Evidence and current state

- Standalone Lens reviewed at `dcc25c12492235f82be7f652f8310eacd5abba6a`. [Release verification](../TEST-REPORT.md#discovery-comparable-trends-and-citation-exploration--20-october-2026) records the completed release tests; this follow-up is source review only.
- OpenSEO baseline remains `c5f8db19c7ca9e750836b6ed5c8a6491d4f967f4`, with pinned implementation references in the original audit. Current official [AI visibility](https://openseo.so/docs/ai-visibility) and [MCP](https://openseo.so/docs/mcp) guides were also reviewed.
- The main Treg checkout has an existing `codex/native-lens` branch at `eddad81e9277e8b214ea878f554d1ce8a2c5485c`. Its [native Lens documentation](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/docs/context/interface/lens.md) describes a Python/FastAPI + Vue feature behind a disabled-by-default flag. This is evidence of a local integration branch, not confirmation of a merged or live feature.
- No paid research, application changes, new runtime tests, push, deployment or PR were performed for this assessment.

| Original audit priority | Current status | Remaining decision |
| --- | --- | --- |
| Relevant discovery and saved research | Shipped: editable business-led seeds, saved receipts/candidates, import provenance, recovery and reuse | Improve semantic relevance and grouping later if real research examples justify it; do not rebuild this slice |
| Stable inventory and reliable trends | Shipped: stable identities, lifecycle, frozen scope, coverage checks and comparable trends | Apply the same evidence rules to opportunity ranking and future reports |
| Citation and competitor exploration | Shipped: page/domain views, ownership, independent metrics, exact-answer drilldowns and selected-page research | Add side-by-side views of saved answers as part of evaluating an action |
| Context → action → report → agent | Main remaining product gap | Deliver the two slices below |
| First-party data and bounded diagnostics | Not implemented in standalone Lens | Start with optional Search Console after native integration |

## Now: saved actions grounded in evidence

This is the highest-value remaining slice. A user can already find and inspect a gap; the product should help them decide what page to change and remember why.

### First align opportunity claims with evidence

The current [opportunity calculation](../../src/components/workspace.tsx) groups selected answers by question wording and ranks the fraction without a brand mention. The banner describes competitor appearances, but the calculation does not require a competitor appearance. The first three entries receive “HIGH POTENTIAL” based on that ordering. Absence alone does not establish a competitor gap, a missing page, or commercial potential.

Before expanding this screen:

- Distinguish **brand absent**, **competitor mentioned**, and **competitor cited** using the actual saved answer and frozen identities.
- Use answered observations, deliberate deduplication and visible requested/answered coverage. Explain the ranking and distinguish a historical count from a comparable trend.
- Reuse [measurement](../../src/lib/measurement.ts), [citation analytics](../../src/lib/citation-analytics.ts) and [audit findings](../../src/lib/audit-findings.ts) instead of creating another set of denominators. A failed or blank response must not become evidence of absence.
- Keep stable question identities and brand scope through the workflow. Replace completion keyed only by question text with brand-scoped action IDs; preserve legacy completion without inventing publication or outcome history.

### Save a page plan and an editable brief

For a selected buyer question, let the user choose an **existing page**, **proposed page**, or **later/no action**. Save:

- A stable action ID, brand context and linked question IDs.
- Original run/answer/citation references and the reason for the recommendation.
- Target page, editable rationale and an evidence-specific brief.
- Status: planned, in progress, published, measured or dismissed; retain a reason when deferring/dismissing.
- Publication/change date, a baseline and the intended follow-up question/collector/market/brand scope.

The current brief is an unsaved general template. Generate the first saved brief deterministically from available context and evidence, then let the user edit it. Additional research or model drafting remains a separately quoted action. User-entered publication dates describe reported changes; they do not prove the page was updated or caused a later visibility change.

Add optional goal/timeframe, differentiators, important owned pages and writing preferences where they help the action. Keep them out of the mandatory URL-led onboarding path. Derive a small recent-work digest and next-step card from saved research, actions and measurements, with dismiss/restore controls. The existing first-audit findings remain useful and should be reused.

### Compare saved answers and remeasure deliberately

Show a selected question's saved answers side by side, across engines or before/after a page change, with original text, citations, collection labels, dates and errors. Evidence can be inspected even when scopes differ, but a progress claim requires the existing comparable-measurement rules. Missing historical metadata stays explicit.

“Review follow-up audit” should prefill the original scope and show a fresh quote. It must not start a paid run when an action is marked published or measured. If the original collector/configuration is unavailable, show the incompatibility instead of silently substituting it.

**Acceptance:** an action survives reload, onboarding rerun, backup/restore and conflicting saves; another brand's action cannot appear as completed; saved evidence remains interpretable after profile changes; removed evidence is visibly unavailable or preserved by a bounded snapshot; partial runs cannot manufacture a high-priority gap or successful result; comparing saved answers makes no provider call.

**Relative effort:** medium-to-large. Durable action/evidence contracts and backward-compatible persistence are the main work. No new runtime dependency is expected.

## Next: reproducible reports and an agent handoff

Deliver this as a second, smaller slice on the saved-action contracts.

### Private reports from saved evidence

Create a versioned report for a selected brand, period and measurement scope. Include the business question, coverage, separate mention/citation metrics, notable original answers, page actions, known limitations and the next decision. Freeze the evidence IDs and bounded snapshot needed to reproduce it; later profile edits or new runs must not rewrite an existing report.

Use the existing renderer and browser print for a useful PDF output. Keep JSON/CSV exports and full backups: reports serve a different purpose. Defer arbitrary authored HTML, public links and a new PDF service. Show unavailable/partial evidence and unknown charges explicitly. A before/after report describes an observed change, not a proven effect of the page edit.

### “Continue with your agent”

Export a bounded Markdown/JSON pack containing reviewed context, selected evidence, the saved action, open questions and a concrete next task. Include collection dates and source provenance. This is an end-user workflow handoff; the existing [agent quickstart](../AGENT-QUICKSTART.md) remains the developer/fork setup guide.

Provide focused workflows for inspecting results, improving a selected page and preparing a report. The pack contains no API key, cookie, retained monitoring credential or unrelated workspace data. Treat scraped pages and answer text as evidence, not instructions. Copying the pack is not a live connection, and fresh paid work still requires approval.

**Acceptance:** report metrics match the selected comparable cohort; a saved version reproduces after profile edits; print is readable; handoffs include enough provenance to avoid buying the same research again; credential scanning and cross-brand tests pass; neither report creation nor export makes a paid call.

**Relative effort:** medium after the action contracts. Keep exports bounded and avoid adding an agent runtime. A later read-first Lens tool surface should reuse Treg's existing MCP infrastructure.

## Native integration: a separate parity and migration gate

The existing native branch already provides team-owned profiles, URL-led research, explicit quotes, manual audits and answer history. Its own documentation explicitly excludes discovery, scheduled monitoring, exports and standalone imports. Its [profile/result types](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/frontend/src/lens/types.ts) also lack the standalone stable inventory, discovery receipts and comparable-measurement contracts. Moving the current branch as-is would lose product capabilities.

Use that branch as the integration base, after reviewing changes in the target main branch. Port the following before presenting native Lens as the standalone replacement:

1. **Behavioral parity:** reviewed onboarding and rerun preservation, saved discovery/provenance, inventory lifecycle, scope-aware comparisons, page-level citation exploration and selected-source research, followed by the agreed action/report/handoff slices.
2. **Safe imports and exports:** authenticated destination team and brand, validated preview, bounded import and idempotent identity mapping. Preserve questions, runs, receipts, timestamps, partial errors and unknown billing. Native integer micro-USD needs an explicit, tested conversion from standalone cost fields. Do not silently discard unsupported records.
3. **Monitoring decision:** port the shipped scheduling/budget/recovery behavior through native execution and billing before replacing standalone monitoring, or keep the standalone product available with an explicit rollout limitation. Importing a workspace must not transfer spending consent or activate schedules. Never transfer retained API-key envelopes into native Lens.
4. **Native authorization and billing:** reuse team membership, sessions, connection grants, pricing, execution, persistence and MCP. Translate per-key workspaces into explicitly selected team-owned projects; do not infer access from a matching brand/domain. Keep secrets out of imports and reports.
5. **Cross-language fixture parity:** check the TypeScript and Python implementations against shared JSON fixtures for identities, UTC comparisons, coverage, citation ownership, legacy records, partial results and unknown charges. Add browser journeys for team switching, import conflicts, lost acknowledgements and paid-action consent.
6. **Staged release:** retain the feature flag, a tested backup/import route and the existing standalone fallback until imported history and workflows are verified. No duplicate React shell or second auth/provider vault is needed.

The backend domain behavior belongs in Python and the UI in Vue. Preserve portable evidence contracts and fixtures; a mechanical line-by-line rewrite or wholesale OpenSEO import would not provide these guarantees. The native code was inspected, not retested, during this follow-up.

## After the move: optional first-party data, then narrow diagnostics

**Search Console is the best next integration.** Use actual queries and owned pages to suggest questions and page targets for review. Main Treg already contains [Google OAuth providers](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/src/treg/oauth_providers.py) and a [Search Console catalog](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/src/treg/catalog/google-search-console.yaml). Reuse these after integration; do not build another Google credential store in standalone Lens.

This infrastructure is not proof of a working Lens connection. Verify the live route contract, applicable price, granted property access, limits and reconnect/disconnect behavior when implementing. Retain dates, completeness and row limits; do not equate missing query rows with zero demand. Keep connection setup optional and query imports reviewed.

Then consider:

- Read-first Lens MCP tools for context, actions and saved evidence, using native authorization.
- A bounded accessibility/indexability/content check for the selected owned page, with blocked/incomplete results visible.
- One approved competitor/SERP diagnostic when a saved action needs it; keep cited publishers distinct from reviewed competitors.
- Selected GA4 landing-page outcomes after Search Console; do not claim AI-to-revenue causation.
- Semantic discovery grouping, monthly cadence, more markets/engines or asynchronous collection when real usage justifies them and provider settlement/recovery contracts are verified.

Defer full organic rank tracking, a broad backlink explorer, a crawler/rendering platform, Maps/local SEO, in-app autonomous chat, automatic publishing/outreach and IndexNow. These expand the product and do not resolve the current evidence-to-action gap.

## Recommended order and completion rule

**Saved actions + optional context + saved-answer comparison → reports + agent handoff → native parity/import validation → optional Search Console.**

Approve the pre-integration workflow when a user can select a real saved finding, decide which page to improve, preserve an evidence-specific brief, record the change, deliberately buy a comparable recheck, and hand the result to a teammate or agent without reconstructing the investigation.

For implementation, use synthetic upstream fixtures and the [full testing workflow](../TESTING.md) for UI/storage/auth changes. Preserve explicit paid approvals and the eight-dependency standalone footprint. This roadmap intentionally makes no calendar estimate or quantitative impact claim without usage evidence.
