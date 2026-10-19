# Treg Lens

**See how AI sees your brand. Find your next move.**

[![Tests](https://github.com/tomcharlesosman/treg-lens/actions/workflows/test.yml/badge.svg)](https://github.com/tomcharlesosman/treg-lens/actions/workflows/test.yml)

An open-source AI visibility workspace powered by the [Treg AEO toolkit](https://treg.to/aeo). Discover buyer questions, collect AI answers, compare competitors, inspect citations, and turn visibility gaps into content briefs.

[**Fork the repository**](https://github.com/tomcharlesosman/treg-lens/fork) · [Agent quickstart](docs/AGENT-QUICKSTART.md) · [Documentation](#documentation) · [MIT license](LICENSE)

## Run it

Install **Git and Node.js 24 LTS**; the minimum Node version is **22.13**. npm is included with Node. These commands work in macOS/Linux terminals and Windows PowerShell. After forking, use your fork's clone URL in the first command.

```bash
git clone https://github.com/tomcharlesosman/treg-lens.git
cd treg-lens
npm ci
npm run setup
npm run doctor
npm run dev
```

Open [localhost:3000/demo](http://localhost:3000/demo) for your first working workspace. **No Treg key is needed for the demo.** The [marketing page](http://localhost:3000/) includes a sign-in form and links to the demo and source.

`setup` creates private `.env.local` configuration using Node's built-in random generator. It creates a 64-character `SESSION_SECRET`, never prints it, and preserves a valid existing secret on repeated runs. Invalid nonempty secrets are refused rather than replaced. `doctor` checks local prerequisites without calling Treg. No copying environment files, OpenSSL, Docker, database, Redis, external identity service, or Treg SDK is required to run the app.

The current lockfile has a documented, unpatched development-linter advisory. The production audit has no findings as of the verification date. Read [the audit notes](docs/DEPENDENCIES.md#audit-status) before following npm's force-fix suggestion.

When ready for live research, get your own **team API key** from [Treg](https://treg.to/app) and paste it at [localhost:3000/login](http://localhost:3000/login). No separate Lens account or operator `TREG_TOKEN` is needed. Paid discovery, audits, and source research start only after you review an estimate and choose to run them.

Need a different port, setup help, or a complete first audit? Follow [getting started](docs/GETTING-STARTED.md). To hand setup to a coding agent, use the [copyable agent prompt](docs/AGENT-QUICKSTART.md#copy-this-prompt).

## What works today

- **Prompt discovery:** Google keyword suggestions and actual People Also Ask questions from 2–3 seed phrases; select up to 8 prompts to track.
- **Answer monitoring:** ChatGPT, Gemini, Google AI Mode, and Perplexity; up to 8 questions of 500 characters each across four engines.
- **Competitive visibility:** brand mentions, inferred recommendation positions, source coverage, trends, and share of voice from saved answers.
- **Cited-page research:** Moz authority metrics and Exa extraction with observed brand excerpts, authors, and contact routes.
- **Action and history:** visibility gaps, local content-brief templates, completed moves, and JSON/CSV reports.
- **Your instance:** Treg-branded marketing, API-key login, a labeled demo, and a workspace stored in your browser.

Perplexity uses the Sonar model API; the other engines return web-interface answers. Research uses United States / English parameters. Partial failures retain successful evidence, and missing fields stay unknown. The [architecture guide](docs/ARCHITECTURE.md#analytics-and-evidence) explains scoring and its limits.

This is an independent, focused implementation inspired by [Profound](https://www.tryprofound.com/), without complete product parity. There is no shared database, cloud synchronization, scheduler, team collaboration, automatic outreach, publishing, or import UI. Content briefs are local templates rather than additional model calls.

## Documentation

| I want to… | Read |
| --- | --- |
| Install, try the demo, and run a first audit | [Getting started](docs/GETTING-STARTED.md) |
| Give setup or a fork to a coding agent | [Agent quickstart](docs/AGENT-QUICKSTART.md) and [AGENTS.md](AGENTS.md) |
| Deploy my own Node.js instance over HTTPS | [Deployment](docs/DEPLOYMENT.md) |
| Understand the small dependency footprint | [Dependencies](docs/DEPENDENCIES.md) |
| Integrate with the HTTP API | [API contracts](docs/API.md) |
| Understand state, costs, and extension points | [Architecture](docs/ARCHITECTURE.md) |
| Run tests and inspect coverage | [Testing](docs/TESTING.md) and [verification report](docs/TEST-REPORT.md) |
| Contribute a fix or feature | [Contributing](CONTRIBUTING.md) and [pull request template](.github/pull_request_template.md) |
| Get help, report a bug, or report a vulnerability | [Support](SUPPORT.md), [security policy](SECURITY.md), and [code of conduct](CODE_OF_CONDUCT.md) |

## Costs, credentials, and data

Setup, the demo, and automated tests make no paid provider calls. Sign-in uses free Treg key metadata, and a valid zero-balance key can sign in. Estimates read the live catalog; paid work uses your Treg team's billing. Estimates are not final charges. Reported spend comes from Treg billing headers, and unknown charges stay distinct from zero. Check Treg activity after an ambiguous failure before deliberately retrying. See [API cost semantics](docs/API.md#costs-errors-and-retries).

Login sends your key to the application server and seals it into an encrypted HttpOnly cookie with a 12-hour lifetime. Production requires HTTPS and a stable private `SESSION_SECRET`. Protected access revalidates the key with Treg. Keys are excluded from `localStorage`, `sessionStorage`, and exports; optional per-request overrides stay in memory until reload. Public paid routes never inherit an operator's credential.

Project settings, prompts, audit history, completed moves, and source research use ordinary browser `localStorage`, separated by key and deployment. This data is not synchronized or encrypted as a shared workspace database. A different browser, key, origin, or `SESSION_SECRET` opens a different namespace. Preserve your secret between restarts, and export before changing credentials or clearing site data.

CSV contains filtered answer rows. JSON keeps the richer report, including source research; **there is currently no import/restore UI**. Keep exported copies as readable backups. Details and operational limits are in [architecture](docs/ARCHITECTURE.md#browser-data-and-exports) and [deployment](docs/DEPLOYMENT.md).

## Develop and verify

```bash
npm run check
```

This runs ESLint, fresh Next.js route type generation, TypeScript, library/setup tests, and local documentation-link checks. The project has **seven direct runtime packages** for the framework, encrypted sessions, icons, and safe Markdown; their roles are documented in [dependencies](docs/DEPENDENCIES.md). Fonts are vendored locally, about **102 KB**, with licenses and provenance included. Builds and browsers do not download Google Fonts. See [font notices](src/app/fonts/README.md).

For the complete browser and HTTP suite, install the Playwright engines once and make OpenSSL available for the temporary HTTPS test certificate:

```bash
npx playwright install chromium firefox webkit
npm run doctor -- --e2e
npm run test:e2e
```

The suite builds the production app, runs it behind an isolated local HTTPS proxy, and replaces upstream Treg calls with fixtures that refuse unknown requests. It does not spend Treg credits. OpenSSL is only an end-to-end test prerequisite. `npm run test:e2e:ui` also builds first; `npm run test:e2e:report` opens the latest report. Linux may need Playwright's OS dependencies; follow the [testing guide](docs/TESTING.md) for platform details and the separate live-verification record.

## Make a fork yours

The [fork checklist](docs/AGENT-QUICKSTART.md#make-a-fork-yours) covers repository URLs, support/security destinations, metadata, branding, test expectations, and license notices. Enable private vulnerability reporting and security updates for your own GitHub repository; those settings are not inherited by cloning the code.

Contributions are welcome through [issues](https://github.com/tomcharlesosman/treg-lens/issues) and pull requests. Follow [CONTRIBUTING.md](CONTRIBUTING.md), report vulnerabilities through [SECURITY.md](SECURITY.md), and preserve the [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Preview

![Treg Lens marketing page](docs/marketing.png)

![Treg Lens demo dashboard](docs/screenshot.png)

Treg Lens is released under the MIT license. Font licenses remain separate. Product names and trademarks belong to their respective owners; this project is not affiliated with Profound.
