# Treg Lens

**See how AI sees your brand. Find your next move.**

![Treg Lens marketing page](docs/marketing.png)

![Treg Lens demo dashboard](docs/screenshot.png)

An open-source AI visibility workspace, powered by the [Treg AEO toolkit](https://treg.to/aeo). Discover buyer questions, track prompts across AI engines, compare competitors, inspect citations, and turn gaps into practical content briefs.

[**Fork Treg Lens**](https://github.com/tomcharlesosman/treg-lens/fork) · [Treg AEO toolkit](https://treg.to/aeo) · [MIT license](./LICENSE)

Inspired by [Profound](https://www.tryprofound.com/), built as an independent, self-hosted implementation. This is a focused AEO workspace, not complete Profound feature parity.

## What you can do

- Explore the public landing page and a clearly labeled, key-free demo.
- Sign in with your own Treg team API key; no separate Lens account is needed.
- Set your brand, domain, competitors, and buyer questions.
- Discover questions from 2–3 seed phrases using Google suggestions and People Also Ask. Select up to 8 questions or keyword phrases to track.
- Audit prompts across ChatGPT, Gemini, Google AI Mode, and Perplexity.
- Explore visibility, brand mentions, competitor performance, and cited sources.
- Research cited pages with Moz authority metrics and Exa extraction: inspect brand excerpts, authors, and contact routes actually returned by the page.
- Review visibility gaps, copy content briefs, and export audit history as JSON or CSV.

The app brings question discovery, measurement, and cited-page research from the [Treg AEO workflow](https://treg.to/aeo) into one workspace. Full keyword-intent scoring, competitor backlink analysis, people enrichment, and scheduled rechecks are directions for expansion. Publishing and outreach stay with you.

Perplexity uses the Sonar model API; the other engines return web-interface answers. Audits use United States / English parameters, with up to 8 prompts of 500 characters each.

## Run locally

Use **Node.js 22.13 or later**; Node.js 24 LTS is recommended.

```bash
git clone https://github.com/tomcharlesosman/treg-lens.git
cd treg-lens
npm install
cp .env.example .env.local
openssl rand -base64 48
```

Copy the generated value into `SESSION_SECRET` in `.env.local`. Keep this value private and stable between restarts. Then start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Visit [the demo](http://localhost:3000/demo) without a key, or [sign in](http://localhost:3000/login) with a team API key from [Treg](https://treg.to/app). Your workspace opens at `/app`.

No operator `TREG_TOKEN` is required. Each user supplies their own key and pays through their own Treg team. Never commit `.env.local` or expose `SESSION_SECRET` through a `NEXT_PUBLIC_` variable.

For a production build, configure `SESSION_SECRET` in the server environment, serve the app over HTTPS, and run:

```bash
npm run build
npm start
```

## A useful first audit

1. Set your actual brand name, domain, and competitors. Brand names act as the matching dictionary, so include the names people use.
2. Add buyer questions, or use **Discover prompts** with 2–3 seed phrases. Discovery returns search suggestions and actual People Also Ask questions; search volume appears only when supplied by the provider.
3. Select the engines, review the estimated cost, and run the audit.
4. Inspect answers and citations. Open a cited source, review its research estimate, then request page metrics and extraction. Missing fields remain unknown.
5. Use the opportunity queue to create a content brief. Check observed authors and contact links when planning outreach; nothing is sent automatically.
6. Export your results. After making changes, repeat the same prompts, locale, and engine set for meaningful comparisons.

AI answers vary between runs. Brand detection, inferred rankings, and opportunity scores help prioritize investigation; they do not guarantee recommendations or prove causation. Demo values are illustrative, separate from your saved live audits.

### Visibility methodology

For each successful answer, the toolkit score awards 50 points for a brand mention, 30 divided by the brand's inferred position, and 20 for a citation of your domain. The workspace averages that score across successful answers. Failed or missing answers are excluded.

Position uses a numbered list position when supplied; otherwise, it uses first appearance among recognized brands. Recognition depends on the configured dictionary and returned brand entities. Source coverage is the percentage of successful answers citing a domain. The comparison chart uses brand mention rates, and opportunities are ranked by the proportion of answers missing your brand.

Moz scores describe link authority. Page extractions may be incomplete or cached. Follow the linked evidence to assess each result.

## Costs and real data

Treg provides the upstream search, AI answer, page metric, and extraction endpoints. Requests use a server-side endpoint allowlist. Discovery, audits, and source research show live catalog estimates before you explicitly run paid work.

- **Demo data, sign-in validation, and price estimates have no provider cost.** A valid key can sign in with a zero balance. Paid work requires the appropriate Treg balance or connected provider credentials.
- **Estimates are not final charges.** Catalog prices can change and depend on units, routing, or the provider. The AEO landing page's example workflow is not a fixed tariff for this app.
- **Actual spend comes from Treg.** `X-Treg-Cost-Micro` reports micro-USD; divide by 1,000,000 for USD. `X-Treg-Call-Id` identifies the call. Unknown charges stay distinct from zero.
- **Reconcile at the source.** Use the Treg dashboard or `treg balance` and `treg calls`. Calls outside Lens are outside its local history.

Check `treg catalog get <endpoint-id>` before changing an integration. The catalog and upstream response shapes are the source of truth.

## Sessions, storage, and deployment

The app uses Next.js App Router. `/` is the marketing page, `/login` accepts a Treg key, `/demo` is the public sample, and `/app` requires a verified session.

Keys are verified through a free Treg metadata lookup and sealed into an encrypted, HttpOnly, SameSite=Lax cookie with a 12-hour lifetime. Protected access rechecks the key with Treg, so revoked keys stop working. Keys are never saved in `localStorage`, `sessionStorage`, or exports. Optional per-request credential overrides remain in memory until reload. Paid HTTP routes require a validated user key or session; they do not inherit an operator's server token.

Project settings, prompts, audits, completed moves, and source research stay in browser `localStorage`, under an opaque namespace for the signed-in key and deployment. Data is not synchronized between browsers or devices. Switching keys or changing `SESSION_SECRET` uses a different namespace; legacy unscoped workspace data is left untouched rather than migrated. Export copies before changing credentials or clearing site data. CSV contains answer rows; JSON preserves the richer workspace report and source research.

For public deployment, use HTTPS and a stable, private `SESSION_SECRET`. Built-in rate guards are process-local; a deployment spanning multiple instances should add a shared, durable limiter and operational monitoring. This release has no shared workspace database, team collaboration, or managed backups. Live requests send the requested prompts and URLs to Treg and its upstream providers.

## Contribute

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Useful improvements include provider fixtures, brand matching, accessibility, import/export reliability, and additional AEO steps with transparent costs.

```bash
npm test
npm run lint
npm run test:e2e
```

Tests use local fixtures and mocked requests; they do not spend Treg credits.

Install browser engines with `npx playwright install chromium firefox webkit` before the first end-to-end run. See [the testing guide](./docs/TESTING.md) for feature coverage, browser/API reports and CI.

The dated [verification report](./docs/TEST-REPORT.md) records the full test results, fixes and separate live provider checks.

Released under the [MIT license](./LICENSE). Product names and trademarks belong to their respective owners. This project is not affiliated with Profound.
