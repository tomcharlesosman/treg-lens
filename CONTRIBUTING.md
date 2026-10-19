# Contributing to Treg Lens

Contributions are welcome. Keep the workspace accessible, useful, and honest about what its data can support.

Small fixes can go straight to a pull request. For a larger change, an issue can help clarify the user problem and data requirements before implementation, but it is not an approval gate. Follow [the community conduct guide](./CODE_OF_CONDUCT.md) and use [SUPPORT.md](./SUPPORT.md) for usage questions. Report vulnerabilities through [SECURITY.md](./SECURITY.md), without public exploit details.

## Development

Use Node.js 22.13 or later; Node.js 24 LTS is recommended.

```bash
npm ci
npm run setup
npm run doctor
npm run dev
```

Use `/demo` for sample data or sign in at `/login` with your own Treg team API key. No operator `TREG_TOKEN` is required. See [the getting-started guide](./docs/GETTING-STARTED.md) for setup, first use, and the storage model. Keep the generated `.env.local` private and preserve its `SESSION_SECRET` between restarts.

Fork the repository on GitHub, clone your fork, and create a branch for the change. Open the pull request against `tomcharlesosman/treg-lens:main`. Keep unrelated changes in separate pull requests and preserve the lockfile when changing dependencies.

Read [AGENTS.md](./AGENTS.md) and [the agent quickstart](./docs/AGENT-QUICKSTART.md) before using an agent or editing Next.js code. This installed Next.js version has its own documentation under `node_modules/next/dist/docs/`; check the relevant guide instead of relying on older API conventions. Give an agent the specific outcome, relevant files, and a verification target. Use synthetic data, and keep live calls out of automated test runs.

Before proposing a change, run:

```bash
npm run check
npm run test:e2e
```

`npm run check` runs lint, TypeScript checking, library tests, and documentation checks. The library tests in `src/lib` use `tsx --test` and cover request validation, sessions, provider parsing, costs, and metrics using fixtures and mocked requests, without paid calls.

Install browser engines once with `npx playwright install chromium firefox webkit`. Both `npm run test:e2e` and the interactive `npm run test:e2e:ui` build the app before opening the production test server. The end-to-end suite covers HTTP routes and complete browser workflows in three engines, with synthetic provider responses and no Treg charges. See [docs/TESTING.md](./docs/TESTING.md) for coverage, reports and targeted runs.

Include what changed, why it matters, and how you verified it. For interface changes, include a screenshot and check narrow screens and keyboard navigation. Never include API keys, session cookies, `SESSION_SECRET`, or private audit data in fixtures, logs, screenshots, or issue reports.

Run checks appropriate to the change. Documentation-only edits need working commands and links checked; they do not require launching all browsers. CI runs library tests, lint, and the production browser/API suite for pull requests. Review any failures and include known limitations so another contributor can reproduce the result.

## Find your way around

| Location | Purpose |
| --- | --- |
| `src/app` | Public pages, authenticated workspace entry, and HTTP route handlers |
| `src/components` | Marketing, workspace views, dialogs, and safe answer rendering |
| `src/lib` | Treg contracts, session helpers, provider parsing, metrics, and library tests |
| `tests/e2e` | API and browser workflows with synthetic data |
| `tests/e2e/support/treg-fixture.cjs` | Test-server Treg boundary; refuses unknown paths and checks paid-call guards |
| `docs/GETTING-STARTED.md` | Fork, install, configure, and run your first workspace |
| `docs/AGENT-QUICKSTART.md` | Agent handoff, boundaries, and verification workflow |
| `docs/TESTING.md` | Test commands, supported environments, reports, and coverage |
| `docs/DEPLOYMENT.md` | HTTPS, server configuration, persistence, and operational limits |
| `docs/DEPENDENCIES.md` | Runtime dependency scope and audit limitations |

Choose a focused improvement such as a reproducible parsing bug, an accessibility fix, an export edge case, or a documented empty state. Add a regression test when behavior warrants one; avoid tests that only repeat the implementation.

## Integration and session changes

- Read the current [Treg catalog](https://treg.to) and [AEO workflow](https://treg.to/aeo) before changing an endpoint. Confirm its exact inputs, response shape, and pricing.
- Keep provider calls on the server and extend the endpoint allowlist deliberately. Never accept an arbitrary upstream URL for the proxy.
- Every paid HTTP request must use a verified user key or session. Preserve the rule that requests cannot inherit an operator's server credentials.
- Keep keys out of browser storage and exports. Exercise expiry, revoked keys, tampered cookies, cross-origin requests, and storage isolation when changing authentication. A valid zero-balance key must still be able to sign in.
- Treat live calls as paid work. Do not make them in automated tests or silently retry completed work. Use small, sanitized provider fixtures and record the shape they represent.
- Preserve returned answers, source URLs, call IDs, availability, and cost metadata. Partial runs should remain inspectable. A missing answer is not a negative mention, and an unknown charge is not a free call.
- Keep demo data labeled and separate from saved live audits. Do not invent historical movement or provider results to fill empty states.

## Analytics and persistence

Explain metric definitions and denominators. Test absent brands, partial engine failures, repeated citations, malformed responses, and empty audit sets. Heuristic matches and opportunity rankings should remain recognizable as estimates.

Preserve browser data when changing its schema. Workspaces use opaque per-key storage namespaces; never mix one key's saved data into another workspace or silently import legacy unscoped data. For export changes, check Unicode, multiline answers, CSV quoting, source research, and empty results.

## Scope

The app covers key-based sign-in, prompt discovery, audits, visibility, competitors, citations, cited-page research, and content briefs. New features should expose their inputs and costs, return source evidence, and leave external publishing or messaging under the operator's control.

By submitting a contribution, you agree that it may be distributed under this project's [MIT license](./LICENSE).
