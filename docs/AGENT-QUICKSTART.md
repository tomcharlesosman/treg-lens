# Agent quickstart

Give a coding agent the prompt below to get a working local instance before making changes. The [README](../README.md) is the short human setup path; [getting started](GETTING-STARTED.md) covers troubleshooting and first use. No Treg account is needed to set up, test, or explore the demo.

## Copy this prompt

```text
Set up Treg Lens locally in this checkout and verify that it works.

1. Read AGENTS.md, README.md, and docs/AGENT-QUICKSTART.md. Before changing
   Next.js code, read the relevant installed guide in node_modules/next/dist/docs/.
2. Use Node.js 24 LTS (minimum 22.13), npm, and the existing package-lock.json.
   Run npm ci, npm run setup, and npm run doctor. Use the provided scripts.
   Preserve existing environment files and a valid SESSION_SECRET. Never print
   secrets, silently rotate a secret, or remove configuration to pass a check.
   If configuration is invalid, explain the precise issue without exposing it.
3. Run npm run check. Fix relevant failures while preserving the application's
   credential, storage, cost, accessibility, and test boundaries.
4. Start npm run dev on an available local port. Reuse an existing server only
   after verifying that it belongs to this checkout. Verify that / and /demo
   return successfully and show the marketing page and labeled demo workspace.
   Use an available browser to check the visible pages; report honestly if only
   HTTP verification is available. Keep the server available for me to inspect.
5. Use the key-free demo and fixture-backed tests. Do not request or print my
   Treg key, run paid provider calls, publish a repository, or deploy publicly
   unless I explicitly ask. Do not add services or dependencies just for setup.
6. Report the local preview URL, commands/checks completed, any fixes, and any
   remaining issue. Do not claim browser or live-provider checks you did not run.
```

For a specific change, append the desired behavior and acceptance criteria. If you want a public deployment or a live audit, state the destination or research inputs and spending constraints separately.

## The working baseline

Use these commands from the repository root. They work in macOS/Linux terminals and Windows PowerShell:

```bash
npm ci
npm run setup
npm run doctor
npm run check
npm run dev
```

Open `http://localhost:3000/` and `http://localhost:3000/demo`. If port 3000 is occupied, use `npm run dev -- --port 3001` and report the actual URL. Do not stop an unrelated server to claim its port.

`setup` uses Node's built-in cryptographic generator to create a 64-character secret. A new `.env.local` is written with mode `0600` where supported; the value is never printed. Repeated setup preserves a valid nonempty secret. An existing invalid nonempty value is refused, and a higher-priority empty override may need deliberate correction. Secret rotation invalidates cookies and changes browser workspace namespaces, so it is not a routine setup repair. Setup and doctor make no Treg requests.

A successful baseline means the demo loads without a key, the local checks pass, and private configuration stays private. The demo uses illustrative data and does not persist its edits. `/login` is for a user to paste their own team-scoped key when they choose live research; agents do not need a key for setup.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact locked dependencies |
| `npm run setup` | Configure a local secret without replacing valid existing configuration |
| `npm run doctor` | Check Node, locked direct packages, and effective secret configuration; values hidden |
| `npm run check` | Lint, Next route type generation, TypeScript, library/setup tests, local documentation links |
| `npm run dev` | Start the local development app |
| `npm run build` | Build production assets; no Treg credential required |
| `npm run doctor -- --production` | Check production environment-file precedence and runtime dependencies |
| `npm run doctor -- --e2e` | Check browser binaries, OpenSSL, and free test ports 3100/3101 |
| `npm run test:e2e` | Build and run real production HTTP/browser flows against synthetic upstream fixtures |
| `npm run test:e2e:ui` | Build, then open Playwright's interactive runner |
| `npm run test:e2e:report` | Open the latest saved browser/HTTP report |

The full E2E suite needs Playwright browser binaries and OpenSSL for its temporary local HTTPS certificate. App setup does not need OpenSSL. Install engines with `npx playwright install chromium firefox webkit`; use [the testing guide](TESTING.md) for Linux OS dependencies and other platform details. Keep full E2E runs separate from the development server. The production test server uses ports 3100 and 3101 and refuses to reuse an existing process.

Synthetic `treg-e2e-*` keys and test provider responses belong only to the isolated E2E server. They are not valid login credentials for the normal development or deployed app. The test preload must never become a production startup option. Traces and reports may contain entered values and research data; keep real secrets out of them.

## Make a fork yours

1. [Fork Treg Lens](https://github.com/tomcharlesosman/treg-lens/fork), clone your repository, and run the baseline above before customizing. Use your fork's clone URL rather than changing an unrelated checkout's remotes.
2. Update [repository/fork constants](../src/lib/site.ts) so the in-app source and fork links point to your repository. Update `repository`, `bugs`, and `homepage` in [package.json](../package.json), then the clone/support destinations in [README](../README.md). If you rename the package, keep the lockfile consistent through npm.
3. Review [SUPPORT.md](../SUPPORT.md), [SECURITY.md](../SECURITY.md), and the URLs in [.github/ISSUE_TEMPLATE/config.yml](../.github/ISSUE_TEMPLATE/config.yml) and [bug_report.yml](../.github/ISSUE_TEMPLATE/bug_report.yml). Direct deployment-specific support and private reports to your own maintainers. Preserve upstream attribution and report upstream defects to the appropriate project.
4. Enable **private vulnerability reporting** and **security updates** for the fork in GitHub. These repository settings require a separate action; copying policy files or Dependabot configuration does not enable them. Verify the private reporting destination before advertising it. Review Actions permissions and the workflows you enable on your fork.
5. Update page metadata in [layout.tsx](../src/app/layout.tsx) and any relevant page metadata. Treg colors and styles live in [globals.css](../src/app/globals.css), [marketing.css](../src/components/marketing.css), and adjacent dialog CSS. Brand marks live in [public](../public). Preserve third-party engine identities and avoid implying an affiliation your fork does not have.
6. Update the repository-link expectations in [public-auth.spec.ts](../tests/e2e/public-auth.spec.ts) and [workspace.spec.ts](../tests/e2e/workspace.spec.ts) if those destinations change. Keep the assertions rather than removing the link coverage. Update screenshots and documentation when you change the visible product.
7. Retain [LICENSE](../LICENSE), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), and the [font licenses/provenance](../src/app/fonts/README.md). Application code is MIT licensed; bundled font terms remain separate. Review your own name/branding and provider terms before publication.
8. Run `npm run check` and the affected E2E suite. For authentication, state isolation, storage, framework, or navigation changes, run the full browser matrix. Follow [deployment](DEPLOYMENT.md) only when you intend to publish a hosted instance.

## Keep the footprint small

There are seven direct runtime packages: Next.js, React, React DOM, iron-session, lucide-react, react-markdown, and remark-gfm. They provide the app framework, encrypted cookies, icons, and Markdown rendering. Treg calls use native `fetch`; charts use local SVG and calculations; onboarding scripts use Node built-ins. No database, Redis, Docker, ORM, managed identity provider, Treg SDK, or agent framework is required. See the [dependency rationale](DEPENDENCIES.md) before adding a package.

Fonts are checked in, approximately 102 KB total, and loaded with `next/font/local`. They include licenses and provenance and require no Google Fonts download at build or runtime. Do not reintroduce a network font dependency as a setup shortcut.

## Boundaries to preserve

- Paid routes require the caller's validated key or encrypted session. Keep provider URLs and endpoint IDs allowlisted. Never turn operator environment credentials into a public fallback.
- Quotes use current catalog prices and paid work refreshes them. Preserve per-call ceilings, partial results, provider errors, and the distinction between unknown and zero cost. Do not automatically retry ambiguous paid work.
- Session keys belong in the encrypted HttpOnly cookie; optional overrides remain in memory. Keep plaintext keys out of source, logs, `localStorage`, `sessionStorage`, screenshots, and exports.
- Project history is browser-local, separated by key and deployment secret. Namespaces do not encrypt local history. JSON is a report backup, with no import/restore UI or automatic migration between secrets. Preserve snapshot validation and demo isolation.
- Audit and discovery continue across dialog close/reopen in the same mounted tab; they are not durable jobs. Preserve accessible focus behavior and safe rendering of untrusted answer content.

Use [architecture](ARCHITECTURE.md), [API contracts](API.md), [contributing](../CONTRIBUTING.md), and [security](../SECURITY.md) for details. The [verification report](TEST-REPORT.md) distinguishes fixture coverage from dated live checks. State what you verified rather than treating either as a deployment guarantee.
