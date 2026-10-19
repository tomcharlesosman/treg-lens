# Security

Use the current `main` branch and keep dependencies updated. This project does not maintain separate supported release branches or provide a security response SLA.

## Reporting a vulnerability

**Do not put exploit details, API keys, session cookies, environment files, or private audit data in a public issue or pull request.**

[Report a vulnerability privately through GitHub](https://github.com/tomcharlesosman/treg-lens/security/advisories/new). Private vulnerability reporting is enabled for this repository, verified on 2026-10-19. The report goes to repository maintainers rather than the public issue tracker. Do not assume ordinary GitHub issues or discussions are confidential.

Owners of forks must enable private vulnerability reporting for their own repository and update this policy's reporting link. Do not assume the upstream setting or reporting destination applies to your fork. Report upstream application vulnerabilities here; report a fork's deployment-specific issue to that deployment's operator.

A useful private report includes the affected commit, a minimal sanitized reproduction, impact, and any proposed fix. Test only systems and accounts you control. Use synthetic keys and provider fixtures whenever possible; do not expose customer data or trigger paid calls to demonstrate a report.

## Protecting an affected deployment

- Revoke an exposed Treg API key through the affected Treg team and issue a replacement. Deleting a local cookie does not revoke the upstream key.
- Rotate a compromised `SESSION_SECRET` in the server environment. This invalidates sessions, changes server workspace namespaces, and prevents old scheduled credentials from being decrypted. Back up data and retain recovery material safely; do not assume rotation migrates history. Pause automated schedules and reconcile Treg activity before enabling replacements.
- Restrict or stop a vulnerable public deployment while investigating, and preserve sanitized logs privately. Do not publish unredacted Playwright traces or network recordings.

After a database restore, stop server and worker, run `npm run monitor -- --pause-all`, reconcile charges since the backup, and deliberately re-enable reviewed schedules. Restoring a database does not roll back upstream billing.

## Relevant boundaries

Treg Lens validates user keys through free Treg metadata, seals them in encrypted HttpOnly cookies, and rechecks upstream access. Production requires HTTPS and a stable private `SESSION_SECRET`. Paid HTTP routes require a validated user credential and must never inherit an operator key.

Workspace records, revisions, and monitor jobs live in private server SQLite; research content is not encrypted by the application. Browser recovery copies and JSON exports also contain private research. Monitoring retains the signed-in key only after explicit consent, separately protected by AES-256-GCM with workspace-associated data. Protect both database backups and the stable secret; ordinary logout does not remove monitoring consent. Live requests send prompts and URLs to Treg and its upstream providers. Source research accepts public HTTP(S) URLs and checks DNS before requesting provider extraction. Manual route rate guards remain process-local. Scheduled audits use a durable global lease, per-audit/monthly reservations, and stable job idempotency. Interrupted or uncertain paid work pauses rather than automatically retrying. The supported deployment uses one persistent local SQLite host; multi-host services need a separately designed shared storage/limiter boundary and trusted proxy configuration.

See [the testing guide](docs/TESTING.md) for fixture-based security coverage, [deployment guidance](docs/DEPLOYMENT.md) for operations, and [dependency notes](docs/DEPENDENCIES.md) for dependency scope and audit limitations. Automated checks are evidence about tested behavior, not a guarantee that a deployment is secure.
