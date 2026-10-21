# Full feature verification — 21 October 2026

The [coverage guide](./TESTING.md) maps the implemented features to their browser, HTTP and library tests. This local pass covers acknowledged next steps/recent work, recovery continuity, the portable native contract pack, saved page plans, comparable follow-up measurements, immutable reports/agent handoff, saved discovery research, stable question identities, trends and citation exploration, alongside URL-led setup, rerunning onboarding, the live workspace, shared SQLite/Postgres storage logic, backup restoration, hosted transport and budgeted monitoring. Automated production HTTP/browser tests use SQLite and synthetic provider responses. Earlier real-Neon, public Vercel and paid-provider checks are recorded separately below; they are separate evidence and do not establish current live-provider behavior.

## Results

| Suite | Passed | Failed / skipped |
| --- | ---: | ---: |
| HTTP API | 173 | 0 / 0 |
| Chromium browser workflows | 165 | 0 / 0 |
| Firefox browser workflows | 165 | 0 / 0 |
| WebKit browser workflows | 165 | 0 / 0 |
| Library, setup, operations and portable contract tests | 317 | 0 / 0 |
| **Total** | **985** | **0 / 0** |

The final complete 668-case production API/browser run passed with zero failures, retries or skips: 173 HTTP tests plus 165 browser scenarios in each of Chromium, Firefox and WebKit. The 317 library/setup/operations/contract tests also passed. Lint, fresh route type generation, TypeScript, local documentation links and the production build passed. After the final code changes, `npm run check` and `npm run test:e2e` passed; the latter builds first and runs all four projects against the isolated production test server. Responsive browser cases exercised 320, 390, 768 and 1440-pixel widths, with each public route checked independently. The harness forces SQLite with a fresh private database and synthetic credentials; it never opens the development or hosted production workspace database.

New coverage includes server durability after clearing the browser cache, scoped legacy migration, failed-save recovery, revision conflicts, complete backup restoration, confirmed audit deletion, idempotent monitoring recovery merges, and an exact-8 MiB backup round trip with answer hashes checked. Worker HTTP tests make isolated schedules due and execute the actual auth, pricing, provider adapters, ledger and workspace routes. They cover success, UTC cadence, revocation, per-run/monthly budgets, partial failures, missing charges, pending reservations, and retained paid results when the workspace is full.

Library/operations regressions exercise cross-process SQLite reads, atomic rollback, encrypted credential ownership, concurrent runner leases, crashes before and after journaling, exact quote execution, UTC slot alignment, online WAL-consistent backups, and the real worker CLI against an isolated HTTP server. Existing coverage also includes completed prompt rechecks, audit/discovery continuation across dialog close/reopen, discovery selection limits and resets, and backup exports when browser storage rejects writes.

Hosted transport coverage exercises owner-bound uploads above the 3 MiB direct-save threshold, 1 MiB chunk limits, UTF-8 character boundaries, exact 8 MiB round trips, checksum/schema failures, immutable chunk replay, concurrent revision conflicts, expiry/abort, encrypted staging, bounded retention, and replay of the original committed snapshot after later edits. Client tests cover lost commit acknowledgments without duplicate writes; streamed JSON tests round-trip Unicode above the platform response limit. Hosted cron tests reject absent/incorrect bearer values and spoofed Vercel headers. The local POST runner and hosted GET dispatcher share the tested monitor domain logic. Remote-mode operations tests confirm local backup and pause commands refuse without touching an unrelated SQLite database or exposing credentials.

## Next steps, recent work and portable native contracts — 21 October 2026

This release extends standalone revision `3a40785`. It retains eight runtime dependencies and the existing database schema. Brand-scoped dismissal preferences are an optional validated workspace field; older workspaces and full backups remain readable. Guidance and the dated digest derive from acknowledged saved records. No real workspace was reset and no paid live provider calls were made.

Thirteen new browser scenarios run in each of Chromium, Firefox and WebKit, with three new HTTP cases and seventeen continuity library regressions. They cover:

- First-audit review without execution, saved page-plan resumption, owner-reported publication, compatible follow-up review and exact report preparation/reopening.
- Hide/restore only after the exact server acknowledgment, failed saves, stale revisions, key and brand isolation, same-brand onboarding preservation, legacy snapshots and full-backup restoration.
- Unknown and legacy billing retained after newer successful work, partial evidence, original receipt/answer links and an unacknowledged publication that cannot produce a completed-work recommendation.
- Interrupted and returned discovery recovery, reopening an in-flight request without remounting or repurchasing it, and interrupted/returned onboarding-review drafts resumed with the existing key. Initial-setup drafts are not mistaken for review drafts; the banner clears only after profile acknowledgment.
- A bounded chronological twelve-record history, four-record initial view, keyboard expansion/focus and responsive layouts at 320 and 1440 pixels. Both viewport screenshots were inspected.

The [portable contract pack](PORTABLE-CONTRACTS.md) adds 86 fixed JSON vectors plus a manifest-coverage test, executed through adapters calling the actual TypeScript domain functions. Its seven suites cover questions, measurement, citations, plans, reports/backups, money and continuity. The optional Python standard-library harness validated fixture structure; missing adapters and deliberate mismatches failed as expected. **Native Python/Vue parity remains unverified:** no native adapter, importer, team-authorization or native-billing integration was implemented here. The proposed import preview and atomic/idempotent apply protocol are documented preparation.

The first full browser pass exposed two existing notification assertions that matched the new synchronization status as well as the intended toast. Those locators now target the actual notification. Focused continuity checks then passed 39/39 across all engines, followed by the final full 668-case production run and `npm run check` (317 tests, lint, route types, TypeScript and local documentation links; the final documentation-only pass checked 248 links). The production build passed. Tests retain zero retries and the isolated SQLite/synthetic-provider boundary. Current hosted checks and commit-specific CI are separate evidence in [GitHub Actions](https://github.com/tomcharlesosman/treg-lens/actions/workflows/test.yml).

## Saved page plans, follow-up measurements and agent reports — 20 October 2026

This release extends standalone revision `dcc25c1`. It retains the eight runtime dependencies and the existing database schema. Plans, report snapshots and strategy context are optional validated workspace fields, so older workspaces and backups remain readable. No real workspace was reset and no paid live provider calls were made.

New and extended production HTTP/browser scenarios cover:

- Owned/proposed/later page decisions, deterministic editable briefs, status/change dates, optional strategy context, confirmed deletion and separate legacy completed moves.
- Reload durability, failed-save draft recovery, stale editor and active-brand guards, full backup/restore, per-key isolation and onboarding reruns retaining plans/reports and same-brand strategy.
- A separately approved follow-up through real application routes using fixture upstreams: the saved baseline determines the questions, collector/market scope and historical competitor identities; current profile, question library and monitoring remain unchanged.
- Refusal of unowned, stale, legacy, deleted or unsupported baseline requests and missing ceilings before provider submissions. Concurrent plan edits win over automatic follow-up linking while the purchased evidence remains saved.
- Original answer/citation comparison, explicit missing evidence, matching scope/competitors, later collection, publication chronology and the 90% coverage threshold. Partial or incompatible samples do not acquire a change delta.
- Immutable reports that survive source-audit deletion and profile changes; rejected same-ID edits, bounded imports, cross-brand exclusion, unknown billing, exact JSON evidence, safe Markdown, explicit deletion and the report limit.
- Report save failures retaining the exact unacknowledged snapshot; private Markdown/JSON downloads and agent handoffs without paid calls or credential fields; keyboard focus restoration and expanded printable evidence.

Responsive plan/comparison/context and report/library/handoff views are checked at 320, 390 and 1440 pixels. Desktop, phone and expanded-print screenshots were inspected. The first full pass identified one WebKit overflow in a native audit selector; its label now stays within the control, with the original strict layout assertion retained. Focused checks passed in all three engines before the final 626-case full rerun passed. Earlier targeted checks also corrected report focus restoration and ambiguous test locators.

The first hosted CI run for `e73dd8f` passed all four platform-check jobs and 625 of 626 browser/API cases. Linux WebKit exposed an additional 320-pixel native-select painting overflow that did not reproduce on macOS. The follow-up control now uses explicit sizing and a decorative arrow while preserving the native select, labels, options, focus and keyboard interaction. The layout assertion and zero-retry policy remain unchanged. After this correction, all three focused responsive cases, `npm run check`, and the complete 626-case production suite passed locally again. Commit-specific hosted results remain available in [GitHub Actions](https://github.com/tomcharlesosman/treg-lens/actions/workflows/test.yml).

The suite uses a production build, isolated SQLite storage, synthetic keys and fail-closed upstream fixtures. It does not establish live provider availability or current upstream model quality. Hosted release verification remains separate from these automated results. Workflow instructions are in [WORKFLOWS.md](WORKFLOWS.md).

## Discovery, comparable trends and citation exploration — 20 October 2026

This release extends standalone revision `e3adaef`. No runtime dependency, database schema, identity provider or monitoring consent was added. Existing snapshots/backups remain readable; new evidence metadata is optional and validated/field-projected on save and restore.

New production HTTP/browser scenarios use the real application routes with synthetic upstreams:

- Relevant editable discovery seeds, empty guidance, acknowledged original research saves, no-selection history, downloads/imports, partial/unknown billing and call IDs.
- A lost paid response whose original receipt remains on the server; blocked browser recovery; and historical viewing/import that cannot clear a separate interrupted request.
- Stable question IDs, pause/edit/archive/restore, searchable type/intent/topic filters, bounded rendering, complete topic edits under a live filter, unchanged approved schedules and a paused question's one-off audit without reactivation.
- Same-scope daily comparisons, separate mention/citation rates, neutral/branded filters, visible answer coverage, low-coverage/model-change suppression, legacy inspection and historical competitor identity gaps.
- Every cited page retained under domain/page views, safe ownership filters, distinct answered-check coverage, per-engine counts, independent competitor citation rates and exact answer/page drilldowns without a paid lookup.
- A full browser backup round trip preserving receipts, prompt metadata and collection snapshots; server-side owner isolation with an alternate paying key, and rejection of inconsistent scope metadata and stale accepted discovery prices.

Library regressions additionally cover atomic concurrent discovery/audit appends, unchanged originals, idempotent receipt replay, legacy round trips, credential stripping and context isolation. Detailed cases live in [the testing guide](TESTING.md). These automated checks do not use live paid providers; deployment smoke checks are recorded separately.

## Rerun onboarding from Settings — 20 October 2026

This change is based on standalone revision `5454b1d`. An existing key can open **Settings → Rerun onboarding**, return to its original workspace without applying draft edits, and reopen/reload the same separate review draft. No key replacement, server reset, completion-marker clearing, new dependency or database migration is used.

Nine new browser scenarios run against the real production session, research and storage routes with synthetic upstream responses. They verify:

- Prefilled context, phone layout, draft resume and an unchanged saved snapshot after returning.
- Retained audits/answers, all existing tracked questions, completed moves, source research, legacy receipts and long business descriptions after saving; separately configured monitoring is unchanged.
- A newly approved research request uses the current session once, retains old/new receipts through return and reload, and saves before opening a separate unpaid audit review.
- A rejected save preserves both the draft and old server snapshot, and a later deliberate save succeeds.
- A newer server revision adopted by a free refresh cannot be attached to stale review edits; explicit profile reload retains the new research receipt before review resumes.
- A lost save acknowledgment produces neither another paid request nor a stale overwrite; the committed result remains inspectable on return.
- Unsaved Settings edits prevent accidental entry, and switching keys cannot inherit another key's review draft.
- An already submitted audit remains mounted/running through entry and return, then records exactly one purchased result.
- Unsynced paid answers from a simulated append failure cannot be discarded by profile reload; returning and retrying normal sync retains them on the server.

The append-failure case changes only the test's isolated synthetic snapshot and delays/edits its HTTP response; it does not add a production bypass or touch real databases. Opening, returning, reloading and saving the wizard are checked for no implicit research/audit/schedule requests. The phone screenshot was inspected. All paid provider results remain fixtures; this run makes no paid live Treg calls. Hosted release checks are separate from these automated counts.

## Before-PR onboarding improvements — 20 October 2026

This earlier pass targeted the original standalone repository at `/Users/ozzy/Projects/treg-lens`, on top of `56aa1cb`, before the later `5454b1d` release. At verification time no PR, push or deployment had been made. The separate native Treg integration and OpenSEO reference fork were not changed. No runtime dependency was added.

The reviewed profile now includes buyer context, explicit US/English measurement coverage, editable competitor websites, evidence-linked suggestions, and buyer-question intent and provenance. Three questions form a small starter selection; owners can revise it and retain reviewed unselected ideas. Original research input, sources and charges are saved separately from profile edits and can be reopened from the workspace. A name-only correction keeps a competitor's website while invalidating its old research rationale and supporting link.

Research and audit have separate approvals. Changing website or buyer context invalidates the research quote. If browser storage cannot retain the interruption marker, paid research is refused before submission; manual setup remains available. The audit server also refuses a refreshed catalog estimate above the amount approved in the dialog before making a paid call. Saving a profile enables neither an audit nor recurring monitoring.

First-audit findings use saved answers and citations, with exact evidence links and a few suggested investigations. Missing answers are disclosed before findings and are not counted as brand absence. Unknown charges remain visible. No new research is purchased to produce these findings, and they make no causal ranking or traffic claims.

New production browser regressions cover competitor correction through back/reload/server save, buyer context and intent/provenance persistence, original receipt input after later profile edits, free manual setup, stale approvals, safe citations, partial/unverified research, blocked storage, saved receipt access, and partial first-result inspection at phone width. New HTTP/library cases cover context bounds, unsupported markets, approved estimate ceilings with zero provider submissions, metadata validation, bounded receipts, backward-compatible workspace snapshots, and finding denominators/deduplication. The first targeted run exposed ambiguous accessible names on two controls and an outdated URL-error assertion; those were corrected and the affected cases rerun.

All new upstream responses were synthetic fixtures. This earlier pass made **zero paid live Treg calls** and did not establish current provider suggestion quality or hosted behavior. Desktop website/profile/question screens and phone findings were inspected visually. The hosted checks later in this document retain their original scope.

## URL-led brand onboarding baseline — 20 October 2026

New users sign in through the actual session route, enter a website, approve a research estimate, review editable brand/competitor suggestions, choose buyer questions, and save before reviewing a first audit. Eighteen onboarding scenarios run in each browser, including manual setup without research, existing-workspace compatibility, cross-browser persistence, key-scoped drafts, changing websites, keyboard/mobile use, interrupted requests, partial/unknown billing, save failures, revision conflicts, and lost save acknowledgments. Separate HTTP tests verify authentication, origin checks, public URLs/DNS, refreshed price ceilings, structured provider contracts, response bounds and duplicate-submission guards.

The review stays open until the server acknowledges the saved profile. A failed save never puts a completion marker into the active browser cache; reloading keeps the recoverable draft. If the server committed but its acknowledgment was lost, a reload adopts that saved profile without another write or paid request. Desktop and 390-pixel screenshots were also inspected.

The anonymous live Treg catalog verified the native `exa.web.answer` contract and fixed price. Onboarding's paid provider responses were tested with fixtures; this verification made **zero paid live onboarding calls**. No dependency or hosting configuration changed.

## Real Neon storage smoke — 20 October 2026

A separate check used the provisioned Neon database and synthetic owner namespaces to verify remote compare-and-swap, atomic audit append, runner leases, budget reservations/settlement, and retained-result recovery. All synthetic owner rows were removed afterward. It made **zero paid Treg calls**. This establishes that the remote storage adapter worked against that database at the time checked; it is separate from the fixture test count and does not claim a public Vercel deployment or live scheduled-provider run.

Open-source onboarding includes 12 setup regressions for stable existing secrets, private file creation, Windows line endings, empty and duplicate overrides, test-mode handling, Node minimums, and environment precedence. `npm run check` also verifies local documentation links and heading anchors. The earlier onboarding verification used a source-only copy in a directory containing spaces for clean install, repeated setup with byte-for-byte secret preservation, doctor, checks, and a fresh production build with external network connections blocked. No environment file, dependency installation, or build cache was copied into that installation. Fonts remain vendored with licenses and provenance. Current commit-specific clean installs and platform results are recorded by GitHub Actions.

## Fresh-clone onboarding — 20 October 2026

Committed revision `f7e32f03295b2286f1f17aa332ce34a5571c0e2d` was cloned into a new temporary directory named **Treg Lens Fresh Fork**, whose path contains spaces. The host was macOS arm64, Node.js 22.22.3 and npm 10.9.8. No private configuration, data, `node_modules`, `.next`, or `.vercel` files were copied. npm used a new cache and empty user configuration. An allowlisted environment excluded inherited database, Vercel, Treg, session, cron, and Node-preload settings, with `TREG_STORAGE=sqlite` explicitly selected.

| Command | Outcome | Duration |
| --- | --- | ---: |
| `npm ci` | Passed; locked dependencies installed | 18.78 s |
| `npm run setup` | Passed; new private local secret | 0.13 s |
| `npm run doctor` | Passed; SQLite selected, values hidden | 0.13 s |
| `npm run check` | Passed; 121 tests and 176 local documentation links | 10.84 s |
| `npm run build` | Passed; production routes generated | 6.24 s |

The generated secret had 64 characters and mode 0600, and was absent from the captured command logs. The clone remained clean. Install/check/build created no application data directory and made no paid calls or deployment. The install reported the already documented development-linter advisory; no forced dependency changes were applied. This earlier repeat installation check is separate from the current suite count.

## Public Vercel smoke — 20 October 2026

The public app at [treg-lens-tom-osmans-projects.vercel.app](https://treg-lens-tom-osmans-projects.vercel.app) completed an 11-check hosted smoke, with **zero paid Treg calls**. Verified outcomes included:

- Public storage health and anonymous denial on workspace, monitor, and cron routes.
- Real free-key browser sign-in with a Secure session cookie and no credential in browser storage.
- Durable workspace save/reload against the hosted database.
- An exact 8 MiB incompressible synthetic snapshot saved through eight 1 MiB chunks, with streamed commit/GET/conflict responses, revision protection, and idempotent committed replay.
- Logout and precise removal of the temporary synthetic records.

A separate authenticated manual cron invocation successfully updated the worker heartbeat. After production promotion, Vercel's scheduler independently delivered `GET /api/cron/monitor` at **08:03:35 UTC**, with HTTP 200 and the `vercel-cron/1.0` user agent. The database heartbeat advanced to match it. The deployed schedule is once per minute, and the deployed function reports the intended 360-second timeout. There were no enabled user schedules and no paid calls. These hosted checks are separate from the fixture test count and do not claim a live scheduled paid audit. The earlier paid-provider check retains its original date and costs below.

The final code at `b5e7f40` passed the complete 474-test suite again and the 11-check public smoke after promotion. Runtime-only SQLite paths are excluded from build tracing: all 24 emitted trace manifests exclude private data, environment files, outputs and SQLite databases. The Vercel production build completed without the earlier whole-project tracing warnings.

The post-smoke runtime log scan found **zero errors in the preceding 30-minute window**. This is a point-in-time observation, not an uptime guarantee.

## Issues found and fixed

1. **Short desktop windows:** the fixed sidebar could put Settings below the reachable viewport. It now scrolls independently.
2. **Malformed saved records:** incomplete project records and invalid answer arrays could crash the workspace after reload. Stored snapshots are validated before hydration; invalid optional research caches are ignored.
3. **Legacy key cleanup:** malformed workspace JSON prevented deletion of an early plaintext session-storage key. Cleanup now runs independently, including on the demo route.
4. **Production prerendering:** time-sensitive session decryption could run during speculative rendering. Authentication now waits for the actual request.
5. **Dialog keyboard behavior:** native dialogs could let Tab leave their controls, and WebKit did not consistently return focus to the opener. Forward/reverse focus cycling and explicit opener focus now work across the three engines.
6. **Slow initial sign-in:** Linux WebKit exposed a race where a key could be entered before React attached its change handlers, leaving the submit button disabled. Key controls now wait for client readiness. A regression test deliberately holds JavaScript downloads before entering a key.
7. **Switching keys without signing out:** cached client navigation could retain the previous workspace's in-memory state when a different key selected a fresh storage namespace. The authenticated workspace is now mounted with that namespace as its React key. The isolation regression switches keys through the real UI, verifies an empty second workspace, then switches back and checks the original history and completed moves.
8. **Returning to a cached sign-in form:** a successful submission left the cached form busy, so switching back to a different key could leave its input disabled. Successful verification now clears the busy state, and changing keys resets the form's error and visibility state.
9. **Late session checks:** an in-flight session lookup could replace a key form after the user had started entering a different key. Explicit key entry now takes priority over the background lookup. The regression holds the session response until another key has been entered, then verifies that exact key is submitted.
10. **Delayed dialog focus:** the dialog's opening animation frame could move focus from an already selected textarea to the brand field, sending typing into the wrong control. Initial focus now preserves an existing selection inside the dialog. The regression holds and releases the opening frame after focusing the prompt field.

Each fix is covered by an end-to-end regression. The storage validator also has library regression tests. Browser tests fail on uncaught page errors.

The durable-product review additionally fixed asynchronous reservation headers being mistaken for settled charges, discarded paid evidence when a workspace is full, late-worker schedule drift, lost evidence after a post-collection crash, stale client responses, fallback writes before server verification, and full-backup envelope size limits. These cases have targeted HTTP, browser or library regressions in the suites above.

## Live Treg checks — 19 October 2026

These requests ran separately against the development instance with a private key. They are not part of CI and did not use fixture responses.

| Check | Result | Settled cost |
| --- | --- | ---: |
| Key sign-in | HTTP 200; authenticated; no key in the public response | $0 |
| Four-engine audit | HTTP 200; 4 answers; no provider errors | $0.013478 |
| Two-seed discovery | HTTP 200; 18 candidates; no provider errors | $0.007700 |
| Source research of `treg.to/aeo` | HTTP 200; page title and evidence returned; no provider errors | $0.007667 |
| **Total** | **Below the $0.032308 catalog estimate** | **$0.028845** |

Live success confirms these small requests worked at the time tested. It does not guarantee future provider availability, response content or pricing. Failure conditions, billing uncertainty and security boundaries are exercised with fixtures.

## Reproduce and inspect

```bash
npm ci
npm run setup
npm run doctor
npx playwright install chromium firefox webkit
npm run check
npm run test:e2e
npm run test:e2e:report
```

The full local HTML report is `output/playwright/report/index.html`; machine-readable results are `output/playwright/results.json`. Failure traces and screenshots stay under the ignored output directory. The GitHub Actions workflow reruns the production browser/API suite on Ubuntu with Node.js 24 and uploads its report. Fast checks additionally exercise clean setup and library tests on Linux with Node.js 22.13/24, Windows, and macOS.

The local verification host uses Node.js 22.22.3, Next.js 16.4.2 and Playwright 1.61.1. See the coverage guide for the macOS 14 WebKit compatibility note and HTTPS test setup.
