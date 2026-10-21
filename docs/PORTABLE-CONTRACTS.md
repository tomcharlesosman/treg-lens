# Portable contracts for native Treg

The [version 1 contract pack](../contracts/README.md) captures standalone Lens behavior before moving domain logic to Python and UI behavior to Vue. Its fixed JSON vectors execute against the current TypeScript modules in ordinary `npm test`. They are synthetic inputs and reviewed expected outputs, not live-provider fixtures or snapshots generated during a test run.

This release **does not implement a native importer or a Python Lens port**. The optional Python harness validates a supplied adapter; without one, native parity remains unverified. Lens still runs with Node alone and its existing dependencies. Native authorization, billing, persistence and migration integration tests remain separate release requirements.

## Run and extend the shared tests

```bash
npm run test:contracts
npm test
```

[`manifest.json`](../contracts/v1/manifest.json) records the reference commit, version, suite files, operations and output projections. The [TypeScript adapter](../src/lib/portable-contracts-adapter.ts) calls the real question, measurement, citation, page-plan, report, workspace-validation and continuity functions. It only projects their outputs into language-neutral JSON. The [cost adapter](../src/lib/portable-contracts.ts) supplies the new explicit migration conversion; it does not alter existing application charges.

The seven suites cover:

| Suite | Important outcomes |
| --- | --- |
| [Questions](../contracts/v1/questions.json) | Exact stable identities including Unicode, branded boundaries, paused/archive history, edits and retained discovery provenance |
| [Measurement](../contracts/v1/measurement.json) | Recorded scope, collector/question changes, requested answer cells, missing data, deduplication, 90% threshold and UTC daily selection |
| [Citations](../contracts/v1/citations.json) | Public URL acceptance, hostname boundaries, historical owned/competitor/other/unknown ownership, deduped sources and separate mention/citation rates |
| [Page plans](../contracts/v1/plans.json) | Original follow-up scope, unavailable/legacy/unsupported settings, missing results, publication chronology and comparison gates |
| [Reports and backups](../contracts/v1/reports-and-backups.json) | Frozen exact evidence, same-ID immutability, deletion/new versions, legacy defaults, credential-field projection and invalid-data rejection |
| [Money](../contracts/v1/money.json) | Exact decimals, exponent notation, sub-micro rounding, integer bounds, unknown totals and retained known subtotals |
| [Continuity](../contracts/v1/continuity.json) | First audit review, retained unknown and legacy billing, brand isolation, explicit dismissal, draft resumption and a measured plan's report target |

Inputs and expected outputs are ordinary inline JSON, without a reference resolver or fixture-generation dependency. Object key order is irrelevant; array order is significant. Missing optional properties and explicit `null` have different meanings. JSON numbers compare by value, but booleans are not numbers. Tests use exact equality, not a tolerance that could conceal changes in denominators. The manifest defines operation projections; omitted implementation details are not certified by that projection.

`continuity.project` takes a complete saved workspace and projects only ordered step IDs/actions, recent record IDs/original timestamps/actions and the current brand's dismissal count. English UI copy is deliberately outside this projection. Unknown billing stays unresolved when newer work succeeds, missing legacy billing flags remain unknown, and hiding a suggestion never marks its underlying work complete. Browser acknowledgment, conflict handling and navigation still need native UI integration tests.

Add a regression vector alongside a deliberate behavior change and review its expected outcome. Do not update expected values merely to make a port pass. Preserve version 1 semantics for existing imported evidence. A breaking identity, counting, rounding or projection change needs a new contract version and an explicit migration decision; additive cases can extend the same version. Localized product copy may be translated in the UI, while an adapter maps native reason codes to the canonical reasons used in these fixtures.

## Python adapter contract

The optional [standard-library runner](../contracts/run_python_contracts.py) supports Python 3.12 and later. It adds no Python requirement to `setup`, `doctor`, `check`, CI or application runtime.

```bash
python3 contracts/run_python_contracts.py --validate-only
python3 contracts/run_python_contracts.py --adapter /absolute/path/to/native_lens_contract_adapter.py
```

`--validate-only` checks fixture structure and prints `nativeParity: unverified`. A real native adapter exports this function:

```python
def evaluate(operation: str, input_data: object) -> object:
    # Call the corresponding real native Lens domain function and project its result.
    # Return only JSON-compatible values. Do not load expected fixtures here.
    raise NotImplementedError(operation)
```

The runner supplies inputs without vector IDs or expected outputs. An unsupported operation is a failure, never a skipped success. Exit codes are 0 for all passed vectors, 1 for mismatches or adapter failures, and 2 for configuration/format errors. Invoking it without an adapter fails with an explicit unverified message. Passing the pack confirms only those observable cases; it does not establish permission, storage, billing or full-product parity.

## Identity and measurement rules to preserve

- **Question IDs:** preserve every existing `PromptRecord.id` and frozen measurement ID. For legacy wording without a saved ID, `legacyPromptId` trims using ECMAScript whitespace semantics, then hashes **UTF-16 code units** with four unsigned 32-bit multiply/XOR lanes. Python Unicode code points and unrestricted integer arithmetic are not equivalent. The constants and algorithm are in [the reference function](../src/lib/prompt-library.ts); apply a `0xffffffff` mask after each multiplication. Trim includes the byte-order mark U+FEFF. Do not lowercase, normalize Unicode, change punctuation or merge semantic equivalents before assigning an ID. Composed and decomposed accented text intentionally differ.
- **Inventory versus collection:** the inventory retains up to 512 records, including paused and archived wording. Eight questions is an audit execution limit, not an import truncation rule. Editing wording archives the old record and creates/restores another identity; saved runs keep their original wording, classification and provenance.
- **Brand identity:** new page-plan and continuity grouping uses trimmed lowercase brand name plus normalized hostname, including the existing `www.` convention. Older trend selection and frozen scope keys lowercase the brand name without trimming it. Preserve original historical strings and match the reference function used for the operation; do not apply a new universal normalization pass. These are grouping rules, never proof of ownership or permission. Historical run and report identities remain frozen; current competitor settings cannot fill missing historical domains.
- **Scopes:** comparison depends on exact question ID/text/kind, brand, US/en market, engine, source kind, provider and model label. Array order does not change scope equality. The `*-unreported` model labels are not pinned actual model versions. Legacy missing scope stays unknown; do not manufacture it on import.
- **Answers:** the denominator is requested question × collector cells. A nonblank answer must match the requested question/engine and recorded provider/source-kind when present. Repeated cells choose the latest actual timestamp, then the reference ID tie-breaker. Empty, failed and unrequested answers do not become negative brand observations. Raw results/errors remain inspectable even when excluded from a metric.
- **Trends and dates:** compare compatible scopes with at least 90% answered coverage. Use actual instants and UTC dates, with the latest run per UTC day. Preserve the original timestamp strings alongside parsed instants. Plans require a separate later follow-up, compatible frozen baseline, and no follow-up before the reported publication date. A delta is observational, not causal evidence.
- **Citations:** use the accepted URL hostname, never an upstream `citation.domain` label as authority. Match a host exactly or at a subdomain boundary; `treg.to.attacker.dev` is unrelated. Historical unknown competitor domains stay unknown. Deduplicate the same page in an answered check, preserve exact answer/run references, and keep mentions independent of domain citations. `safeEvidenceUrl` is a browser-safe lexical check, not authorization to fetch: native fetching still needs DNS/redirect/private-network defenses.
- **String and ordering compatibility:** current bounds use JavaScript string length, meaning UTF-16 code units; byte bounds use UTF-8 JSON bytes. Native `len(str)` alone is insufficient for non-BMP characters. Preserve original strings, IDs and arrays; do not silently use Unicode normalization, a different locale sort, or Python truthiness to turn missing/null values into empty/zero values. Review non-ASCII tie ordering separately if native storage introduces a new collation.

## Decimal USD to native micro-USD

Native integer amounts describe **imported reported history**, never a native charge or ledger event. Do not replay, settle, reserve, refund or reset monthly spend from imported values.

`portableCost` accepts `reportedUsd` as a finite nonnegative JSON number, decimal string (including exponent form), or `null`; optional `knownSubtotalUsd` supplies a separate known portion. `costKnown` is `true`, `false`, or omitted. The result retains source decimal strings, the explicit knowledge state (`null` for omitted legacy flags), integer micro-USD **strings**, and whether sub-micro precision was rounded. JSON strings avoid JavaScript's safe-integer limit; native code converts them to signed 64-bit integers after validation.

Conversion uses base-10 integer arithmetic at 1 USD = 1,000,000 micro-USD. Existing six-decimal charges convert exactly. Additional precision uses round-half-up once, after multiplication by the decimal scale; `0.0000005` becomes `1`, while `0.00000049` becomes `0` with `rounded: true`. Preserve the original value so the rounding is visible. Negative/nonfinite/nondecimal values, malformed knowledge flags and overflow above `9223372036854775807` micro-USD are rejected. A known total requires an amount. A known subtotal cannot exceed a known total after conversion.

| Standalone amount | Adapter input | Result semantics |
| --- | --- | --- |
| Run/discovery `totalCostUsd` with `totalCostKnown: true` | `reportedUsd`, `costKnown: true` | Known subtotal and final total are populated |
| Run/discovery `totalCostUsd` with `totalCostKnown: false` | `reportedUsd`, `costKnown: false` | Amount remains a known subtotal; final total is `null` |
| Legacy run with no knowledge flag | `reportedUsd`, omit `costKnown` | Preserve the reported amount; final total and knowledge remain unknown |
| Onboarding/source research `totalCostUsd: null`, `knownCostUsd` | `reportedUsd: null`, `knownSubtotalUsd`, `costKnown: false` | Preserve known subtotal; final total stays `null` |
| Answer/error `costUsd` and optional `costKnown` | Same per-record mapping | Keep answer and error amounts separate; missing knowledge is not known zero |
| Quote/reservation amount | Convert its decimal amount separately | Label estimate/reservation provenance; never relabel it as a settled cost |

The adapter cannot recover decimal precision already lost before a backup was exported. Prefer the original JSON decimal lexeme when implementing the native importer (Python's standard `decimal.Decimal` can parse it), and retain the source file digest. Never use binary floating-point multiplication or infer a missing total by summing only successful answers. The conversion pack is preparation for import, not a change to standalone billing behavior.

## Migration field map and limits

The targets below are **native domain concepts to implement**, not a claim that these database columns or endpoints already exist. The current native slice cannot accept all standalone data yet. Preserve source IDs in a namespaced external-ID mapping if native primary keys use another format. Frozen report JSON must keep its original source IDs; resolve cross-record links through the mapping, without rewriting immutable historical evidence.

| Source | Proposed native concept | Preservation and limits |
| --- | --- | --- |
| `project` brand/domain/description/audience/market | Team-owned reviewed brand context | Explicit destination team/project; description 1,200 and audience 600 UTF-16 units; US/en only |
| `project.competitors`, `competitorDetails` | Reviewed competitor identity and evidence | Up to 8 details; name 100, domain 253, reason 240; preserve unverified domain/source status |
| `project.buyerQuestions`, `researchReceipts` | Reviewed suggestions and original onboarding receipts | Up to 16 suggestions and 5 receipts; generated/manual/discovered remain distinct |
| `project.strategy` | Optional strategy context | Goal 600, timeframe 120, differentiators/writing preferences 1,200; up to 12 accepted owned key-page URLs |
| `prompts`, optional `promptRecords` | Selected compatibility list and complete question inventory | Up to 512 inventory records, wording 500, ID 100; preserve lifecycle and `evidence.discoveryId/candidateId` |
| `runs` with `measurement`, `competitorDetails`, results/errors | Historical immutable collection evidence and frozen scope | Run ID 200; unique within source workspace; retain exact answers/citations, dates, partial errors and knowledge flags; at most 8 questions × 4 engines for new execution |
| `discoveryResearch` | Original discovery receipts and selected candidate references | Latest 20 retained receipts; up to 54 candidates per receipt, original seed/quote/provider/call IDs/costs; no repurchase |
| `sourceResearch` | Selected-page research evidence | Preserve URL, observed data, known/null metrics, contact routes, original call IDs and partial extraction/metrics errors |
| `pagePlans` | Structured page actions | Up to 128; preserve source question/run IDs, frozen baseline scope, owned target, rationale 2,000, brief 12,000, status, dates and optional follow-up link |
| `reports` | Versioned frozen report snapshots | Up to 10, each ≤512 KiB UTF-8 JSON; 1–5 runs and up to 8 plans per report; evidence remains readable after source runs are removed; same-ID content immutable |
| `done` | Legacy completed-move history | Wording-based records have no established baseline or publication proof; keep labeled, do not invent linked plans |
| Optional `continuity` | Brand-scoped next-step dismissal preferences | Version 1, up to 128 entries: `{brand:{name,domain}, stepId, dismissedAt}`; missing means no preference. Digest is derived from evidence, not an event stream to migrate |
| Workspace revision and upload manifests | Source provenance and import transaction preconditions | Never install source revision as the destination revision; destination CAS is independent; do not import staged upload state |
| Session/API keys, monitoring key envelopes and spending approval | Excluded secrets/authorization | Never import. Do not reactivate a schedule; native monitoring requires fresh consent |

The whole standalone snapshot is limited to 8 MiB; report bounds apply inside that limit, not in addition to it. Respect accepted schema versions, unique IDs and safe URL constraints. Validate and preview unknown/unsupported fields before apply; do not silently drop an unsupported optional collection or truncate inventory to fit the current native schema. Do not synthesize missing evidence. Reports and plans can legitimately refer to deleted source audits, and reports carry their own selected evidence snapshots.

## Import preview and apply protocol to implement natively

[`import-preview.example.json`](../contracts/v1/import-preview.example.json) is a synthetic proposed preview response, **not an implemented API**. Its contract version is independent of the full-workspace backup version and report format version.

1. Accept only an explicitly selected full workspace backup (`kind: treg-lens-workspace-backup`, `version: 1`, `demo: false`). Filtered reports, handoff files and demo exports are not restorable backups. Validate bytes, bounds and nested data before planning changes; preserve the original source file and digest. Surface unsupported source versions rather than treating them as empty.
2. Authenticate the destination actor and verify import/write permission on the explicitly chosen native team and brand. A matching URL/domain or possession of a file confers no team permission. Partition historical runs, plans, discovery and reports by their frozen brand identities; retain unresolved records for an explicit mapping decision. Never assign another brand's history automatically to the active profile.
3. Return a versioned preview: source digest and import namespace, destination team/brand, destination revision, per-type counts, source-to-native ID mappings, existing/exact-match/conflicting records, unsupported fields, warnings and excluded secrets/authorization categories. A blocking conflict means apply is unavailable until resolved. Keep previews private and bounded.
4. Require deliberate apply against that reviewed preview and destination revision. Bind an idempotency key to actor/team, source digest, source namespace and mapping version; source IDs remain unique within their import namespace. A repeated acknowledged apply returns the same result and IDs. A reformatted or updated backup still reconciles stable source IDs in the established namespace instead of duplicating history.
5. Apply atomically or with an explicit staged-commit protocol. Concurrent destination edits reject the stale preview; do not blindly refresh the revision and replay it. Same report ID with changed content is a conflict, not an update. Preserve exact report snapshots and unknown billing. A lost acknowledgement is recovered by reading the import receipt, not repeating provider calls or committing another copy.
6. Return a durable import receipt and reconciliation totals. On failure, leave the destination's prior state and source backup intact. Rehearse rollback/restore and export round trips before rollout. Importing evidence never consumes Treg credits or authorizes paid work.

The reference vectors test deterministic domain outcomes; they do not implement this protocol or certify database transactions. Native release gates still include wrong-team/viewer denial, CAS races, interrupted apply and acknowledgement recovery, idempotent re-import, full backup round trips, unchanged frozen reports, and separately approved monitoring transition. Reuse native authentication, billing, call execution, connections and storage instead of copying standalone cookies or retained key envelopes.
