# Contributing to Treg Lens

Contributions are welcome. Keep the workspace accessible, useful, and honest about what its data can support.

## Development

Use Node.js 22.13 or later; Node.js 24 LTS is recommended.

```bash
npm install
cp .env.example .env.local
openssl rand -base64 48
```

Copy the generated value into `SESSION_SECRET` in your private `.env.local`, then run `npm run dev`. Use `/demo` for sample data or sign in at `/login` with your own Treg team API key. No operator `TREG_TOKEN` is required. See [README.md](./README.md) for the complete setup and storage model.

Before proposing a change, run:

```bash
npm test
npm run lint
npm run test:e2e
```

`npm test` runs TypeScript tests in `src/lib` with `tsx --test`. These cover request validation, sessions, provider parsing, costs, and metrics using fixtures and mocked requests, without paid calls.

Install browser engines once with `npx playwright install chromium firefox webkit`. The production end-to-end suite covers HTTP routes and complete browser workflows in three engines, with synthetic provider responses and no Treg charges. See [docs/TESTING.md](./docs/TESTING.md) for coverage, reports and targeted runs.

Include what changed, why it matters, and how you verified it. For interface changes, include a screenshot and check narrow screens and keyboard navigation. Never include API keys, session cookies, `SESSION_SECRET`, or private audit data in fixtures, logs, screenshots, or issue reports.

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
