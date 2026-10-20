# Get started with Treg Lens

Install the app, connect your own Treg team key, and run a live audit in a durable private workspace. You can complete setup and automated verification without a Treg account; those steps do not spend provider credits. The labeled demo is an optional preview.

## Prerequisites

Use **Node.js 24 LTS**; the minimum is **22.13**. Install Git and npm, then reopen your terminal after installing Node. The app uses Node's built-in SQLite, so it needs no separate database server, Redis, ORM, Docker, or Treg SDK. Its fonts are vendored, so a build does not fetch Google Fonts.

These commands work in macOS/Linux shells and Windows PowerShell. OpenSSL is needed only for the full HTTPS end-to-end test suite, not app setup or normal use.

## Fork and install

1. [Fork the repository](https://github.com/tomcharlesosman/treg-lens/fork) into your GitHub account.
2. Clone your fork, replacing `YOUR-USERNAME` below:

```bash
git clone https://github.com/YOUR-USERNAME/treg-lens.git
cd treg-lens
npm ci
npm run setup
npm run doctor
npm run dev
```

`npm ci` installs the locked dependency versions. `setup` uses Node's built-in cryptographic generator to configure a random `SESSION_SECRET` in private `.env.local` without printing it. Re-running setup preserves a valid existing secret. It refuses a nonempty invalid secret rather than silently rotating it. Keep `.env.local` out of Git and preserve its secret between restarts.

If setup reports an invalid existing value, decide whether to keep or deliberately replace that configuration. A change to the effective secret invalidates sessions, changes which server workspace namespace opens, and prevents old monitoring credentials from being decrypted. Do not remove an existing secret just to make setup pass.

If setup reports duplicate empty assignments, keep one deliberate `SESSION_SECRET` assignment and rerun it. If your shell has `NODE_ENV=test`, unset it for normal local setup: Next.js ignores `.env.local` in test mode. The automated suite supplies its own synthetic configuration.

`doctor` checks Node, locked direct dependencies, and secret configuration without calling Treg. Fix any `FIX` result before continuing. It does not prove that an upstream provider or a production deployment is ready.

## Open the app

Open [localhost:3000](http://localhost:3000). The routes are:

| Route | Purpose |
| --- | --- |
| `/` | Marketing page, demo, sign-in, and GitHub links |
| `/demo` | Clearly labeled sample workspace; no key needed |
| `/login` | Paste your own Treg team API key |
| `/app` | Private workspace after key validation |

Open `/login`, paste a team-scoped Treg API key from [Treg](https://treg.to/app), and continue to `/app`. Key validation is free. Your live project and research history are saved on the application server.

The optional `/demo` shows illustrative answers and citations. Its edits do not become private saved audits, and paid actions lead to sign-in.

If port 3000 is occupied, use a different port:

```bash
npm run dev -- --port 3001
```

Alternatively, in PowerShell:

```powershell
$env:PORT = "3001"
npm run dev
```

Then open `http://localhost:3001`. Remove that PowerShell environment override later with `Remove-Item Env:PORT` if needed.

## Connect a key and run a first audit

1. Get a **team-scoped API key** from [Treg](https://treg.to/app) and paste it at `/login`. You do not need an operator `TREG_TOKEN` or a separate Lens account. Key validation is free; a valid zero-balance key can sign in.
2. New workspaces open guided brand setup. Enter your public **Website URL**, then get a free research estimate. Review the maximum cost before choosing **Research my brand**. Lens makes one Treg research call to suggest your brand name, business description, competitors, and buyer questions, with source links. You can instead choose **Set up manually** without spending credits.
3. Confirm or edit your brand profile and competitors, then select and edit up to eight buyer questions. These initial questions are AI-generated suggestions, not measured search demand or People Also Ask results. **Save and review first audit** saves your choices before opening the audit dialog; **Save and open workspace** saves without opening an audit. Returning users go straight to their saved workspace. Later, **Discover prompts** uses 2–3 seed phrases to find keyword ideas and actual People Also Ask questions, with its own estimate.
4. Open **Run audit**, choose prompts and engines, and review the current estimate. Start with one prompt and one engine to inspect the workflow. Up to 8 prompts and 4 engines are supported.
5. Inspect the answer and its cited URLs. A cited-page research request has its own estimate and paid action for Moz metrics and Exa extraction.
6. Review opportunities, copy an explicitly labeled writing-brief template, and export a report. Publishing and outreach remain actions you perform yourself.
7. Return from another browser with the same key to the same instance and verify your saved project. Use JSON import/export for reviewed backups. Enable budgeted monitoring only when you want future paid audits.

Live discovery, audits, and source research use your Treg team's billing. Estimates are quotes, not final charges or balance reservations. Missing billing headers mean unknown cost. A partial failure preserves successful evidence; an ambiguous timeout can still have upstream activity. Check Treg activity before deliberately retrying.

Brand research also uses your own key and billing. Its execution refreshes the quote and refuses a price above the maximum you accepted. Suggestions are editable and can be incomplete or wrong; review them against the linked sources. Brand research does not run an audit or enable monitoring. Your URL's query string and fragment are removed before research; use a public website, without login credentials.

Setup drafts and the research receipt stay in this browser, scoped to the signed-in workspace, so a reload can resume review. No API key is stored with them. A reload during research warns that the request may have been charged and does not automatically repeat it. Check Treg activity before another research request, or continue manually. A save failure retains the draft; resolve connection or version conflicts before continuing. Confirmed brand details and questions are saved on the server, and appear on another browser using the same key. The raw setup draft and research receipt are local recovery data, not a server backup.

Perplexity uses the Sonar model API; the other engines use web-interface answers. Audits use United States / English parameters. Repeat the same inputs when comparing runs, and treat scores as prioritization heuristics rather than promises of visibility.

## Save, back up, and restore

Settings, prompts, audits, completed moves, and source research are saved in the selected server database: built-in SQLite locally or optional hosted Postgres. The same verified key and deployment secret identify the same workspace across browsers. Another key opens a separate workspace. Possession of a shared Treg key grants access to that key's workspace; Lens does not provide team invitations or roles.

The local default database is `data/treg-lens.sqlite`; hosted Vercel uses DATABASE_URL for Neon storage. `TREG_DATA_DIR` selects another private persistent local directory. Keep the application secret and data directory stable between restarts. An ephemeral host or a new checkout with an empty data directory cannot recover the old server's history.

The browser can retain recovery data for unsaved changes or older browser-only installations. A server revision protects concurrent saves. If another tab or scheduled audit changes the workspace, refresh and review the conflict before saving; export unsaved work first. Do not overwrite a newer server snapshot by guessing its revision. If the server already holds exactly the browser's unsaved copy, for example because a tab closed while its save was finishing, Lens shows **Saved to server** instead of a conflict.

Use **Backup and restore → Download full workspace backup** for a complete, importable JSON copy across all brands, dates, and engines. The regular Export menu produces filtered JSON reports or CSV answer rows; those reports and demo exports are not restore files. Import a full backup within the 8 MiB workspace-data limit, review its project and counts, then explicitly confirm replacement. Import does not restore login sessions or enable paid monitoring. Keep a backup before replacing data. Server backups are the instance operator's responsibility; follow [deployment recovery](DEPLOYMENT.md#backups-restore-and-upgrades) for WAL-safe SQLite copies.

If a completed monitoring audit cannot be saved, download its recovery file from **Monitoring**. Download a full workspace backup before pruning history, open an older audit and choose **Delete this audit**, then wait for **Saved to server**. Import the recovery file in **Backup and restore** and confirm the merge. Existing audit IDs and settings remain intact; the merge does not rerun paid work, resume monitoring, or reset its budget ledger.

Authentication keys stay out of browser storage and reports. The session cookie is encrypted and HttpOnly. An optional per-request override stays in memory until reload. Enabling a monitor separately authorizes an encrypted server-retained credential.

For a hosted instance, use the [guided Vercel + Neon deployment](DEPLOYMENT.md#guided-vercel-and-neon-deployment). It creates your repository, connects storage, collects the private application secret, and deploys with schema preparation in the build. Visitors still enter their own Treg keys. Manual research works on Hobby; minutely hosted monitoring requires Pro configuration.

## Enable daily or weekly monitoring

On a local/persistent host, run the app server and start the worker in a second terminal:

```bash
npm run monitor
```

If using a different app port or origin, configure `MONITOR_BASE_URL` in that worker's environment. The default is `http://127.0.0.1:3000`; remote origins require HTTPS. The worker and server must use the same stable secret and configuration mode. See [worker deployment](DEPLOYMENT.md#monitoring-worker) for a supervised process or one-shot cron invocation.

On Vercel Pro, the operator instead enables TREG_VERCEL_MONITORING=1 with a separate private CRON_SECRET and redeploys. Hosted forks install no cron by default.

In the private workspace, review the prompts/engines, choose daily or weekly monitoring and a UTC hour, set per-audit and monthly limits, and explicitly enable it. Confirm the worker heartbeat. Enabling a schedule in the UI does not launch a worker process.

An enabled schedule retains your signed-in key encrypted on the server and can make paid calls after browser close or logout. Its monthly limit covers monitoring audits only, not manual research or other Treg activity. Current prices are checked and a budget ceiling reserved before each run. Unknown billing, interrupted work, partial errors, or exhausted budgets pause for review; check Treg activity before re-enabling.

Pause monitoring when you want future runs to stop. This removes the retained credential. A provider request already submitted may still finish and save its evidence. Signing out alone does not pause a schedule.

## Environment and verification

An exported shell `SESSION_SECRET` overrides dotenv files. In development, `.env.development.local` also takes precedence over `.env.local`; production has its own `.env.production.local` override. An empty higher-priority assignment can shadow a valid lower-priority value. `doctor` reports the source without printing the value. Keep secrets out of `NEXT_PUBLIC_` variables. See [deployment configuration](DEPLOYMENT.md#configuration-and-secrets) for the full order.

For a contribution, start with:

```bash
npm run check
```

This runs lint, type checking, library tests, and documentation checks. For browser or HTTP changes, follow [the testing guide](TESTING.md) to install browser engines and run `npm run test:e2e`. The full suite uses an isolated production HTTPS server and synthetic Treg responses.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [the agent quickstart](AGENT-QUICKSTART.md) before extending a fork. [Architecture](ARCHITECTURE.md), [API contracts](API.md), [dependency notes](DEPENDENCIES.md), and [deployment](DEPLOYMENT.md) cover the deeper boundaries. Use [support troubleshooting](../SUPPORT.md) when setup or provider requests fail.
