# Deploy Treg Lens

Choose **Vercel + Neon** for a hosted instance or a **Node.js server on persistent local disk** for the simplest self-hosted installation. Local forks default to built-in SQLite and need no external database service. Hosted mode adds one Postgres driver, with the same workspace, credential, and monitoring rules. Use Node.js 24 LTS; 22.13 is the minimum.

Private workspaces, revisions, schedules, and spending records live in the selected database. Keep `SESSION_SECRET` stable. An ephemeral SQLite file, a static export, or unrelated replicas with separate databases cannot provide durability. Vercel fails closed without Postgres configuration. See [architecture](ARCHITECTURE.md) and [API contracts](API.md).

## Guided Vercel and Neon deployment

Use the **Deploy with Vercel** button in [README](../README.md). Its guided flow has four stages; account sign-in, organization permissions, and provider terms can add screens:

1. Create your own Git repository and Vercel project from the template.
2. Connect the Neon storage product when prompted. Keep its injected `DATABASE_URL` private and scoped to production. No AWS account or separate database-management stack is needed.
3. Enter a private random `SESSION_SECRET` of at least 32 characters. This is an application secret, not a Treg key. Preserve it across deployments.
4. Deploy. The checked-in [Vercel configuration](../vercel.ts) runs `npm run db:migrate && npm run build`; the repeatable migration creates the hosted schema before building. No manual SQL setup is required.

Open the production domain, check `/api/health`, and use `/login` with your own Treg team key. Visitors use their own keys and Treg billing; an operator Treg credential is unnecessary. Verify the public domain from a browser with no Vercel login. Standard Protection can protect previews while leaving production domains public; All Deployments protection would block visitors behind Vercel authentication. See [Vercel protection scopes](https://vercel.com/docs/deployment-protection).

Manual audits, discovery, source research, durable saves, and backups can run on Vercel Hobby. The default config registers no cron. For hosted monitoring, use Pro or Enterprise, set `TREG_VERCEL_MONITORING=1` and a separate private random `CRON_SECRET` of at least 32 characters in production, then redeploy. This installs one minutely dispatcher at `GET /api/cron/monitor`; each user must still explicitly enable their schedule and budgets. Vercel sends `CRON_SECRET` as a bearer credential. Do not reuse a visitor's Treg key or publish this secret. See [cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The hosted cron gets a 360-second function limit, below the ten-minute durable lease. Without the Pro override, Vercel's default 300 seconds remains Hobby-compatible. The dispatcher claims at most one due audit per invocation; co-due users are serialized and exact-hour execution is not guaranteed. With fast audits, the ceiling is 60 audits/hour; slow audits reduce throughput. Missed/duplicate deliveries are handled by persisted due times and the shared lease. Uncertain paid work pauses rather than retrying.

Monitor the Neon plan's compute, storage and transfer quotas as well as Vercel usage. The minutely dispatcher queries/writes the database even when no audit is due, keeping compute active rather than allowing idle scale-to-zero. A free database plan has finite allowances; a continuously running dispatcher or growing usage may require a higher quota. Provider hosting charges are separate from each visitor's Treg research budget. Check [current Neon plans](https://neon.com/pricing) and [scale-to-zero behavior](https://neon.com/docs/introduction/scale-to-zero) before choosing operating limits.

Keep preview database branches, secrets, and cron configuration separate from production. Do not pull hosted credentials over an existing local `.env.local` or point automated fixture tests at the production database. This repository does not provision previews automatically. An independent authenticated worker remains an alternative where your hosting plan permits it.

## Storage selection

| Effective configuration | Storage |
| --- | --- |
| No selector or database URL | Built-in SQLite, except on Vercel |
| `TREG_STORAGE=sqlite` | Explicit local/test SQLite; forbidden on Vercel |
| `DATABASE_URL` or `TREG_STORAGE=postgres` | Hosted Postgres; a valid private database URL is required |
| Vercel without durable database configuration | Fails closed; never writes an ephemeral SQLite fallback |

Use the Neon application connection for runtime traffic. `DATABASE_URL_UNPOOLED`, when configured, is preferred by the migration command; use a direct connection for `pg_dump`/`pg_restore`. Never put connection strings in public variables, command arguments that expose secrets, or logs. The app uses request-scoped transactions and no ORM. [Neon's connection guidance](https://neon.com/docs/connect/connection-pooling) explains pooled versus direct URLs.

`npm run db:migrate` explicitly prepares the selected database. On Vercel it runs as the configured deployment build command. Plain `npm run build` and importing application modules never migrate a remote schema. For a custom hosted pipeline, run the migration before serving the app. SQLite initializes locally on first use; ordinary local setup remains unchanged.

## Build and start a persistent Node.js host

From the checkout:

```bash
npm ci
npm run check
npm run build
```

Configure these values in the host's protected runtime environment:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Stable private random value, at least 32 characters; seals sessions, namespaces workspaces, and protects monitor credentials |
| `TREG_DATA_DIR` | Private persistent local directory; defaults to `data` below the process working directory |
| `TREG_STORAGE` | Optional `sqlite` or `postgres`; local forks normally leave it unset |
| `DATABASE_URL` | Optional hosted Postgres connection; selects remote storage when no explicit selector is set |
| `DATABASE_URL_UNPOOLED` | Optional direct connection used by migrations instead of the runtime URL |
| `TREG_VERCEL_MONITORING` | Set to `1` on Vercel Pro/Enterprise to install minutely cron on redeploy |
| `CRON_SECRET` | Independent private bearer credential for the hosted GET dispatcher |
| `MONITOR_BASE_URL` | App origin used by the separate worker; defaults to `http://127.0.0.1:3000`; remote origins require HTTPS |
| `SITE_URL` | Optional public HTTPS origin for absolute link-preview image URLs; set it before `npm run build`. Vercel needs nothing: Next uses the production domain, and branch URLs for previews |
| `NODE_ENV` | Use `production` for the production app and worker |

Use absolute paths for production data. Make the data directory writable only by the application service account. The app creates a 0700 directory and 0600 files where supported; configure equivalent Windows ACLs. The database filename is `treg-lens.sqlite`, with SQLite `-wal` and `-shm` files alongside it. Do not put this directory in a public/static folder or a source-control backup.

Start the server behind the HTTPS proxy:

```bash
npm run doctor -- --production
npm start -- --hostname 127.0.0.1 --port 3000
```

Keep the app supervised by your host's service manager. The loopback bind assumes the proxy is on the same host. Build with development dependencies installed; if the build environment sets `NODE_ENV=production`, use `npm ci --include=dev`. No Treg key is needed to install, check, or build. Fonts are checked in and loaded locally. Open Graph/X cards for `/`, `/login`, and `/demo` are rendered during the build from checked-in assets; without `SITE_URL`, a non-Vercel build points their URLs at `localhost`.

Production cookies are Secure. Opening the raw HTTP production listener is not a supported sign-in setup: browsers may refuse its cookie. Use the public HTTPS origin. Local development uses `npm run dev`.

## Configuration and secrets

For local use, `npm run setup` creates private `.env.local` without printing its generated secret. For production, create a secret privately and put it in the host's protected environment. This cross-platform generator prints a value for you to store:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Never commit it, send it to logs or analytics, or prefix it with `NEXT_PUBLIC_`. Keep app and worker secrets identical. Normal paid routes need no operator `TREG_TOKEN` or `TREG_ORG`; users supply their own team key. The server receives those keys over HTTPS, so keep bodies, cookies, authorization headers, and database content out of access logs.

Next resolves configuration in this order: process environment, the mode's `.env.*.local`, `.env.local` outside test mode, the mode's `.env.*`, then `.env`. An empty higher-priority assignment can shadow a valid one. `doctor -- --production` checks the effective production secret and hides its value. Next expands dotenv variable references; setup-generated base64url avoids interpolation. Restart affected processes after configuration changes.

The worker defaults to production configuration. If testing monitoring against a development server that relies on `.env.development.local`, explicitly run its process in development mode with the same secret and origin. The worker reads `MONITOR_BASE_URL` and `TREG_DATA_DIR` from the effective environment/configuration files too. Use literal values: worker/backup scripts do not perform Next's dotenv `$VARIABLE` interpolation. Server environment values take precedence.

Rotating `SESSION_SECRET` invalidates sessions, changes workspace namespaces, and makes old encrypted monitoring credentials unreadable. It is not a routine setup repair or an automatic data migration. Back up data and preserve the original secret separately before a planned migration; revoke exposed Treg keys upstream when appropriate.

## Monitoring worker

On a persistent host, the web process does not start a scheduler. Run a supervised second process from the checkout while the app server is available:

```bash
npm run monitor
```

The worker sends an authenticated tick approximately once per minute. A host scheduler can instead invoke one tick each minute:

```bash
npm run monitor -- --once
```

Run one persistent loop **or** a scheduled once-only invocation. The durable global lease also prevents overlapping workers from claiming the same work. A tick handles at most one due schedule. A large backlog can therefore take multiple ticks; an enabled schedule is not a guarantee of execution at an exact second. The app displays the worker's last heartbeat and health.

Users explicitly choose daily or weekly monitoring, UTC timing, prompts/engines, a per-audit ceiling between $0.001 and $1, and a monthly ceiling up to $1,000. Monthly limits cover scheduled audits only. Manual research and other Treg use are outside that ledger. The worker revalidates the retained key, quotes current prices, and atomically reserves the ceiling before provider calls.

Enabling monitoring retains the signed-in key encrypted with AES-256-GCM and workspace-bound associated data. It continues after browser close or logout. Pause/delete removes that retained credential and prevents future calls. An in-flight provider request may finish and its evidence is still saved.

Unknown charges retain the full reservation. Partial failures, ambiguous outcomes, budget exhaustion, and interrupted paid jobs pause for review; there is no automatic resubmission of uncertain paid work. Check Treg activity before explicitly re-enabling. The original month retains its accounting records after a calendar rollover. Monitor configuration, jobs, reservations, and credentials depend on the database and stable secret, so back them up as sensitive server state.

The local POST tick accepts a purpose-derived runner bearer token; the hosted GET cron accepts the independent `CRON_SECRET`. Neither accepts a user session or Treg key as runner authorization. Let the worker generate its token; do not publish either credential. Remote workers require an HTTPS origin and do not follow redirects. The Vercel hosted path uses native cron instead of a persistent Node worker process.

## HTTPS and proxy behavior

Configure the public hostname and certificate at a trusted reverse proxy. Preserve public `Host`, including any non-default port, because browser `Origin` validation compares it with that host. Overwrite incoming forwarded headers; trusting a client-supplied first `X-Forwarded-For` permits evading manual route guards.

Inside an already configured HTTPS nginx server block:

```nginx
location / {
    client_max_body_size 9m;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 330s;
    proxy_send_timeout 330s;
}
```

This assumes nginx is the public edge. Configure any additional trusted proxy chain explicitly. Preserve cookies and private/no-store responses; do not share-cache authenticated pages, workspace APIs, monitoring state, or paid results. Workspace data is capped at 8 MiB, with a separate 4 KiB request-envelope allowance. The 9 MiB proxy limit accommodates that wrapper; the app still enforces its tighter limits. Research routes retain their smaller 16 KiB limit.

The host must support audit/discovery requests up to 300 seconds and source research up to 120 seconds; the enabled hosted cron needs 360 seconds. Raising a proxy timeout does not override the hosting platform's limit. Workspaces remain bounded at 8 MiB; the browser uses owner-bound chunks of at most 1 MiB for saves above 3 MiB, and large JSON responses stream to stay compatible with Vercel transport limits. Do not blindly repeat a paid request after timeout.

## Health and operations

`GET /api/health` makes no Treg call and exposes no workspace information. It returns `200 {"status":"ok","storage":"ready"}` when the selected database responds, or 503 with unavailable status when it cannot. This is an application/storage probe, not proof of provider availability, funding, free disk space, HTTPS configuration, or an active monitor worker. `doctor` validates configuration without connecting to either database.

`GET /api/aeo/status` describes the caller's verified session. Anonymous `{"configured":false}` is expected; it is not a deployment readiness signal. Verify HTTPS login, logout, durable save/reload, and worker heartbeat separately. A valid zero-balance key can verify sign-in without paid research.

Monitor disk capacity, filesystem permissions, database backups, app/worker availability, and Treg billing. Durable monitor leases and reservations do not replace a shared limiter for manual routes. Do not offer a multi-host service with independent SQLite files and claim a shared budget or workspace.

## Backups, restore, and upgrades

Workspace JSON import/export is a user-level backup of research and project content. It does not restore sessions, retained schedule credentials, monitoring consent, or the server's spending ledger. Export before replacing a workspace or resolving a save conflict. CSV is a filtered answer report, not a complete restore format.

For a transactionally consistent online **SQLite** backup, use a **new file** outside the checkout in protected storage:

```bash
npm run backup -- /private/backups/treg-lens-2026-10-19.sqlite
```

Replace the example path with a private path on your host; Windows can use a quoted absolute Windows filename. The command uses SQLite `VACUUM INTO`, includes committed WAL data, sets mode 0600 where supported, and refuses to overwrite an existing destination. It can run while the app is online. Keep the matching `SESSION_SECRET` separately, with access controls appropriate for decryption credentials.

Alternatively, stop both app and worker before copying the entire private data directory. Copying only the main SQLite file while writes are active can omit committed data. A user full-workspace JSON backup does not contain server schedules or ledger state.

During a server restore, stop the app and worker. Restore the consistent backup as `treg-lens.sqlite` in the private data directory; do not combine it with stale WAL/SHM files from another database state. Preserve a separate copy of the previous data directory before replacement. An old database contains old schedule state and an old spending ledger; restoring it does not undo charges already made in Treg.

Before restarting automated execution, run against the restored data directory:

```bash
npm run monitor -- --pause-all
```

This offline SQLite action disables all restored schedules and clears their retained credentials. Keep app and worker stopped while doing it. Then reconcile Treg activity since the backup, restart the app, and let each owner deliberately reconnect and enable a reviewed schedule. Start the worker only after that review. Do not start a worker against a stale backup and assume idempotency will cover newly generated job IDs.

### Hosted Postgres backup and restore

`npm run backup` and `npm run monitor -- --pause-all` deliberately refuse Postgres mode before opening any SQLite file. They do not back up or pause the hosted database. Use your provider's protected backup/restore workflow or PostgreSQL `pg_dump`/`pg_restore` with a direct connection. These are operator tools, not additional local application prerequisites. Keep database dumps and the matching application secret separately protected. Review your provider's actual retention and quotas; a free plan is not an unlimited backup policy. See [Neon backup guidance](https://neon.com/docs/postgres/backup-restore/backups).

Before restoring an old hosted database, disable cron, stop independent workers, block schedule edits, and allow any in-flight invocation to finish or reach its timeout. Preserve current evidence and reconcile upstream charges. After restoring, while automated execution and user edits remain disabled, run this transaction in the provider's private SQL editor against the intended restored database:

```sql
BEGIN;
UPDATE monitor_schedules
SET enabled = 0, credential = NULL, next_run_at = NULL,
    last_status = 'paused',
    last_error = 'Paused by the server operator after restore; review billing before resuming.';
COMMIT;
```

This preserves job charges/reservations. Verify schedules are disabled without selecting credentials, reconcile Treg activity since the restore point, and reopen the app for owners to review and deliberately re-enable schedules. Re-enable cron only after review. Restoring a database cannot roll back paid calls. The SQL is an explicit recovery action, not a first-deploy step.

Keep the previous application revision, lockfile, compatible build, data backup, and configuration before upgrades. Validate the new release, switch the supervised app, and verify login, server save/reload, import/export, and worker status before enabling monitoring. Reverting application code does not revert database changes or restore external billing state. Keep the public origin and secret stable unless performing a deliberate migration.

SQLite supports one persistent host; hosted deployments share the configured Postgres database. Manual route guards still live in process memory, so hosted scaling does not create a shared limiter. Docker, team collaboration, notifications, and automated publishing are not provided by this recipe. Fork operators should update repository/support destinations and enable their own private security reporting. See [SECURITY.md](../SECURITY.md), [getting started](GETTING-STARTED.md), and [the agent quickstart](AGENT-QUICKSTART.md).
