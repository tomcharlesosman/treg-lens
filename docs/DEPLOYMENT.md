# Deploy Treg Lens

Run Treg Lens as a **Node.js server on one persistent host behind HTTPS**, with a separate monitor worker when users enable automated audits. Use Node.js 24 LTS; 22.13 is the minimum. SQLite is built into Node, so no database service, ORM, Redis, Docker, identity provider, or Treg SDK is required.

Private workspaces, revisions, schedules, and spending records live in SQLite. Use persistent local disk, protect the data directory, and keep `SESSION_SECRET` stable. An ephemeral filesystem, a static export, or unrelated replicas with separate databases cannot provide this deployment's durability. See [architecture](ARCHITECTURE.md) and [API contracts](API.md) before adapting it.

## Build and start

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
| `MONITOR_BASE_URL` | App origin used by the separate worker; defaults to `http://127.0.0.1:3000`; remote origins require HTTPS |
| `NODE_ENV` | Use `production` for the production app and worker |

Use absolute paths for production data. Make the data directory writable only by the application service account. The app creates a 0700 directory and 0600 files where supported; configure equivalent Windows ACLs. The database filename is `treg-lens.sqlite`, with SQLite `-wal` and `-shm` files alongside it. Do not put this directory in a public/static folder or a source-control backup.

Start the server behind the HTTPS proxy:

```bash
npm run doctor -- --production
npm start -- --hostname 127.0.0.1 --port 3000
```

Keep the app supervised by your host's service manager. The loopback bind assumes the proxy is on the same host. Build with development dependencies installed; if the build environment sets `NODE_ENV=production`, use `npm ci --include=dev`. No Treg key is needed to install, check, or build. Fonts are checked in and loaded locally.

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

The web process does not start a scheduler. Run a supervised second process from the checkout while the app server is available:

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

The internal tick endpoint accepts a purpose-derived runner bearer token, not user session authentication. Let the worker generate it; do not publish it, place it in browser code, or treat knowledge of an ordinary Treg key as runner authorization. Remote workers require an HTTPS origin and do not follow redirects.

## HTTPS and proxy behavior

Configure the public hostname and certificate at a trusted reverse proxy. Preserve public `Host`, including any non-default port, because browser `Origin` validation compares it with that host. Overwrite incoming forwarded headers; trusting a client-supplied first `X-Forwarded-For` permits evading manual route guards.

Inside an already configured HTTPS nginx server block:

```nginx
location / {
    client_max_body_size 8m;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 330s;
    proxy_send_timeout 330s;
}
```

This assumes nginx is the public edge. Configure any additional trusted proxy chain explicitly. Preserve cookies and private/no-store responses; do not share-cache authenticated pages, workspace APIs, monitoring state, or paid results. Permit workspace JSON requests up to 8 MiB; research routes retain their smaller 16 KiB limit.

The host must support audit/discovery requests up to 300 seconds and source research up to 120 seconds. Raising a proxy timeout does not override the hosting platform's limit. Do not blindly repeat a paid request after timeout.

## Health and operations

`GET /api/health` makes no Treg call and exposes no workspace information. It returns `200 {"status":"ok","storage":"ready"}` when the SQLite connection responds, or 503 with unavailable status when it cannot. This is a local application/storage probe, not proof of provider availability, funding, free disk space, HTTPS configuration, or an active monitor worker.

`GET /api/aeo/status` describes the caller's verified session. Anonymous `{"configured":false}` is expected; it is not a deployment readiness signal. Verify HTTPS login, logout, durable save/reload, and worker heartbeat separately. A valid zero-balance key can verify sign-in without paid research.

Monitor disk capacity, filesystem permissions, database backups, app/worker availability, and Treg billing. Durable monitor leases and reservations do not replace a shared limiter for manual routes. Do not offer a multi-host service with independent SQLite files and claim a shared budget or workspace.

## Backups, restore, and upgrades

Workspace JSON import/export is a user-level backup of research and project content. It does not restore sessions, retained schedule credentials, monitoring consent, or the server's spending ledger. Export before replacing a workspace or resolving a save conflict. CSV is a filtered answer report, not a complete restore format.

For a transactionally consistent online server backup, use a **new file** outside the checkout in protected storage:

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

This offline operator action disables all restored schedules and clears their retained credentials. Keep app and worker stopped while doing it. Then reconcile Treg activity since the backup, restart the app, and let each owner deliberately reconnect and enable a reviewed schedule. Start the worker only after that review. Do not start a worker against a stale backup and assume idempotency will cover newly generated job IDs.

Keep the previous application revision, lockfile, compatible build, data backup, and configuration before upgrades. Validate the new release, switch the supervised app, and verify login, server save/reload, import/export, and worker status before enabling monitoring. Reverting application code does not revert database changes or restore external billing state. Keep the public origin and secret stable unless performing a deliberate migration.

The supported arrangement is a single persistent host. Docker, managed multi-region databases, team collaboration, notifications, and automated publishing are not provided by this deployment recipe. Fork operators should update repository/support destinations and enable their own private security reporting. See [SECURITY.md](../SECURITY.md), [getting started](GETTING-STARTED.md), and [the agent quickstart](AGENT-QUICKSTART.md).
