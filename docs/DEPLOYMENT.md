# Deploy Treg Lens

The supported deployment path is a **Node.js production server behind an HTTPS reverse proxy**. Use Node.js 24 LTS, with 22.13 as the minimum. The app requires server-side route handlers, encrypted sessions, and DNS checks; a static export cannot provide these features.

No database, Redis, ORM, Docker, or external identity service is required for this path. Workspace history lives in users' browsers. Fonts are checked in and loaded locally, so builds do not contact Google Fonts. See [architecture](ARCHITECTURE.md) and [dependencies](DEPENDENCIES.md) for the component choices and their limits.

Installation needs access to the public npm registry; installing E2E browsers also needs Playwright's download hosts. Normal server operation needs outbound HTTPS to `treg.to` and working DNS for public source-URL checks. Once dependencies are installed, the production build uses checked-in fonts and does not need Treg credentials or an external font connection.

## Build and start

From the repository root:

```bash
npm ci
npm run check
npm run build
```

Configure a stable private `SESSION_SECRET` in the **runtime server environment**, then start the production process behind your HTTPS proxy:

```bash
npm run doctor -- --production
npm start -- --hostname 127.0.0.1 --port 3000
```

Keep the process supervised using your host's service manager. The loopback bind assumes the reverse proxy runs on the same machine; adapt the private listener to your network without exposing it directly to the public internet. Build with development dependencies installed because lint, TypeScript, and compilation need them. If the build environment already sets `NODE_ENV=production`, use `npm ci --include=dev` so npm does not omit those tools. No Treg key is needed for checks or a build.

`npm start` selects production mode and production cookies are `Secure`. Opening the raw `http://` production listener is not a supported sign-in setup: browsers can refuse its session cookie. Use the public HTTPS URL. For local exploration without a TLS proxy, use `npm run dev` instead.

## Configuration and secrets

Generate a production secret privately with Node, on any supported platform:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store that value as `SESSION_SECRET` in your host's protected server environment. The value must contain at least 32 characters and remain stable across restarts and replicas. Do not commit it, send it to analytics/logs, or prefix it with `NEXT_PUBLIC_`. The generator prints the value for you to store; `npm run setup` is the local alternative that writes `.env.local` without printing it.

Users paste their own team-scoped Treg key at `/login`. Normal browser/API operation requires no operator `TREG_TOKEN` or `TREG_ORG`; paid routes cannot inherit them. The application server receives submitted keys over HTTPS, so operate that server as trusted infrastructure and keep bodies/cookies out of request logs.

Next.js resolves an existing value in this order:

1. Process/server environment.
2. `.env.production.local` in production, or `.env.development.local` in development.
3. `.env.local` outside test mode.
4. `.env.production` or `.env.development` for that mode.
5. `.env`.

A higher-priority empty or old assignment can shadow the expected file. Local setup preserves valid existing secrets and refuses nonempty invalid ones. `npm run doctor -- --production` checks production precedence and hides the value. Next expands `$VARIABLE` references inside dotenv files; setup-generated base64url values avoid that interpolation. Restart the process after changing runtime configuration.

On Windows PowerShell, an optional port override is `$env:PORT = "3001"` followed by `npm start`; the explicit `--port` argument above is cross-platform. Remove a temporary override with `Remove-Item Env:PORT` afterward.

## HTTPS and proxy behavior

Configure the public hostname and a valid TLS certificate at your reverse proxy or ingress. Preserve the public `Host`, including a non-default port when used. Lens compares a browser's `Origin` against that host; an internal listener hostname can cause legitimate requests to fail with 403.

Your trusted proxy must overwrite client-supplied forwarded headers. Set `X-Forwarded-Proto` to the actual public scheme and provide the real client address as the first `X-Forwarded-For` entry. The application's current rate guards use that first address; trusting arbitrary incoming values permits evasion, while forwarding one proxy address for everyone can throttle unrelated users together.

For example, inside an **already configured HTTPS nginx server block** that accepts only your intended public hostname:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 330s;
    proxy_send_timeout 330s;
}
```

This example assumes nginx is the public edge. If another trusted proxy sits in front, configure that trust chain and client-IP handling explicitly. Adapt certificate, hostname, body-size, and access-log settings to the deployment. Preserve `Set-Cookie` and private/no-store responses; do not cache authenticated pages, session endpoints, or paid API responses at a shared edge.

The host and proxy must support requests lasting up to **300 seconds** for audits and discovery; source research declares 120 seconds. A proxy timeout increase cannot override a hosting platform's hard limit. When a connection times out, check Treg activity before starting another paid request. See [API limits and retries](API.md) for ceilings and ambiguous outcomes.

## Multiple instances and operations

Use the same stable session secret and application revision across replicas. Current rate and concurrency guards are process-local, expire on restart, and are best-effort duplicate-spend protection. Before offering a public multi-instance service, add a shared atomic limiter and operational monitoring. The app does not provide durable jobs, global tenant quotas, a shared audit ledger, or resumable upstream work.

An anonymous `GET /api/aeo/status` normally returns `200` with `{"configured":false}`. It describes the current caller's session; it is **not a readiness proof** for the server secret, key validation, upstream providers, balance, or authenticated access. Use it only as a basic route/liveness check. `doctor` checks local configuration; verify sign-in separately through the public HTTPS origin. A valid zero-balance key can exercise sign-in without a paid call.

Normal app operation does not need OpenSSL on `PATH`. The full [end-to-end suite](TESTING.md) needs it to generate a temporary test HTTPS certificate. Tests use synthetic credentials and a fail-closed Treg fixture, not your production account.

## Data, upgrades, and rollback

Workspace settings, prompts, audit results, completed moves, and source research are ordinary browser `localStorage`, scoped by origin, key, and deployment secret. They are not encrypted backups or a shared database. Prompts, seeds/queries, and source URLs submitted for live research go to Treg and its upstream providers. Protect exported reports and browser profiles accordingly.

Before an upgrade, save the deployed revision and lockfile, retain the stable secret securely, and ask users to export the relevant date range as JSON. CSV is an answer-row report; JSON preserves richer research but has no supported import/restore workflow. Check schema changes and their migration behavior before deploying. A server filesystem backup does not include users' browser histories.

Build a new revision in a separate release directory, run `npm run check` and the appropriate [E2E checks](TESTING.md), then switch the supervised process to the new build. Keep the previous complete release available for rollback. Recheck the public page, HTTPS login, logout, and export; use a deliberate budget if validating paid work.

Rollback means restoring the previous application revision, lockfile/dependencies, and build with its compatible runtime configuration. Reverting code does not automatically revert browser schema changes or recover deleted local data. Keep the public origin stable if existing browser history should remain accessible.

Rotating `SESSION_SECRET` invalidates sessions and changes workspace namespaces. Old records remain in browser storage but are not automatically remapped into the new namespace. Export before a planned rotation when safe; revoke exposed Treg keys upstream if the key itself is compromised. Follow [SECURITY.md](../SECURITY.md) for incidents and private reporting.

Fork operators should update the repository links in `src/lib/site.ts`, package metadata, and community documents, and enable their own private vulnerability reporting. Use [getting started](GETTING-STARTED.md), [the agent quickstart](AGENT-QUICKSTART.md), and [the API reference](API.md) when extending the deployment.
