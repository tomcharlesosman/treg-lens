# Get started with Treg Lens

Run the demo first, then connect your own Treg team key when you want live research. Setup and automated tests do not require a Treg account or spend provider credits.

## Prerequisites

Use **Node.js 24 LTS**; the minimum is **22.13**. Install Git and npm, then reopen your terminal after installing Node. The app needs no database, Redis, ORM, Docker, or separately installed Treg SDK. Its fonts are vendored, so a build does not fetch Google Fonts.

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

If setup reports an invalid existing value, decide whether to keep or deliberately replace that configuration. A change to the effective secret invalidates sessions and changes which browser workspace namespace opens. Do not remove an existing secret just to make setup pass.

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

Explore `/demo` to see answers, citations, opportunities, and exports. Demo values are illustrative and demo edits do not become private saved audits. Paid actions lead to sign-in.

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
2. Open project settings. Set your brand, domain, and competitor names before interpreting metrics. Matching depends on the names you configure.
3. Add a buyer question, or use **Discover prompts** with 2–3 seed phrases. Review the discovery estimate before starting it, then select the returned questions or keywords you want to track.
4. Open **Run audit**, choose prompts and engines, and review the current estimate. Start with one prompt and one engine to inspect the workflow. Up to 8 prompts and 4 engines are supported.
5. Inspect the answer and its cited URLs. A cited-page research request has its own estimate and paid action for Moz metrics and Exa extraction.
6. Review opportunities, copy a content brief, and export a report. Publishing and outreach remain actions you perform yourself.

Live discovery, audits, and source research use your Treg team's billing. Estimates are quotes, not final charges or balance reservations. Missing billing headers mean unknown cost. A partial failure preserves successful evidence; an ambiguous timeout can still have upstream activity. Check Treg activity before deliberately retrying.

Perplexity uses the Sonar model API; the other engines use web-interface answers. Audits use United States / English parameters. Repeat the same inputs when comparing runs, and treat scores as prioritization heuristics rather than promises of visibility.

## Understand what is saved

Settings, tracked prompts, audits, completed moves, and source research stay in this browser's `localStorage`, under a namespace derived from the key and deployment secret. Logout leaves that local history in place. Keys are held in an encrypted HttpOnly session cookie, not `localStorage`, `sessionStorage`, or workspace exports. An optional per-request override stays in memory until reload.

There is no cross-device synchronization or server backup. A different browser, origin/port, key, or deployment secret opens a different local workspace. Clearing site data can remove history. People sharing a browser profile can access its origin-local data; the namespace is not encrypted storage.

Use **Export report → JSON** for the richer report, including source research, or CSV for answer rows. Filters affect exports; select the intended date range and engines first. JSON is a portable report, and there is currently no supported import/restore workflow. Keep copies before changing credentials, secrets, or site data.

## Environment and verification

An exported shell `SESSION_SECRET` overrides dotenv files. In development, `.env.development.local` also takes precedence over `.env.local`; production has its own `.env.production.local` override. An empty higher-priority assignment can shadow a valid lower-priority value. `doctor` reports the source without printing the value. Keep secrets out of `NEXT_PUBLIC_` variables. See [deployment configuration](DEPLOYMENT.md#configuration-and-secrets) for the full order.

For a contribution, start with:

```bash
npm run check
```

This runs lint, type checking, library tests, and documentation checks. For browser or HTTP changes, follow [the testing guide](TESTING.md) to install browser engines and run `npm run test:e2e`. The full suite uses an isolated production HTTPS server and synthetic Treg responses.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [the agent quickstart](AGENT-QUICKSTART.md) before extending a fork. [Architecture](ARCHITECTURE.md), [API contracts](API.md), [dependency notes](DEPENDENCIES.md), and [deployment](DEPLOYMENT.md) cover the deeper boundaries. Use [support troubleshooting](../SUPPORT.md) when setup or provider requests fail.
