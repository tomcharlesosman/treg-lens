# Security

Use the current `main` branch and keep dependencies updated. This project does not maintain separate supported release branches or provide a security response SLA.

## Reporting a vulnerability

**Do not put exploit details, API keys, session cookies, environment files, or private audit data in a public issue or pull request.**

[Report a vulnerability privately through GitHub](https://github.com/tomcharlesosman/treg-lens/security/advisories/new). Private vulnerability reporting is enabled for this repository, verified on 2026-10-19. The report goes to repository maintainers rather than the public issue tracker. Do not assume ordinary GitHub issues or discussions are confidential.

Owners of forks must enable private vulnerability reporting for their own repository and update this policy's reporting link. Do not assume the upstream setting or reporting destination applies to your fork. Report upstream application vulnerabilities here; report a fork's deployment-specific issue to that deployment's operator.

A useful private report includes the affected commit, a minimal sanitized reproduction, impact, and any proposed fix. Test only systems and accounts you control. Use synthetic keys and provider fixtures whenever possible; do not expose customer data or trigger paid calls to demonstrate a report.

## Protecting an affected deployment

- Revoke an exposed Treg API key through the affected Treg team and issue a replacement. Deleting a local cookie does not revoke the upstream key.
- Rotate a compromised `SESSION_SECRET` in the server environment. This invalidates existing sessions and changes workspace namespaces. Export browser data first when safe; do not assume rotation migrates existing local history.
- Restrict or stop a vulnerable public deployment while investigating, and preserve sanitized logs privately. Do not publish unredacted Playwright traces or network recordings.

## Relevant boundaries

Treg Lens validates user keys through free Treg metadata, seals them in encrypted HttpOnly cookies, and rechecks upstream access. Production requires HTTPS and a stable private `SESSION_SECRET`. Paid HTTP routes require a validated user credential and must never inherit an operator key.

Workspace records live in browser `localStorage`; they are not a shared, encrypted database or a backup service. Live requests send prompts and URLs to Treg and its upstream providers. Source research accepts public HTTP(S) URLs and checks DNS before requesting provider extraction. Built-in rate guards are process-local; public deployments across multiple instances need a shared limiter and appropriate proxy configuration.

See [the testing guide](docs/TESTING.md) for fixture-based security coverage, [deployment guidance](docs/DEPLOYMENT.md) for operations, and [dependency notes](docs/DEPENDENCIES.md) for dependency scope and audit limitations. Automated checks are evidence about tested behavior, not a guarantee that a deployment is secure.
