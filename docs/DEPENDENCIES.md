# Dependencies and maintenance

Treg Lens has **eight direct runtime dependencies** and **eight development dependencies**. This is not the installed package count: transitive dependencies, optional packages and platform binaries are recorded in `package-lock.json`. Every direct dependency is used. Removing safe session or Markdown handling to reduce a headline count would add custom security-sensitive code.

## Runtime inventory

| Package | Purpose |
| --- | --- |
| `next` | Routing, request handlers, rendering, bundling, local fonts and deployment runtime |
| `react` | Components and interactive state |
| `react-dom` | Browser rendering and dialog portals |
| `iron-session` | Established encrypted/sealed session handling |
| `lucide-react` | Shared tree-shakable icon components |
| `react-markdown` | Structured rendering of untrusted answers without raw HTML |
| `remark-gfm` | Tables, lists and GFM content in answers |
| `@neondatabase/serverless` | Optional hosted Neon Postgres connections and transactions; local forks keep built-in SQLite |

There is no Treg SDK, Axios, ORM, auth SaaS SDK, charting package, CSS framework or UI component framework. Local durable storage uses built-in `node:sqlite` with no external service; hosted Vercel deployments use the one Neon driver. Both use shared asynchronous domain logic and database-backed monitoring leases. Native `fetch`, SVG, and Node crypto/fs/environment primitives cover requests, charts, setup, encryption, backup safety, and the local worker. The optional minutely hosted cron uses Vercel's platform; `vercel.ts` needs no configuration SDK.

The six local font files total 153,448 bytes; browsers load 118,888 bytes of them, and one WOFF is read only when building social preview images. They remove Google Fonts requests during builds and ship with complete OFL licenses, pinned provenance and hashes. See [third-party notices](../THIRD_PARTY_NOTICES.md) and [font provenance](../src/app/fonts/README.md).

## Development inventory

| Package(s) | Purpose |
| --- | --- |
| `typescript` | Static analysis |
| `@types/node`, `@types/react`, `@types/react-dom` | Type declarations |
| `eslint`, `eslint-config-next` | Framework, React and TypeScript lint rules |
| `tsx` | TypeScript tests with Node's built-in runner |
| `@playwright/test` | Production HTTP and browser E2E tests |

Playwright is pinned to 1.61.1 for the macOS 14 WebKit compatibility documented in [testing](./TESTING.md). Browser binaries and OpenSSL are needed only for the full browser suite. Application setup does not need them or any globally installed npm tool.

## Reproducible installation

Use `npm ci`. The v3 lockfile fixes resolved versions and integrity hashes, uses the public npm registry, and includes platform-specific optional packages. `.npmrc` enforces the Node engine requirement and exact saves for new packages. Node.js 24 LTS is recommended; 22.13 is the supported minimum. Do not delete the lockfile, force audit downgrades, or change package managers as a routine setup step.

Secrets belong in ignored local files or deployment environment variables. No registry credentials are required. Build output and browser reports remain untracked.

## Audit status

On 19 October 2026, `npm audit --omit=dev` reported **zero production vulnerabilities**. This is a dated result; rerun after lockfile changes, including the hosted driver addition:

```bash
npm audit --omit=dev
npm audit
```

The full audit currently reports an **unpatched development-only path**: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. Five affected package entries trace back to the same [braces advisory, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists versions through 3.0.3 and no patched version at the time checked.

This path processes local lint glob patterns and is excluded from production dependencies. Remote app requests do not supply those patterns. It remains an upstream development-tool risk: run trusted tooling and review dependency changes. The audit's proposed downgrade of the lint configuration to Next.js 14 is incompatible with this Next.js 16 app and is not applied. No override or suppression hides the finding. Re-evaluate when upstream releases a compatible fix; preserve the official lint rules meanwhile.

## Updates

Dependabot checks npm and GitHub Actions monthly. Framework/lint and React-related updates are grouped to reduce mismatched versions. Security update settings are repository-level; enable them separately on a fork. Updates are reviewable pull requests; nothing auto-merges.

For a dependency change:

1. Explain why native APIs or an existing package cannot cover the feature.
2. Review the license, maintenance, runtime footprint and transitive changes. Keep server-only code out of browser bundles.
3. Update the manifest and lockfile together, using a scoped update.
4. Run `npm ci`, `npm run check`, `npm audit --omit=dev` and `npm run test:e2e` for runtime/framework changes.
5. Verify a fresh production build. For font changes, verify hashes and licenses as well as layout.

Public deployment needs continued review of Node.js, Next.js, React and Treg contracts. See [security](../SECURITY.md) and [contributing](../CONTRIBUTING.md).
