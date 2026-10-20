# Product behavior and review scope

Treg Lens's primary product is the authenticated live workspace. It connects a user's Treg key to real answer/search/source APIs, saves research on the server, and can run explicitly budgeted scheduled audits. The public demo is a separate illustrative preview.

This document maps the implemented product and its operational boundaries. Test results belong to the revision recorded in [the verification report](TEST-REPORT.md) and CI, rather than to this feature inventory.

## Live workflow

| Capability | Product behavior | Boundary |
| --- | --- | --- |
| Login | Free Treg team-key validation, sealed session, upstream revalidation | Possession of the same key shares its workspace; no team roles/invitations |
| Workspace | SQLite or hosted Postgres snapshot and atomic audit append, per-key namespace, revision-checked saves | SQLite needs persistent local disk; hosted mode needs configured Neon; content is not encrypted at rest by the application |
| Prompt discovery | Bounded keyword ideas and actual People Also Ask questions, selectable imports | Provider results/volumes may be missing; no invented questions |
| Audits | Up to eight prompts across four engines, live prices, retained partial answers and billing flags | Manual requests are not an indefinitely resumable job queue |
| Analytics | Mention rates, source coverage, position heuristics, share of voice and saved-date trends | Measures observed answers, not causation, factuality or guaranteed recommendations |
| Sources | Moz link metrics and Exa page extraction with observed authors/contact routes | Extraction may be incomplete/cached; no guessed contacts or outreach |
| Content briefs | Editable templates grounded in measured visibility gaps | No paid model-generated article/draft, automatic publishing or factual verification |
| Backups | Full versioned JSON replacement, confirmed retained-monitor-audit merge, and audit deletion; filtered reports separately available | Restores content, not credentials, monitor consent or billing ledger |
| Monitoring | Daily/weekly UTC cadence, local worker or optional hosted cron, encrypted retained key, durable budget ledger | Requires explicit enabling and a running worker; monthly cap covers scheduled audits only |
| Operations | Selected-storage health, SQLite backup/pause commands and documented remote Postgres recovery | Operator supplies suitable hosting/database, runner, HTTPS, protected backups and billing reconciliation |

The implemented scope does not include all Profound capabilities. Shared team accounts, notification delivery, content publishing, automatic outreach, a broad keyword-intent/backlink/enrichment pipeline, and multi-region managed hosting are not provided. A labeled template or sample is not represented as a live generated result.

## Spending and credential review

The implementation keeps provider routes allowlisted, caller credentials validated, and arbitrary user URLs out of the server's own network fetches. Manual credential overrides are independent of the signed-in session. Public endpoints never fall back to an operator key.

Monitoring requires a deliberate user configuration. It retains the signed-in key using workspace-bound AES-256-GCM, with separate derivation purposes for credential encryption and runner authorization. The public schedule view and backups omit retained credentials. A user session or ordinary Treg key cannot authorize an internal runner tick.

The worker claims one due schedule under a global database lease, reserves a live catalog ceiling atomically, then executes the reserved quote with per-call spending caps and stable job idempotency. Provider network calls do not hold the database transaction open. Known final charges replace reservations; incomplete settlement retains the ceiling. Interrupted jobs pause and are not automatically resubmitted. Partial errors and budget failures require review before re-enabling.

Successful cadence remains aligned to the selected UTC slot and skips missed slots instead of replaying a backlog of charges. Pausing removes the retained key; it cannot revoke an already submitted provider request. Logout clears the cookie but does not pause monitoring. The budget ledger is independent of editable workspace reports, so importing reported costs cannot reset scheduled spend.

## Data-loss and concurrency review

Server snapshots use compare-and-swap revisions; scheduled/manual append operations use transactions and audit IDs. A stale browser save receives a conflict instead of replacing a newer snapshot. The UI retains unsaved data, exposes synchronization status, and supports full backups before choosing a replacement. Old browser-only data must not silently overwrite a saved server workspace.

A paid manual audit attempts server persistence before returning its saved flag. If that save fails, the response preserves the evidence and tells the user to export rather than repeat the paid call. Scheduled results are journaled before appending to the bounded workspace. If append fails or a journaled completion is interrupted, monitoring pauses and the retained audit can be downloaded and explicitly merged through Backup and restore. Existing audit IDs and settings survive the merge; deletion or import never resets the schedule's spending ledger.

Online operator backups use SQLite's consistent `VACUUM INTO` path. Restoring a database does not undo external Treg charges. For SQLite, app and worker remain stopped during restore; `npm run monitor -- --pause-all` removes restored spending credentials before owners reconcile and deliberately resume. Hosted Postgres uses provider backups or pg_dump with a direct connection; local backup/pause scripts refuse remote mode. Keep the matching secret separately and follow the mode-specific restore procedure.

## Verification boundaries

Library tests cover parsing, scoring, session sealing, workspace validation/concurrency, monitor encryption/leases/budgets/crash handling, and backup behavior. Production HTTP/browser tests use a temporary database and a fail-closed Treg fixture. Tests exercise application routes and UI rather than a production test-authentication bypass.

Synthetic provider success is evidence for the tested adapter and workflow. It does not establish current availability or billing of a live provider. Dated live checks are separate and require explicit spending scope. See [testing](TESTING.md), [API contracts](API.md), [security policy](../SECURITY.md), and [deployment recovery](DEPLOYMENT.md#backups-restore-and-upgrades).
