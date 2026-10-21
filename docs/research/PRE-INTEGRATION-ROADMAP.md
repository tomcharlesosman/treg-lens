# Remaining OpenSEO improvements before native Treg integration

Reviewed 21 October 2026 against standalone Lens `3a40785b4037c398854a506d4fb9ddbf6995c882`. This supersedes the earlier recommendation to build page plans, follow-ups and reports: those workflows have shipped. The [original OpenSEO audit](OPENSEO-FEATURE-AUDIT.md) retains its historical baseline; [current workflows](../WORKFLOWS.md) and [product status](../PRODUCT-STATUS.md) describe the implemented product.

**Implementation update (21 October 2026):** this standalone release adds next-step/recent-work continuity and the [portable contract pack](../PORTABLE-CONTRACTS.md). Native parity and a safe import rehearsal remain the next gate. Keep new Google connections and live Lens agent tools in the native integration. Another broad standalone feature release is not a prerequisite.

## Evidence and confidence

- Standalone Lens: `3a40785`, including discovery/trends/citations at `dcc25c1` and plans/follow-ups/reports at `e73dd8f`. The [release test report](../TEST-REPORT.md#saved-page-plans-follow-up-measurements-and-agent-reports--20-october-2026) records local verification; [the completed CI run](https://github.com/tomcharlesosman/treg-lens/actions/runs/39500047346) covers the corrected release. This assessment did not rerun the application suites.
- OpenSEO: reference checkout and upstream main both remain `c5f8db19c7ca9e750836b6ed5c8a6491d4f967f4` when checked. Its current official [AI visibility](https://openseo.so/docs/ai-visibility) and [MCP](https://openseo.so/docs/mcp) guides were also reviewed.
- Native Lens: the clean local checkout and the fork's `codex/native-lens` branch remain at `eddad81e9277e8b214ea878f554d1ce8a2c5485c`. Its [feature documentation](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/docs/context/interface/lens.md) and [frontend contracts](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/frontend/src/lens/types.ts) were inspected, not retested.
- The local/fork main is `9d4755c`; upstream `superdesigndev/treg` main is `6f8f82eb1c6cf4998b7cad699e6e91925d62d26b`, 23 commits ahead of that base. [Verified comparison](https://github.com/superdesigndev/treg/compare/9d4755c6b9c150a0a072aa122cc64a278400f47b...6f8f82eb1c6cf4998b7cad699e6e91925d62d26b). Review current upstream changes before updating the native branch. This review did not fetch, rebase, merge or modify either reference checkout.
- The source assessment above is the pre-implementation baseline. This release implements the continuity and portable-contract work below; its local verification is recorded in the [test report](../TEST-REPORT.md). No paid quality pilot or native migration is implied.

## What is complete, partial or still absent

| Audit area | Current standalone state | Remaining recommendation |
| --- | --- | --- |
| Relevant discovery and saved research | Shipped: reviewed-context seeds, retained candidates/receipts, provenance, reuse and recovery | Evaluate semantic relevance on real examples before adding a second research pipeline |
| Stable inventory and reliable trends | Shipped: identities, lifecycle, frozen collection scope, separate mention/citation rates and coverage checks | Preserve these contracts across the Python port |
| Citation and competitor exploration | Shipped: pages/domains, historical ownership, per-engine metrics, exact-answer drilldowns and selected-page research | Add targeted diagnostics only when a page decision needs them |
| Optional strategy and page plans | Shipped: goals, differentiators, key pages, briefs, target decisions, statuses and publication dates | Preserve the new continuity behavior across the native move; avoid more mandatory onboarding |
| Comparable follow-up measurements | Shipped: saved-answer comparison and fresh approved collection of original scope | Keep missing/legacy evidence and unreported model versions explicit |
| Private reports and agent handoff | Shipped: immutable evidence snapshots, Markdown/JSON, browser print and bounded instructions | Live access to saved Lens data is still missing; report templates/sharing can wait |
| Research digest and activation steps | Implemented: acknowledged brand-scoped next steps, dismiss/restore, recovery priority and bounded recent work | Preserve behavior in native; source-research receipts await an explicit owning-brand domain contract |
| Search Console / GA4 | No Lens connection, property mapping or first-party page/query workflow | Add optional Search Console in native Treg first; selected GA4 outcomes later |
| Selected-page readiness checks | No dedicated plan-linked page inspection; choosing a page does not fetch it | Add bounded diagnostics after the native foundation, reusing existing research and Google inspection |
| Live Lens MCP / end-user skills | Copy/download handoff works; no callable Lens workspace tool surface | Use native team authorization and MCP for read-first tools and focused workflows |
| Extra markets/engines, monthly cadence, async collection | Not part of current Lens scope | Add from demonstrated need with verified provider and settlement contracts |
| Broad SEO suite | No full rank tracker, backlink explorer, crawler, Maps suite or IndexNow workflow | Keep deferred; these do not block Lens integration |

## 1. Implemented in standalone: next steps and recent work

A returning user should see what was learned, what remains unfinished and the next useful decision. The [current activity popover](../../src/components/workspace.tsx) describes the latest audit and offers another audit. It does not summarize saved discovery, source research, plans, follow-ups and reports as one continuing investigation.

The home card is now derived from saved state:

- No usable audit: review the first audit scope and quote.
- Saved evidence with no decision: inspect the finding and choose a page plan.
- Draft plan: resume its brief and target page.
- Published plan without compatible later evidence: review a follow-up; never start it automatically.
- Compatible follow-up: inspect the comparison and prepare a report.
- Interrupted research, ambiguous billing or unsynchronized work: show recovery/review before recommending another purchase.

A dated 12-entry digest links to original receipts, answers, page plans and reports. Existing plan/report notes remain the place for owner decisions; no separate notes stream was added. The digest is bounded without changing source-record retention. Source research stays in citation exploration because older receipts do not record their owning brand domain. Reuse [audit findings](../../src/lib/audit-findings.ts), [page-plan comparison](../../src/lib/page-plans.ts) and existing saved evidence; no extra model or provider call is needed.

Persist dismiss/restore preferences within the current brand's workspace. Completion must come from an acknowledged saved result, not a button click. Downloading a handoff means instructions were prepared; it does not mean an agent changed or published the page. A reported publication date remains an owner's statement.

**Acceptance:** reload, onboarding rerun, conflicting saves, another brand, failed collections and paused monitoring cannot produce a false completed step or an automatic paid action. Keyboard and phone behavior remain covered.

**Relative effort:** small-to-medium. This is useful polish, not a reason to delay migration for a large redesigned dashboard.

## 2. Prepared for the port: portable contracts and shared fixtures

The current TypeScript validators and tests remain the behavioral reference. The [versioned contract pack](../PORTABLE-CONTRACTS.md) now supplies 86 fixed JSON examples and expected outcomes, a TypeScript adapter calling real domain functions, and an optional Python runner. The native adapter and importer remain to be implemented; Python/Vue parity is unverified.

The pack and existing standalone tests cover:

- Stable question identity, wording history, archive/pause state and original discovery provenance.
- Frozen brand, competitor, collector, market and question scope; UTC daily selection, deduplication and coverage.
- Owned/competitor/other/unknown citation classification, domain boundaries and exact source references.
- Page-plan identities, publication chronology, missing baselines, original follow-up scope and concurrent edits.
- Immutable reports, selected evidence, safe rendering, bounds and explicit deletion.
- Legacy backups, partial/error answers, ambiguous charges and preserved unknown values.

The versioned field mapping and decimal-to-micro-USD conversion are now included. The conversion preserves original reported amounts/provenance and unknown flags with explicit precision/rounding. Native import must never turn an imported amount into a native billing-ledger entry.

The native profile currently stores at most eight question strings, while standalone inventory can retain 512 records. Eight is the execution limit, not a valid migration truncation rule. Likewise, preserve up to 128 page plans and the bounded immutable report snapshots instead of flattening them into profile notes.

The proposed import preview contract covers chosen destination team and brand, per-type counts, identity mappings, unsupported fields and conflicts. Its native implementation remains future work. Partition historical brand-scoped records deliberately; matching a domain does not confer access. Repeating an acknowledged import must not duplicate records. Failed or interrupted imports must preserve the source backup and the destination's previous state.

**Acceptance:** both languages produce the same expected domain outcomes; round trips preserve IDs, dates, answer/citation text and report evidence; unsupported data is surfaced before the user applies an import.

**Relative effort:** medium. This reduces the chance of a visually similar port changing measurement or losing history.

## 3. Native replacement gate: parity, import rehearsal and recovery

The [existing native feature](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/docs/context/interface/lens.md) already supplies team profiles, URL-led research, explicit quotes, native billing execution and answer history behind a disabled feature flag. Its documentation explicitly excludes discovery, monitoring, exports and standalone imports. Its types also lack standalone plans, reports and stable inventory/scope contracts.

| Area | Required before calling native Lens the standalone replacement |
| --- | --- |
| Onboarding | Reviewed buyer context, competitor corrections, saved receipts and rerun preservation |
| Research and inventory | Saved discovery, stable question records, original provenance and lifecycle |
| Measurement and sources | Matching-scope trends, independent citation ownership, page-level drilldowns and source research |
| Actions and reporting | Plans, optional strategy, comparable follow-ups, frozen reports and handoff |
| Import/export | Validated preview, bounded atomic/idempotent apply, complete evidence preservation and native export |
| Permissions | Existing team membership/roles applied to every new object, import and tool; explicit destination selection |
| Billing and recovery | Native execution/settlement, accepted quotes, unknown-state recovery and no duplicate paid submission |
| Monitoring | Port the consent/budget/lease/recovery behavior, or retain standalone monitoring with an explicit transition limitation |

Never import session secrets, API keys, retained monitoring envelopes or spending authorization. Importing history must not enable a schedule. A native schedule requires fresh consent using native identity and billing; historical reported costs cannot reset its budget.

Refresh the native branch against current upstream, then port domain behavior to Python and UI behavior to Vue. Reuse existing auth, connections, database, pricing, call execution and MCP. Keep one native dashboard and preserve standalone as a fallback during rollout.

Rehearse with synthetic backups containing multiple historical brands, legacy records, failed/unknown-cost runs, edited questions, retained discovery, linked plans and immutable reports. Test wrong-team access, viewer restrictions, retries after lost acknowledgements, stale revisions, limits and rollback. Verify reports still reproduce and that retained history remains readable after a source audit is removed.

Run a small, separately budget-approved live acceptance pilot across different business types before broad rollout. Assess competitor identity, question relevance, citation usefulness and whether a real user can finish the page-plan/report workflow. Existing fixture tests establish application behavior; they do not establish live research quality or an SEO outcome. This review authorizes no paid pilot.

**Relative effort:** large; this is the main integration work. Full OpenSEO parity is not a release gate.

## First native additions after that foundation

### Search Console grounded planning

Use actual owned pages and observed Google queries to suggest page targets and questions for review. Offer an explicit connection/property choice and preserve exact property identity, dates, country/device filters, row bounds and incomplete-data warnings. Missing rows are not zero demand; Google query volume is not measured AI prompt demand.

The native branch already has [Google OAuth providers](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/src/treg/oauth_providers.py) and a [Search Console catalog](https://github.com/tomcharlesosman/treg/blob/eddad81e9277e8b214ea878f554d1ce8a2c5485c/src/treg/catalog/google-search-console.yaml). Reuse that infrastructure, then verify current endpoint access/pricing, property grants, expiry, revocation and reconnect behavior. Catalog presence is not proof that Lens has a working connection. Do not create a second Google credential store in standalone Lens.

### Read-first Lens tools and focused agent workflows

Let agents list a team's permitted Lens projects and read bounded context, questions, research receipts, answers, citation details, plans and reports. Use pagination and explicit IDs, and enforce the same permissions as the native UI. These should read saved evidence without repurchasing it.

Provide focused instructions for reviewing visibility, improving a selected page and preparing a report. OpenSEO's [MCP guide](https://openseo.so/docs/mcp) demonstrates the shared-project workflow; Lens's current downloadable handoff is a useful starting point, not a live connection.

Use main Treg's existing MCP surface and its current contribution rules. Defer agent writes, paid execution and schedule changes until their approval/idempotency contracts are explicit. Do not expose full workspace replacement as the default write tool.

### Bounded review of the selected owned page

From a saved plan, inspect only the selected page: fetch status, canonical/noindex directives, extractable title/headings/content, and whether the page addresses the selected question using verifiable product facts. Use Search Console inspection where available for Google's recorded index state. Preserve URL, collection time, provenance and blocked/incomplete results.

Existing Exa source research is useful but does not establish a complete technical/indexability audit. Robots permission or readable HTML cannot guarantee an AI engine will retrieve or cite a page. If provider calls are needed, quote the whole bounded action and save its receipt. Defer a full site crawler and automated publishing.

## Later, only when evidence justifies it

- Semantic relevance filtering and duplicate/topic suggestions: evaluate real discovery results first; keep generated grouping distinct from observed questions and explicit paid approval for extra model work.
- Report audience/templates or selected multi-period summaries: extend the immutable report model when users repeatedly need them. Public sharing needs a distinct publication/permission/revocation design in native Treg.
- Selected GA4 landing-page outcomes after Search Console, with time-zone, sampling and attribution limitations. Do not infer AI-to-revenue causality.
- A single competitor/SERP diagnostic for a saved page question before any general keyword or backlink dashboard.
- Monthly cadence, extra markets/engines and cheaper asynchronous collection after provider capability, pricing and recovery checks. Keep API experiments, Google AI Mode and AI Overviews distinguishable.

Continue deferring full rank tracking, backlink exploration, local Maps grids, broad crawling/rendering, an in-app autonomous agent runtime, automatic outreach/publishing and IndexNow. These expand scope without being necessary to preserve the shipped Lens workflow.

## Recommended sequence and decision

**Next-step/recent-work and portable contracts (implemented here) → refreshed native parity and import rehearsal → optional Search Console and read-first Lens tools → selected-page diagnostics.**

Proceed to native implementation once the source contract and behavior fixtures are explicit; do not wait for every later feature. Before opening an integration PR, require demonstrated parity for the agreed replacement scope, a migration rehearsal, team-isolation/billing tests, and a documented monitoring transition. Before broad rollout, add the separately approved live quality check.

Use [the testing workflow](../TESTING.md) and [portable contracts](../PORTABLE-CONTRACTS.md) for the native implementation. This standalone release does not open a PR or modify native Treg. Its TypeScript checks do not certify Python/Vue parity; bind the real native adapter and complete the import rehearsal before replacement.
