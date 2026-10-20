# Testing Treg Lens

Use Node.js 22.13 or later (Node.js 24 is used in CI).

```bash
npm ci
npm run setup
npm run doctor
npx playwright install chromium firefox webkit
npm run check
npm run doctor -- --e2e
npm run test:e2e
```

`test:e2e` builds the production app, starts an isolated HTTPS test server, runs the HTTP and browser tests, and stops the server. It does not reuse the development server or require a Treg account. Two workers stay within the application's concurrent-request guards. Retries are disabled so a flaky failure is visible.

OpenSSL must be available on `PATH` (it is available on the macOS development host and Ubuntu CI). The server generates a temporary localhost certificate, proxies to the production app on loopback, and removes the certificate on exit. Only the test clients accept this self-signed certificate. Production `Secure` cookie behavior is preserved, including in WebKit, which refuses these cookies on plain HTTP loopback.

OpenSSL is **not needed for app setup or the demo**: setup generates the session secret with Node's crypto module. On Windows, use an OpenSSL installation already provided by your development tools or install it from a trusted provider and add its executable directory to `PATH`; verify with `openssl version`. Git for Windows often includes it in its tools directory, but PowerShell may not have that directory on `PATH`. On Linux, Playwright may also need OS libraries: use `npx playwright install --with-deps chromium firefox webkit`. No Playwright browser binaries are needed for `npm run check`.

`npm run doctor -- --e2e` reports missing browsers/OpenSSL or occupied test ports before you run the suite. The test certificate initializer removes its temporary directory even when OpenSSL fails. A source checkout also contains local licensed fonts, so fresh production builds do not need a Google Fonts connection.

`npm run check` includes route type generation before TypeScript, library/setup tests, and local Markdown-link checks. The setup regressions cover repeat runs, preserving secrets, invalid overrides, file precedence and Windows line endings. `npm run test:e2e:ui` builds before opening Playwright's interactive test runner; stop another E2E runner before using it.

For a targeted rerun after building:

```bash
npx playwright test --project=api
npx playwright test tests/e2e/workspace.spec.ts --project=chromium
npm run test:e2e:report
```

## Coverage

The complete local pass on **20 October 2026** passed **474 test executions**: 121 library/setup/operations tests and 353 production E2E tests (119 HTTP API plus 78 scenarios in each of Chromium, Firefox and WebKit), with zero failures, retries or skips. The separate real-Neon storage smoke made no paid Treg calls. See [the dated report](TEST-REPORT.md) for scope and evidence; these counts do not claim a public deployment.

| Area | Coverage |
| --- | --- |
| Public pages | Product links, fork destinations, navigation anchors, all FAQ disclosures, compact sign-in, and demo entry points |
| Sign-in and session | Slow JavaScript/client readiness, late session responses during key entry, required key, reveal/hide, trimmed input, invalid and unscoped keys, unavailable/malformed upstream responses, busy states, retries, encrypted cookie flags, reload, switching keys, logout and logout failure |
| Demo boundaries | All paid/account entry points require sign-in, demo edits stay separate from private saved workspaces, exports are labeled illustrative |
| Settings and storage | Empty workspace, project validation, competitors, durable server save/reload, cross-browser per-key isolation, revision conflicts, browser recovery/migration, malformed data, legacy key removal, and backup of unsaved changes |
| Full backups | Complete versioned workspace export/import, replacement confirmation, rejected filtered/demo/credential-bearing files, exact-8 MiB round trips, confirmed audit deletion, idempotent recovery merges, and source-research preservation |
| Hosted transport | Automatic chunk saves above 3 MiB, 1 MiB request bounds, owner isolation, encrypted staging, checksums/UTF-8/schema, immutable replay, lost acknowledgments, revision conflicts, expiry/abort, bounded retention and streamed large JSON |
| Scheduled monitoring | Explicit configuration/consent, encrypted credentials, runner authorization, UTC schedule/heartbeat, budgets/reservations, fixture-backed due-job execution, retained partial evidence, interruption pauses, and recovery download |
| Hosted cron and operations | Independent cron bearer auth, rejection of spoofed platform headers, shared monitor execution rules, fail-closed storage selection and remote refusal by SQLite-only backup/pause commands |
| Audits | Live estimate UI, price breakdown, prompt/engine validation, example prompts, four-engine run, result details, partial/all failures, balance errors, unknown billing, background completion across close/reopen without duplicate requests, completed rechecks and latest-answer persistence |
| Prompt tracking | Add, case-insensitive duplicate prevention, remove, tabs, search, keyboard shortcut, empty answers and prompt recheck |
| Discovery | Seed validation, estimates, keyword/People Also Ask results, volumes, tabs, deduplication, selection/import, combined eight-selection limit, reset/change seeds, background continuation and retained results, partial failures and pending reservations |
| Analytics | Date/engine filters, metric denominators, chart legends, competitor comparisons, source coverage, answer evidence and history |
| Sources | Paid Moz/Exa route integration, authority/metadata, excerpts, observed contacts, missing fields, partial failures, cache/reopen, refresh and costs |
| Opportunities | Gap selection, content brief, clipboard success/fallback, mark complete/reopen and persistence |
| Reports | Workspace JSON and CSV, individual audit downloads, data integrity, multiline/Unicode/formula escaping and absence of credentials |
| Interaction | Mobile navigation, activity/help links, dialog naming, delayed opening focus, focus containment/restoration, Escape and layout at 320, 390, 768 and 1440 pixels |
| HTTP boundaries | Every route's supported methods, JSON/body limits, origin checks, anonymous denial, explicit-key validation, no operator-key fallback, revoked/tampered sessions, duplicate throttling and private-URL/DNS rejection |
| Untrusted content | Safe Markdown, no executed HTML/scripts, blocked unsafe links and no remote tracking images |

The browser scenarios run in Chromium, Firefox and WebKit. The API project runs once against the same production server. The library suite additionally covers provider parsing, domain/brand matching, scoring, session expiry/rotation, SQLite snapshot validation/CAS/append, monitor encryption/leases/UTC cadence/reservations/crash handling, and consistent database backups.

Playwright is pinned to 1.61.1 so this checkout can also exercise the frozen WebKit build available on macOS 14. Newer Playwright clients fail before creating a page on that OS because of an [upstream protocol mismatch](https://github.com/microsoft/playwright/issues/42964). Ubuntu CI uses the WebKit version bundled for Linux with the pinned release. Browser-engine tests do not replace testing a particular installed Safari release on its target OS.

## Provider boundary and costs

Normal automated runs use `tests/e2e/support/treg-fixture.cjs` as a Node preload **only in the test server process**. The HTTPS harness forces `TREG_STORAGE=sqlite`, excludes inherited remote configuration, and supplies a temporary `TREG_DATA_DIR`; it never uses the development or production workspace database. Scheduler integration tests make a schedule due in that isolated database and invoke the real internal runner route. This test-only database manipulation is not a public application endpoint or authorization bypass. Application route handlers, request validation, session encryption, browser code, storage and downloads remain real. The fixture replaces Treg's network responses, checks request contracts and spend guards, and refuses unknown Treg paths. Its keys and session secret are synthetic, public test data. The application has no test authentication endpoint or configurable upstream bypass.

Fixtures cover provider success, refusal, partial errors, insufficient balance, pending work and missing billing headers. They do not establish that a live upstream provider is currently available. Live checks must be run separately with a private key, fresh estimates and an explicit spending budget; never add them to the default suite or CI.

Reports, screenshots and failure traces are written under the ignored `output/playwright/` directory. Do not put real keys, session cookies or private customer data into test fixtures or uploaded reports.

## CI

`.github/workflows/test.yml` runs on pushes to `main` and pull requests. Fast checks exercise clean install, repeated setup, doctor, lint, type generation, library/setup tests and docs on Linux with Node.js 22.13/24, Windows with Node.js 24, and macOS with Node.js 24. A separate Ubuntu 24.04 job installs all three browsers, audits production dependencies, builds and runs the API/browser suite, and uploads reports and failure artifacts for 14 days. No Treg or deployment secrets are required. Action revisions are pinned; Dependabot proposes updates. A newer push cancels an older run of the same branch.

## Durable storage and worker verification

The live product persists workspaces and schedules through shared SQLite/Postgres domain logic. Local fixture passes do not by themselves prove a hosted Postgres transaction or Vercel transport works; those checks must be recorded separately. A fixture-backed pass establishes the tested database, revision, import, and runner behavior; it does not prove a production disk is persistent or a worker is supervised. Verify `/api/health`, save/reload from a fresh browser with the same key, a reviewed full-backup restore, and an enabled worker heartbeat on the actual host. Paid live verification still requires deliberate inputs and a spending limit.

For operations, `npm run backup -- /private/path/new.sqlite` produces a consistent SQLite backup without a CLI/database package. Keep real databases and their credentials out of test artifacts. For SQLite, stop server/worker and use `npm run monitor -- --pause-all` before restarting from an old backup; remote mode is refused and uses the documented provider/private SQL recovery procedure; external billing is not rolled back by restore.

The dated [verification report](TEST-REPORT.md) records the complete local pass, fresh-clone onboarding at `f7e32f0`, and separate real-Neon/public-Vercel smoke results. Hosted checks made no paid Treg calls. Manual authenticated cron heartbeat passed; scheduled platform delivery remains separately unverified. GitHub Actions records results for each commit; use that run when checking a particular checkout.
