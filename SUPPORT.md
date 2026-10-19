# Support and troubleshooting

Treg Lens is a community-maintained, self-hosted project. GitHub issues are available for bugs, usage questions, and feature proposals; there is no guaranteed support response time or managed hosting service.

Start with [getting started](docs/GETTING-STARTED.md), [deployment guidance](docs/DEPLOYMENT.md), and [the testing guide](docs/TESTING.md). Contributors and agents can use [CONTRIBUTING.md](CONTRIBUTING.md) and [the agent quickstart](docs/AGENT-QUICKSTART.md). Search [existing issues](https://github.com/tomcharlesosman/treg-lens/issues) before opening a new one.

## Common problems

| Symptom | What to check |
| --- | --- |
| The app does not start or build | Use Node.js 22.13 or later, install from the lockfile with `npm ci`, run `npm run setup` and `npm run doctor`, and include the failing command and sanitized error when asking for help. |
| Sign-in says the server is not configured | Set a private, stable `SESSION_SECRET` of at least 32 characters in the server environment. Restart a local process after changing `.env.local`. Never use a `NEXT_PUBLIC_` variable for it. |
| The key is invalid or cannot select a team | Use a team-scoped Treg API key from your Treg account. Lens cannot change upstream team permissions. A valid zero-balance key can still sign in. |
| Sign-in works locally but does not persist in production | Serve the app over HTTPS. Production cookies are `Secure`; verify the proxy's public origin and cookie handling. |
| A provider fails, is busy, or cannot fund a call | Inspect the retained error and Treg activity/billing. Keep successful answers. Refresh the estimate before deliberately retrying; a timeout does not prove that upstream work stopped. |
| A cost is shown as unknown | Reconcile the call in Treg. An absent billing header means unknown cost, not a free request. |
| Saved work is missing after switching keys, browsers, or secrets | Workspaces are browser-local and use a per-key, per-deployment namespace. Return to the original browser and key where possible. Check an exported JSON backup; the project has no server-side history recovery. |
| A source has no author, authority score, or brand excerpt | Extraction can be cached or incomplete, and providers may omit fields. Inspect the linked source and returned evidence. Missing information stays unknown. |
| Browser tests cannot launch | Install the pinned engines with `npx playwright install chromium firefox webkit`. Follow the testing guide for OpenSSL, platform requirements, and reports. |

## Ask for help

[Open a bug report](https://github.com/tomcharlesosman/treg-lens/issues/new?template=bug_report.yml) with the commit, OS/Node/browser versions, reproduction steps, expected result, and observed result. A demo or fixture reproduction is particularly useful. Use [a feature request](https://github.com/tomcharlesosman/treg-lens/issues/new?template=feature_request.yml) for a proposed workflow; a blank issue is available for other questions.

Remove API keys, session cookies, `.env` contents, private prompts, and customer information from screenshots, exports, traces, and logs. [Report suspected vulnerabilities privately](https://github.com/tomcharlesosman/treg-lens/security/advisories/new) using the process in [SECURITY.md](SECURITY.md).

Treg account access, provider credentials, balance, and upstream billing are managed through [Treg](https://treg.to/app). Include only sanitized call IDs and errors when distinguishing an upstream issue from a Lens bug. Profound does not maintain or support this independent project.
