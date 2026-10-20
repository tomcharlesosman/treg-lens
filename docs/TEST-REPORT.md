# Full feature verification — 20 October 2026

The [coverage guide](./TESTING.md) maps the implemented features to their browser, HTTP and library tests. This pass covers the live workspace, shared SQLite/Postgres storage logic, backup restoration, hosted transport and budgeted monitoring. Automated production HTTP/browser tests use SQLite and synthetic provider responses. Separate real-Neon and public Vercel checks verified storage and hosted transport without paid Treg calls; the earlier dated live check below verified the paid Treg boundary.

## Results

| Suite | Passed | Failed / skipped |
| --- | ---: | ---: |
| HTTP API | 119 | 0 / 0 |
| Chromium browser workflows | 78 | 0 / 0 |
| Firefox browser workflows | 78 | 0 / 0 |
| WebKit browser workflows | 78 | 0 / 0 |
| Library, setup and operations tests | 121 | 0 / 0 |
| **Total** | **474** | **0 / 0** |

The complete 353-case production API/browser run passed with zero retries or skips: 119 HTTP tests plus 78 browser scenarios in each of Chromium, Firefox and WebKit. The 121 library/setup/operations tests also passed. Lint, TypeScript and the production build passed. Responsive browser cases exercised 320, 390, 768 and 1440-pixel widths, with each public route checked independently. The harness forces SQLite with a fresh private database and synthetic credentials; it never opens the development or hosted production workspace database.

New coverage includes server durability after clearing the browser cache, scoped legacy migration, failed-save recovery, revision conflicts, complete backup restoration, confirmed audit deletion, idempotent monitoring recovery merges, and an exact-8 MiB backup round trip with answer hashes checked. Worker HTTP tests make isolated schedules due and execute the actual auth, pricing, provider adapters, ledger and workspace routes. They cover success, UTC cadence, revocation, per-run/monthly budgets, partial failures, missing charges, pending reservations, and retained paid results when the workspace is full.

Library/operations regressions exercise cross-process SQLite reads, atomic rollback, encrypted credential ownership, concurrent runner leases, crashes before and after journaling, exact quote execution, UTC slot alignment, online WAL-consistent backups, and the real worker CLI against an isolated HTTP server. Existing coverage also includes completed prompt rechecks, audit/discovery continuation across dialog close/reopen, discovery selection limits and resets, and backup exports when browser storage rejects writes.

Hosted transport coverage exercises owner-bound uploads above the 3 MiB direct-save threshold, 1 MiB chunk limits, UTF-8 character boundaries, exact 8 MiB round trips, checksum/schema failures, immutable chunk replay, concurrent revision conflicts, expiry/abort, encrypted staging, bounded retention, and replay of the original committed snapshot after later edits. Client tests cover lost commit acknowledgments without duplicate writes; streamed JSON tests round-trip Unicode above the platform response limit. Hosted cron tests reject absent/incorrect bearer values and spoofed Vercel headers. The local POST runner and hosted GET dispatcher share the tested monitor domain logic. Remote-mode operations tests confirm local backup and pause commands refuse without touching an unrelated SQLite database or exposing credentials.

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

The generated secret had 64 characters and mode 0600, and was absent from the captured command logs. The clone remained clean. Install/check/build created no application data directory and made no paid calls or deployment. The install reported the already documented development-linter advisory; no forced dependency changes were applied. This repeat installation check is separate from the primary 474-test count.

## Public Vercel smoke — 20 October 2026

The public app at [treg-lens-tom-osmans-projects.vercel.app](https://treg-lens-tom-osmans-projects.vercel.app) completed an 11-check hosted smoke, with **zero paid Treg calls**. Verified outcomes included:

- Public storage health and anonymous denial on workspace, monitor, and cron routes.
- Real free-key browser sign-in with a Secure session cookie and no credential in browser storage.
- Durable workspace save/reload against the hosted database.
- An exact 8 MiB incompressible synthetic snapshot saved through eight 1 MiB chunks, with streamed commit/GET/conflict responses, revision protection, and idempotent committed replay.
- Logout and precise removal of the temporary synthetic records.

A separate authenticated manual cron invocation successfully updated the worker heartbeat. This proves the authorized handler ran; **scheduled platform cron delivery has not yet been verified**. These hosted checks are separate from the fixture test count and do not claim a live scheduled paid audit. The earlier paid-provider check retains its original date and costs below.

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
