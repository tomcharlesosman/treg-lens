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
2. New workspaces open guided brand setup. Enter your public **Website URL** and optionally describe your buyers. Measurement coverage is shown as **United States / English**; describing a different audience does not silently change the engines’ market. Then get a free research estimate. Review the maximum cost before choosing **Research my brand**. Lens makes one Treg research call to suggest your brand name, business description, competitors, and buyer questions, with source links. You can instead choose **Set up manually** without spending credits.
3. Confirm or edit your business and buyers, competitor names and websites. A name correction keeps the competitor website; changing the identity clears stale rationale/evidence. Cited competitor sources are shown when they match the returned research; other alternatives remain suggestions to verify. Then select and edit up to eight buyer questions, organized by buyer intent. A small recommended starter set keeps the first check focused; all reviewed candidates remain available in your saved profile. These initial questions are AI-generated suggestions, not measured search demand or People Also Ask results. **Save and review first audit** saves your choices before opening the audit dialog; **Save and open workspace** saves without opening an audit. Returning users go straight to their saved workspace. Later, **Discover prompts** uses 2–3 editable seed phrases from your reviewed buyer questions or business context, with its own estimate. If there is insufficient context, enter relevant category/buyer phrases yourself.
4. Open **Run audit**, choose prompts and engines, and review the current estimate and requested-answer count. Each engine identifies whether it supplies web-interface answers or a model API response. If the fresh catalog estimate rises above the approved amount, no paid audit starts; review a new estimate. Start with one prompt and one engine to inspect the workflow. Up to 8 prompts and 4 engines are supported.
5. The latest audit’s findings link competitor gaps and cited sources to the exact saved answer. Coverage and unknown charges stay visible; missing answers are not treated as evidence that the brand was absent. Inspect the answer and its cited URLs. A cited-page research request has its own estimate and paid action for Moz metrics and Exa extraction.
6. Review opportunities, copy an explicitly labeled writing-brief template, and export a report. Publishing and outreach remain actions you perform yourself.
7. Return from another browser with the same key to the same instance and verify your saved project. Use JSON import/export for reviewed backups. Enable budgeted monitoring only when you want future paid audits.

Live discovery, audits, and source research use your Treg team's billing. Estimates are quotes, not final charges or balance reservations. Missing billing headers mean unknown cost. A partial failure preserves successful evidence; an ambiguous timeout can still have upstream activity. Check Treg activity before deliberately retrying.

Brand research also uses your own key and billing. Its execution refreshes the quote and refuses a price above the maximum you accepted. Suggestions are editable and can be incomplete or wrong; review them against the linked sources. Brand research does not run an audit or enable monitoring. Your URL's query string and fragment are removed before research; use a public website, without login credentials.

Setup drafts stay in this browser, scoped to the signed-in workspace, so a reload can resume the URL, buyer context, competitor websites, intent and question selections. Before paid research starts, Lens checks that its interrupted-request marker can be saved and read back. If browser storage is blocked/full, manual setup remains free and available, but research waits until that recovery safeguard works. No API key is stored with them. A reload during research warns that the request may have been charged and does not automatically repeat it. Check Treg activity before another research request, or continue manually. A save failure retains the draft; resolve connection or version conflicts before continuing. Confirmed brand details and questions are saved on the server, and appear on another browser using the same key. After a successful profile save, up to five original research receipts are retained on the server with their sources, input, call IDs and known/unknown cost. Open **Brand research and sources** to revisit them. A profile edit does not rewrite those original receipts. Full workspace backups include this metadata; the unfinished browser draft is still local recovery data, not a server backup.

Perplexity uses the Sonar model API; the other engines use web-interface answers. Audits use United States / English parameters. Repeat the same inputs when comparing runs, and treat scores as prioritization heuristics rather than promises of visibility.

## Rerun onboarding with your existing key

Open **Settings → Rerun onboarding** in your signed-in workspace. Save or close any pending Settings edits first. Lens pre-fills your saved website, buyer context, competitors and questions; you do not need a new key or another account. Opening the review makes no paid request. Choose **Set up manually** to edit without research, or approve a fresh estimate to research again.

**Back to workspace** leaves your saved profile and work in place and keeps this review draft in the current browser. Reopen it from Settings to resume; reload also keeps your place. Drafts remain isolated to the signed-in key and separate from first-time setup. Clearing browser storage removes unfinished drafts, not server-saved work.

Saving applies the reviewed profile and adds selected questions to your existing tracked questions. Existing audits, answers, completed moves and source research are preserved. Original research receipts retain their sources and costs within the existing five-receipt history limit. Historical audits keep their original brand, so changing the selected brand changes which audits appear in its dashboard. **Save and review audit** opens a separate cost review; it does not start an audit. Existing monitoring keeps its saved brand, questions, cadence, budget and enabled/paused state; update it separately if needed.

If another tab or scheduled audit changes the workspace, Lens refuses to apply the stale review. **Reload saved profile** asks before replacing review edits with the latest saved profile and questions, while retaining new research receipts and interrupted-request warnings. If the workspace itself has unsynced results, first return to save or back them up; reloading the profile cannot discard them. Review again before saving. A failed or ambiguously acknowledged save retains the draft and never repeats research automatically. You can return to the workspace to inspect the saved version.

## Discover questions and reuse the research

Open **Prompt tracking → Discover prompts**, review the editable seeds and current quote, then deliberately start research. Keyword ideas and observed People Also Ask questions retain their seed, provider and origin. Unknown search volume stays unknown; PAA questions do not acquire a keyword-volume estimate. Generated onboarding suggestions remain separately labeled.

Returned research is appended to the server independently of your selection, so choosing no questions does not discard it. **Saved research** reopens the latest 20 receipts, including original candidates, accepted quote, completion time, provider call IDs, partial errors and known/unknown costs. Import up to eight selected candidates at a time; successful import waits for the workspace save acknowledgment and links the question records to the original receipt/candidate IDs. Existing questions are retained. Full workspace backups include the saved receipts and provenance.

Before spending, Lens must save and read back a credential-free browser recovery marker. Blocked/full browser storage prevents a new paid discovery request. Reloading an interrupted request never repeats it automatically: check Treg activity and the server’s saved research first. If returned evidence cannot be saved, keep the dialog open, retry **saving** or download the receipt; paying for another discovery is not a save-recovery step. A pending upstream call remains unsettled, not a completed result or a zero charge.

## Manage questions and compare progress

Under **Prompt tracking → Manage question library**, add intent/topic metadata, review neutral versus branded classification, edit wording, pause, archive or restore questions. Wording edits retain the original record and create a new measurement identity; saved answers remain in history. The library supports up to 512 records, while one paid audit remains limited to eight questions. Pausing/archiving changes manual audit defaults. An enabled monitoring schedule keeps its separately approved question list: review monitoring settings deliberately to change scheduled work.

The overview’s **Visibility over time** separates mention rate from own-domain citation rate and shows answered/requested coverage. Change comparisons use the same question identities, wording/type, brand/domain, market and recorded collector configuration. Adding questions or changing collection scope starts a new comparison baseline. Choose neutral or branded questions separately when useful; a branded question contains a tracked brand, website or named competitor, subject to your reviewed classification.

The latest finished run in each UTC day represents that day. Repeated runs do not receive extra weight. At least 90% of requested answers must be collected for a plotted rate/change comparison; missing or empty answers are not confirmed brand absence. Open **Inspect trend scope and observations** to review partial and excluded runs. Legacy results remain inspectable but do not establish a comparable baseline because their collection settings were not recorded. Provider model versions are not reported, so matching collector routes cannot guarantee an identical underlying model.

## Explore citations and investigate the exact page

Open **Sources & citations**, switch between **Domains** and **Pages**, and filter ownership. A domain with multiple cited pages offers **View pages**; each page retains its own link and **Research** action. **View saved answers → Read saved answer** opens the exact original answer behind a citation. Browsing, changing filters and opening saved evidence make no paid calls. Opening research first shows the selected URL and free estimate; only **Research source** starts the paid lookup.

Coverage counts each successful answered check once per page/domain, even when it repeats a link. Question and per-engine counts describe those saved observations. Ownership uses the brand and reviewed competitor domains captured when each audit ran, with hostname/subdomain boundaries. Later profile edits do not rewrite history. Missing competitor domains remain **Ownership unknown**; they are not treated as absent citations. The separate brand table distinguishes mention rates from domain-citation rates. A cited publisher is not automatically a business competitor, and a citation is not proof of endorsement or accuracy.

## Save, back up, and restore

Settings, question inventory, discovery receipts, audits, completed moves, and source research are saved in the selected server database: built-in SQLite locally or optional hosted Postgres. The same verified key and deployment secret identify the same workspace across browsers. Another key opens a separate workspace. Possession of a shared Treg key grants access to that key's workspace; Lens does not provide team invitations or roles.

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
