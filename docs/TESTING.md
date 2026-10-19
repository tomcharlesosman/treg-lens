# Testing Treg Lens

Use Node.js 22.13 or later (Node.js 24 is used in CI).

```bash
npm ci
npx playwright install chromium firefox webkit
npm test
npm run lint
npm run test:e2e
```

`test:e2e` builds the production app, starts an isolated HTTPS test server, runs the HTTP and browser tests, and stops the server. It does not reuse the development server or require a Treg account. Two workers stay within the application's concurrent-request guards. Retries are disabled so a flaky failure is visible.

OpenSSL must be available on `PATH` (it is available on the macOS development host and Ubuntu CI). The server generates a temporary localhost certificate, proxies to the production app on loopback, and removes the certificate on exit. Only the test clients accept this self-signed certificate. Production `Secure` cookie behavior is preserved, including in WebKit, which refuses these cookies on plain HTTP loopback.

For a targeted rerun after building:

```bash
npx playwright test --project=api
npx playwright test tests/e2e/workspace.spec.ts --project=chromium
npm run test:e2e:report
```

## Coverage

| Area | Coverage |
| --- | --- |
| Public pages | Product links, fork destinations, navigation anchors, all FAQ disclosures, compact sign-in, and demo entry points |
| Sign-in and session | Slow JavaScript/client readiness, required key, reveal/hide, trimmed input, invalid and unscoped keys, unavailable/malformed upstream responses, busy states, retries, encrypted cookie flags, reload, switching keys, logout and logout failure |
| Demo boundaries | All paid/account entry points require sign-in, demo edits stay separate from private saved workspaces, exports are labeled illustrative |
| Settings and storage | Empty workspace, project validation, competitors, persistence, per-key isolation, in-memory credential overrides, malformed JSON/records, legacy key removal |
| Audits | Live estimate UI, price breakdown, prompt/engine validation, example prompts, four-engine run, result details, partial/all failures, balance errors, unknown billing, persistence and rechecks |
| Prompt tracking | Add, case-insensitive duplicate prevention, remove, tabs, search, keyboard shortcut, empty answers and prompt recheck |
| Discovery | Seed validation, estimates, keyword/People Also Ask results, volumes, tabs, deduplication, selection/import, partial failures and pending reservations |
| Analytics | Date/engine filters, metric denominators, chart legends, competitor comparisons, source coverage, answer evidence and history |
| Sources | Paid Moz/Exa route integration, authority/metadata, excerpts, observed contacts, missing fields, partial failures, cache/reopen, refresh and costs |
| Opportunities | Gap selection, content brief, clipboard success/fallback, mark complete/reopen and persistence |
| Reports | Workspace JSON and CSV, individual audit downloads, data integrity, multiline/Unicode/formula escaping and absence of credentials |
| Interaction | Mobile navigation, activity/help links, dialog naming, focus containment/restoration, Escape and layout at 320, 390, 768 and 1440 pixels |
| HTTP boundaries | Every route's supported methods, JSON/body limits, origin checks, anonymous denial, explicit-key validation, no operator-key fallback, revoked/tampered sessions, duplicate throttling and private-URL/DNS rejection |
| Untrusted content | Safe Markdown, no executed HTML/scripts, blocked unsafe links and no remote tracking images |

The browser scenarios run in Chromium, Firefox and WebKit. The API project runs once against the same production server. The library suite additionally covers provider parsing, domain/brand matching, scoring and session expiry/rotation.

Playwright is pinned to 1.61.1 so this checkout can also exercise the frozen WebKit build available on macOS 14. Newer Playwright clients fail before creating a page on that OS because of an [upstream protocol mismatch](https://github.com/microsoft/playwright/issues/42964). Ubuntu CI uses the WebKit version bundled for Linux with the pinned release. Browser-engine tests do not replace testing a particular installed Safari release on its target OS.

## Provider boundary and costs

Normal automated runs use `tests/e2e/support/treg-fixture.cjs` as a Node preload **only in the test server process**. Application route handlers, request validation, session encryption, browser code, storage and downloads remain real. The fixture replaces Treg's network responses, checks request contracts and spend guards, and refuses unknown Treg paths. Its keys and session secret are synthetic, public test data. The application has no test authentication endpoint or configurable upstream bypass.

Fixtures cover provider success, refusal, partial errors, insufficient balance, pending work and missing billing headers. They do not establish that a live upstream provider is currently available. Live checks must be run separately with a private key, fresh estimates and an explicit spending budget; never add them to the default suite or CI.

Reports, screenshots and failure traces are written under the ignored `output/playwright/` directory. Do not put real keys, session cookies or private customer data into test fixtures or uploaded reports.

## CI

`.github/workflows/test.yml` runs library tests, lint and the production browser/API suite on pushes to `main` and pull requests. It pins Ubuntu 24.04 for a reproducible browser host, installs all three browser engines and uploads the Playwright report and failure artifacts for 14 days. No Treg or deployment secrets are required.
