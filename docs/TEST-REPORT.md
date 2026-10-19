# Full feature verification — 19 October 2026

The [coverage guide](./TESTING.md) maps the implemented features to their browser, HTTP and library tests. The normal suite uses synthetic provider responses; a separate live smoke verified the Treg boundary.

## Results

| Suite | Passed | Failed / skipped |
| --- | ---: | ---: |
| HTTP API | 81 | 0 / 0 |
| Chromium browser workflows | 42 | 0 / 0 |
| Firefox browser workflows | 42 | 0 / 0 |
| WebKit browser workflows | 42 | 0 / 0 |
| Library tests | 47 | 0 / 0 |
| **Total** | **254** | **0 / 0** |

The complete 207-case API/browser run passed in approximately 1.2 minutes with retries disabled. Lint, TypeScript and the production build also passed. Responsive browser cases exercised 320, 390, 768 and 1440-pixel widths. All three browser engines completed the same 42 scenarios.

## Issues found and fixed

1. **Short desktop windows:** the fixed sidebar could put Settings below the reachable viewport. It now scrolls independently.
2. **Malformed saved records:** incomplete project records and invalid answer arrays could crash the workspace after reload. Stored snapshots are validated before hydration; invalid optional research caches are ignored.
3. **Legacy key cleanup:** malformed workspace JSON prevented deletion of an early plaintext session-storage key. Cleanup now runs independently, including on the demo route.
4. **Production prerendering:** time-sensitive session decryption could run during speculative rendering. Authentication now waits for the actual request.
5. **Dialog keyboard behavior:** native dialogs could let Tab leave their controls, and WebKit did not consistently return focus to the opener. Forward/reverse focus cycling and explicit opener focus now work across the three engines.

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
npx playwright install chromium firefox webkit
npm test
npm run lint
npm run test:e2e
npm run test:e2e:report
```

The full local HTML report is `output/playwright/report/index.html`; machine-readable results are `output/playwright/results.json`. Failure traces and screenshots stay under the ignored output directory. The GitHub Actions workflow reruns the same suite on Ubuntu with Node.js 24 and uploads its report.

The local verification host uses Node.js 22.22.3, Next.js 16.4.2 and Playwright 1.61.1. See the coverage guide for the macOS 14 WebKit compatibility note and HTTPS test setup.
