# Agent quickstart

Give a coding agent the prompt below to get a working local instance before making changes. The [README](../README.md) is the short human setup path; [getting started](GETTING-STARTED.md) covers troubleshooting and first use. No Treg account is needed to install or verify the application with fixtures. Live use starts when the user connects their key; the private workspace persists on the application server.

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
   after verifying that it belongs to this checkout. Verify /api/health reports
   ready storage, / shows the marketing page, /login offers key entry, and /app
   requires sign-in. The optional /demo is illustrative, not the primary product.
   Use a browser where available; report honestly if only HTTP verification is
   available. Keep the app available for me to connect my key and inspect.
5. Use fixture-backed tests for private workspace and paid-provider flows.
   Do not print credentials, make paid calls, enable a paid monitor, publish,
   or deploy unless authorized. Let me enter my key in /login for live use.
   Do not add services or dependencies just for setup. Preserve the SQLite data
   directory and stable secret. Starting a worker does not authorize schedules.
6. Report the local preview URL, commands/checks completed, any fixes, and any
   remaining issue. Do not claim browser or live-provider checks you did not run.
```

For a specific change, append the desired behavior and acceptance criteria. If you want a public deployment or a live audit, state the destination or research inputs and spending constraints separately.

## Copy this deployment prompt

Replace the destination placeholders with the repository and Vercel team you authorize. This prompt authorizes deployment; it does not authorize paid Treg research or enabling user schedules.

```text
Deploy my Treg Lens fork publicly on Vercel using Neon storage.

Authorized repository: <exact GitHub owner/repository and branch>
Authorized Vercel team: <exact team name or ID>
Project: <existing project or authorized new project name>

Read AGENTS.md and docs/DEPLOYMENT.md. Reuse the selected project/database
if already connected; do not create duplicates or introduce AWS infrastructure.
Keep local .env.local and SQLite data intact. Store database connections and a
stable random SESSION_SECRET privately in production configuration. Never print
credentials or put them into code, logs, chat, build artifacts, or public variables.
Use the repository's guided Deploy with Vercel / Neon product flow where possible.
Account authentication, permissions, or provider terms may require my own action.

Run relevant checks. Use the checked-in Vercel config: its build command runs
the repeatable db:migrate script before building, so no manual SQL setup is needed.
Keep previews isolated from production data and secrets. Leave minutely cron
disabled unless I authorize Pro monitoring configuration; manual flows work on
Hobby. Do not upgrade a plan, enable paid user schedules, or run paid Treg calls.

Deploy the reviewed code to the authorized production project. Verify public
marketing, login, health, and protected workspace behavior without a Vercel bypass
or private login cookie. Let visitors enter their own Treg keys. Report the exact
production URL, deployed commit, checks performed, and any genuine remaining
account/permission step. Do not claim checks or a live URL that you did not verify.
```

## The working baseline

Use these commands from the repository root. They work in macOS/Linux terminals and Windows PowerShell:

```bash
npm ci
npm run setup
npm run doctor
npm run check
npm run dev
```

Open `http://localhost:3000/login` for live use. `http://localhost:3000/api/health` checks local storage readiness without Treg; `/demo` is an optional sample. If port 3000 is occupied, use `npm run dev -- --port 3001` and report the actual URL. Do not stop an unrelated server to claim its port.

`setup` uses Node's built-in cryptographic generator to create a 64-character secret. A new `.env.local` is written with mode `0600` where supported; the value is never printed. Repeated setup preserves a valid nonempty secret. An existing invalid nonempty value is refused, and a higher-priority empty override may need deliberate correction. Secret rotation invalidates cookies, changes server workspace namespaces, and prevents old monitoring credentials from being decrypted; it is not a routine setup repair. Setup and doctor make no Treg requests.

A successful baseline means local checks pass, the protected live application is available, SQLite is ready, and private configuration stays private. The user enters their own team-scoped key at `/login`; setup agents do not need it. The optional demo uses illustrative data and stays separate from durable private workspaces.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact locked dependencies |
| `npm run setup` | Configure a local secret without replacing valid existing configuration |
| `npm run doctor` | Check Node, locked direct packages, and effective secret configuration; values hidden |
| `npm run check` | Lint, Next route type generation, TypeScript, library/setup tests, local documentation links |
| `npm run dev` | Start the local development app |
| `npm run monitor` | Start the separate monitoring loop; users still explicitly enable schedules/budgets |
| `npm run monitor -- --once` | Check one due schedule for host-scheduler integration |
| `npm run db:migrate` | Explicitly prepare the selected database; Vercel's build command invokes it automatically |
| `npm run backup -- /private/path/new.sqlite` | Create a consistent online server backup in a new protected file |
| `npm run monitor -- --pause-all` | Offline SQLite recovery only; Postgres is refused and uses the documented remote procedure |
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

There are eight direct runtime packages: Next.js, React, React DOM, iron-session, lucide-react, react-markdown, remark-gfm, and `@neondatabase/serverless`. The last is the single driver for optional hosted Postgres. Local forks still use built-in `node:sqlite` without a database service. Native `fetch`, SVG, and Node crypto/fs cover the remaining work. No Redis, Docker, ORM, managed identity provider, Treg SDK, scheduler package, or agent framework is required. The dynamic `vercel.ts` config adds no configuration SDK dependency. See [dependencies](DEPENDENCIES.md).

Fonts are checked in, approximately 119 KB total, and loaded with `next/font/local`. They include licenses and provenance and require no Google Fonts download at build or runtime. Do not reintroduce a network font dependency as a setup shortcut.

## Boundaries to preserve

- Paid routes require the caller's validated key or encrypted session. Keep provider URLs and endpoint IDs allowlisted. Never turn operator environment credentials into a public fallback.
- Quotes use current catalog prices and paid work refreshes them. Preserve per-call ceilings, partial results, provider errors, and the distinction between unknown and zero cost. Do not automatically retry ambiguous paid work.
- Session keys belong in the encrypted HttpOnly cookie; optional overrides remain in memory. Monitoring retains a separate AES-GCM-encrypted key only after explicit consent. Keep plaintext keys out of source, logs, browser storage, screenshots, and exports.
- Project history is server-side SQLite by default or optional hosted Postgres, separated by verified key and stable secret. Preserve shared asynchronous domain logic, revision compare-and-swap, atomic run append, bounded import, owner-bound chunk transport, browser recovery, and demo isolation. Never overwrite a newer snapshot or migrate another key's history silently. Force SQLite and temporary data in automated fixtures; never inherit a production DATABASE_URL.
- Manual audit/discovery dialogs retain progress across close/reopen in the mounted tab. Scheduled jobs have durable leases and budget reservations. Never automatically retry ambiguous paid work; preserve reservations on interruption and require deliberate review before re-enabling. Keep accessible focus and safe Markdown.

Use [architecture](ARCHITECTURE.md), [API contracts](API.md), [contributing](../CONTRIBUTING.md), and [security](../SECURITY.md) for details. The [verification report](TEST-REPORT.md) distinguishes fixture coverage from dated live checks. State what you verified rather than treating either as a deployment guarantee.
