# Working in Treg Lens

This is an existing Next.js 16 App Router application. Keep its eight runtime dependencies purposeful; the single Neon driver supports optional hosted storage. Read [README.md](README.md) and [docs/AGENT-QUICKSTART.md](docs/AGENT-QUICKSTART.md) before setup; [architecture](docs/ARCHITECTURE.md) and [API contracts](docs/API.md) explain implementation boundaries.

## Setup and checks

- Recommend Node.js 24 LTS; the minimum is 22.13. Use npm and `npm ci` with the lockfile.
- `npm run setup` generates private configuration using Node built-ins and preserves nonempty existing secrets. Never print credentials or replace a `SESSION_SECRET` just to pass a check.
- `npm run doctor` checks prerequisites without upstream calls. `npm run dev` starts the app; `/` and `/demo` need no Treg key.
- `npm run check` runs lint, fresh route type generation, TypeScript, library/setup tests and local documentation-link checks.
- `npm run test:e2e` builds and tests production routes/browser flows with upstream fixtures. Install Playwright browsers first; `npm run doctor -- --e2e` checks OpenSSL, browser binaries and ports 3100/3101. Never reuse the development server for this suite.
- `npm run test:e2e:ui` builds first. Reports and traces remain ignored under `output/playwright/`.
- Local forks use built-in SQLite in `TREG_DATA_DIR` (default `data`). DATABASE_URL selects optional Postgres; Vercel requires durable remote storage. Preserve real databases and the stable secret. Force TREG_STORAGE=sqlite and a temporary data directory in tests. `npm run monitor` starts the separate worker; starting it does not authorize a paid schedule.
- `npm run backup -- /private/path/new.sqlite` creates a consistent online database backup. After a SQLite restore, keep server/worker stopped and run `npm run monitor -- --pause-all` before review. Both scripts refuse remote mode; follow the hosted Postgres restore procedure instead.

- `npm run db:migrate` explicitly prepares schemas. The Vercel build command runs it before building; imports and plain Next builds never migrate remote data. Hosted forks omit cron by default for Hobby; TREG_VERCEL_MONITORING=1 plus private CRON_SECRET enables the minutely dispatcher on Pro. User schedules still require explicit consent.

## Preserve these boundaries

- Paid HTTP routes require the caller's validated key/session. Never fall back to an operator credential. Keep Treg endpoint IDs and URLs allowlisted on the server.
- Setup, estimates and automated tests make no paid calls. Use synthetic upstream fixtures for routine verification. Live work follows the user's requested scope and spending constraints; never silently retry paid calls.
- Keep credentials out of source, logs, screenshots, browser storage and exports. Use `.env.example` for names, not private values. Users can enter their key through `/login`.
- Preserve per-key server workspace isolation, revision compare-and-swap, atomic audit append, and bounded full-backup import. Namespaces depend on the verified key and stable secret. Filtered reports and demo exports are not restorable full backups. Never blindly retry a stale snapshot with a newer revision.
- Monitoring requires explicit paid consent and retains a separately AES-GCM-encrypted signed-in key. Preserve the global lease, UTC cadence, live quote reservation, stable job idempotency, and UTC-month ledger. Unknown charges/interrupted jobs retain reservations and pause; never automatically resubmit ambiguous paid work. Logout does not pause monitoring. Pausing removes retained credentials but cannot cancel an in-flight provider request.
- Keep demo data labeled and separate from saved live work. Unknown billing is not zero; partial results and errors stay inspectable.
- Preserve Treg color tokens, keyboard-accessible dialogs, safe Markdown and local licensed fonts. Do not reintroduce build-time font downloads.
- Justify new dependencies and update the lockfile. Do not force audit downgrades; the known upstream development advisory is documented in [dependencies](docs/DEPENDENCIES.md).
- Update relevant user/API/deployment docs when behavior changes. Use affected fixtures and run the full browser suite for authentication, storage, framework or UI-flow changes.

## Source map

`src/app` contains routes/pages; `src/components` contains the UI; `src/lib` contains provider adapters, sessions, analytics and storage validation. `scripts` contains dependency-free onboarding, diagnostics, database backup, and monitor-worker commands. Shared asynchronous persistence is in `storage-database.ts`/`workspace-repository.ts`; `database.ts` provides the local SQLite connection; scheduling and credential envelopes are in `monitoring.ts`. `tests/e2e/support/treg-fixture.cjs` replaces only upstream calls in the isolated test process; it is not an application authentication bypass. See [CONTRIBUTING.md](CONTRIBUTING.md).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
