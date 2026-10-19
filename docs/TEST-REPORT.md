# Full feature verification — 19 October 2026

The [coverage guide](./TESTING.md) maps the implemented features to their browser, HTTP and library tests. The normal suite uses synthetic provider responses; a separate live smoke verified the Treg boundary.

## Results

| Suite | Passed | Failed / skipped |
| --- | ---: | ---: |
| HTTP API | 81 | 0 / 0 |
| Chromium browser workflows | 67 | 0 / 0 |
| Firefox browser workflows | 67 | 0 / 0 |
| WebKit browser workflows | 67 | 0 / 0 |
| Library and setup tests | 59 | 0 / 0 |
| **Total** | **341** | **0 / 0** |

The complete 282-case API/browser run passed with retries disabled. Lint, TypeScript and the production build also passed. Responsive browser cases exercised 320, 390, 768 and 1440-pixel widths, with each public route checked independently. All three browser engines completed the same 67 scenarios. Coverage includes completed prompt rechecks, audit/discovery continuation across dialog close/reopen, discovery selection limits and resets, and successful backup exports when browser storage rejects writes.

Open-source onboarding adds 12 setup regressions for stable existing secrets, private file creation, Windows line endings, empty and duplicate overrides, test-mode handling, Node minimums, and environment precedence. `npm run check` also verifies local documentation links and heading anchors. A source-only copy in a directory containing spaces passed `npm ci`, setup, repeated setup with byte-for-byte configuration preservation, doctor, checks, and a fresh production build with external network connections blocked. No existing environment file, dependency installation, or build cache was copied into that installation. Fonts are vendored with licenses and provenance.

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

## Live Treg checks

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
