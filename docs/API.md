# HTTP API

Treg Lens exposes a small JSON API for its own workspace and for scripts running against your instance. It is an application API, not a general Treg proxy. Provider URLs and endpoint IDs are fixed server-side.

Start with the [README](../README.md) for setup, [architecture](./ARCHITECTURE.md) for implementation boundaries, and [testing](./TESTING.md) for the fixture-backed API suite. Contracts below come from the checked-in route handlers and types; Treg catalog prices remain dynamic.

## Routes at a glance

| Method | Path | Credential required | Provider work |
| --- | --- | --- | --- |
| `GET` | `/api/health` | None | Selected database readiness only, no Treg request |
| `GET`, `PUT` | `/api/workspace` | Verified session cookie | Durable snapshot read or revision-checked save |
| `POST` | `/api/workspace/uploads` | Verified session cookie | Begin owner-bound snapshot upload |
| `PUT` | `/api/workspace/uploads/:id/chunks/:index` | Verified session cookie | Stage a binary chunk, no provider work |
| `POST` | `/api/workspace/uploads/:id/commit` | Verified session cookie | Validate and atomically save staged content |
| `DELETE` | `/api/workspace/uploads/:id` | Verified session cookie | Abort uncommitted upload |
| `GET` | `/api/cron/monitor` | Independent CRON_SECRET bearer | One hosted due audit when cron is installed |
| `GET`, `PUT`, `DELETE` | `/api/monitor` | Verified session cookie | Read/configure/pause scheduling; no immediate paid run |
| `GET` | `/api/monitor/results` | Verified session cookie | Download retained scheduled results after storage overflow |
| `POST` | `/api/internal/monitor/tick` | Internal runner bearer | One due scheduled audit, if any |
| `GET` | `/api/auth/session` | Optional session cookie | Free key metadata validation when a session exists |
| `POST` | `/api/auth/session` | `token` in JSON | Free key metadata validation; creates session |
| `DELETE` | `/api/auth/session` | None | Clears browser session cookie |
| `GET` | `/api/aeo/status` | Optional session cookie | Free key metadata validation when a session exists |
| `POST` | `/api/aeo/estimate` | None for ordinary estimates; verified owner for saved-plan follow-ups | Free catalog reads only |
| `POST` | `/api/aeo/run` | Session or explicit `token` | Paid answer-engine calls |
| `POST` | `/api/aeo/onboard` | None for `estimateOnly: true`; otherwise session or `token` | Catalog estimate or one paid website-research request |
| `POST` | `/api/aeo/discover` | None for `estimateOnly: true`; otherwise session or `token` | Catalog reads or paid keyword/PAA calls |
| `POST` | `/api/aeo/source` | None for `estimateOnly: true`; otherwise session or `token` | Catalog reads or paid Moz/Exa calls |

Next.js supplies `OPTIONS` with an `Allow` header and `HEAD` for GET-enabled routes. Other unsupported methods return `405`; framework-generated responses need not use the JSON error format below. There are no general-purpose proxy or team-membership endpoints. Full-backup import is validated in the browser, then saved through the revision-checked workspace route; it does not enable monitoring.

## Request and authentication rules

Research/authentication JSON requests and monitor PUT use `Content-Type: application/json` and fit within **16,384 bytes**, including when sent without `Content-Length`. Workspace PUT allows **8 MiB of snapshot data plus 4 KiB of JSON-envelope overhead**, with a bounded streamed body reader. Above 3 MiB the browser uses bounded chunk uploads. Manifests allow 4 KiB JSON and chunks 1 MiB application/octet-stream. Internal ticks, upload commit, and DELETE routes need no JSON body. Invalid JSON or invalid fields return `400`; oversized bodies return `413`; other content types return `415`. Unknown fields are ignored by the current validators.

Public mutations inspect `Origin` when supplied; the workspace route also checks it on GET. The internal runner instead requires its bearer credential. A valid HTTP(S) origin must have the same host and port as the request's `Host` header; the check does not compare the incoming request scheme. Requests without `Origin`, such as server-side scripts, are accepted. These routes do not configure cross-origin browser access.

### Browser session

The login form sends the key as a normal JSON string:

```js
// apiKey is the value supplied by the user; do not hard-code or log it.
const response = await fetch("/api/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: apiKey }),
});
const session = await response.json();
```

The password field masks the display. HTTPS protects the request in transit; the application server receives the plaintext key and validates it with Treg. Successful sign-in seals it into an encrypted cookie named `treg_lens_session` using `SESSION_SECRET`. Cookie properties are `HttpOnly`, `SameSite=Lax`, path `/`, and a fixed **12-hour** lifetime. `Secure` is enabled in production, on HTTPS requests, or when `x-forwarded-proto` is `https`. Serve production over HTTPS.

Protected requests decrypt the cookie and revalidate the key through Treg's free `GET /catalog/endpoints/cloro.ai-search.chatgpt.scrape/access` metadata endpoint. A valid zero-balance key can sign in. Invalid or revoked keys produce an anonymous session; an unavailable validation service fails closed with `503`. Reads do not extend the cookie lifetime.

`SESSION_SECRET` must be a stable private value of at least 32 characters. Keep it identical across instances of one deployment. Rotating it invalidates existing cookies, changes server workspace namespaces, and prevents old retained monitoring keys from being decrypted. See [authentication and ownership](./ARCHITECTURE.md#authentication-and-ownership).

### Direct API clients

Paid request bodies accept an optional `token`. A non-empty explicit token takes precedence over the cookie and is validated independently. An invalid explicit key does not fall back to a valid cookie or an operator credential. Empty tokens are treated as omitted. Effective paid-key validation requires a trimmed, printable ASCII key of at most 2,048 characters without internal whitespace. Sign-in may also reject an unusually long key whose sealed cookie would exceed its size budget.

Public user routes do not read Treg client credentials from `Authorization`, `X-Treg-Token`, URL query parameters, or an `org` body field. The internal monitoring tick separately uses purpose-derived bearer authentication. `X-Treg-Token` is the header Lens sends upstream to Treg. Public paid routes never inherit an operator's `TREG_TOKEN` or `TREG_ORG`. A script using an explicit token does not need to create a browser session.

## Session and status

### GET `/api/auth/session`

Returns `200` with either:

```json
{ "authenticated": false, "workspaceId": null }
```

or an opaque workspace namespace:

```json
{ "authenticated": true, "workspaceId": "treg_0123456789abcdef01234567" }
```

The namespace derives from the key and deployment secret. It is not a Treg team identifier. The response never contains the key. It uses `Cache-Control: private, no-store`.

### POST `/api/auth/session`

Body: `{ "token": "YOUR_TREG_TEAM_KEY" }`. Leading and trailing whitespace is trimmed. On success, returns the authenticated response above and sets the cookie. Malformed keys return `400`; invalid or revoked keys return `401`; a key unable to select a team returns `400`; missing server secret or unavailable/unreadable upstream validation returns `503`. The sign-in attempt guard can return `429`.

### DELETE `/api/auth/session`

No body is needed. Returns the anonymous response above and expires the cookie. It does not delete server workspace history, pause an enabled schedule, remove its retained monitoring credential, or revoke the Treg key. This stateless logout cannot invalidate another copy of an already issued cookie; revoke the underlying Treg key or rotate the deployment secret when revocation is required.

### GET `/api/aeo/status`

Returns `200` with `{ "configured": true }` or `{ "configured": false }`, using `Cache-Control: private, no-store`. This checks the browser session, not operator environment variables or a future explicit-token request. Treg validation unavailability can return `503`.

## Health

### GET `/api/health`

Unauthenticated storage probe with `Cache-Control: no-store`. Returns `200 {"status":"ok","storage":"ready"}` when the selected database responds, otherwise `503 {"status":"unavailable","storage":"unavailable"}`. No Treg call or tenant information is returned. This does not prove provider availability, funding, free disk space, or an active worker.

## Durable workspace

### GET `/api/workspace`

Requires a verified session; callers do not supply a workspace ID. Returns streamed private/no-store JSON:

```ts
type WorkspaceEnvelope = {
  snapshot: WorkspaceSnapshot | null;
  revision: number; // 0 for an uninitialized workspace
  updatedAt: string | null;
};
type WorkspaceSnapshot = {
  project: {
    brand: string; domain: string; competitors: string[];
    description?: string; // up to 1,200 characters
    audience?: string; // up to 600 characters
    market?: { country: "US"; language: "en" }; // only supported measurement market
    competitorDetails?: Array<{ name: string; domain?: string; reason?: string; sourceUrl?: string }>;
    buyerQuestions?: Array<{
      text: string;
      intent: "category" | "comparison" | "use-case" | "purchase" | "branded" | "other";
      provenance: "generated" | "manual" | "discovered";
      reason?: string;
    }>;
    researchReceipts?: OnboardingResearch[];
    onboardingCompletedAt?: string;
  };
  prompts: string[];
  promptRecords?: PromptRecord[];
  discoveryResearch?: SavedDiscovery[];
  pagePlans?: PagePlan[];
  reports?: EvidenceReport[];
  runs: SavedRun[];
  done: string[];
  sourceResearch: Record<string, SourceResearch>;
};
```

The verified key and stable deployment secret determine the namespace. The same key reaches the same instance's saved workspace across browsers. An unrelated key cannot select or read it by changing request fields.

`competitors` and `prompts` remain compatible tracked values for existing clients and backups. In the UI, `prompts` contains active manual audit defaults; an individual execution selects at most eight. Optional `competitorDetails` has at most eight entries, matched by competitor name; removed names lose their metadata. Names are at most 100 characters, domains 253, and reasons 240. `buyerQuestions` holds up to sixteen reviewed ideas, including unselected questions; text is at most 500 characters and reasons 240. Missing metadata for a newly selected prompt is labeled manual with `other` intent.

Optional `promptRecords` holds at most 512 records. Its contract is:

```ts
type PromptRecord = {
  id: string; // unique, 1–100 characters
  text: string; // unique exact trimmed wording, 1–500 characters
  intent: "category" | "comparison" | "use-case" | "purchase" | "branded" | "other";
  kind: "neutral" | "branded";
  provenance: "generated" | "manual" | "discovered";
  topic?: string; // at most 100 characters
  paused: boolean;
  archived: boolean;
  evidence?: { discoveryId: string; candidateId: string }; // each 1–200 characters
};
```

Editing wording creates/restores a separate identity and retains the original history. Neutral/branded classification is reviewable; classification changes affect future scopes, not captured runs. Pause/archive do not alter a separately approved monitoring schedule. Older snapshots can omit this inventory; the UI derives compatible records from original wording without inventing missing historical provider settings.

Optional `discoveryResearch` holds at most 20 validated `SavedDiscovery` receipts, defined under [prompt discovery](#prompt-discovery). Original candidates, receipt selection IDs, estimates, errors, locale, call IDs and known/unknown/reserved costs survive full-backup export/import. A prompt's `evidence` links its discovery/candidate IDs; retaining the original candidate is what preserves seed/provider/origin/volume provenance. Old receipts may be evicted by the bounded newest-20 policy, so export a full backup before pruning/researching beyond the retained history.

`SavedRun` can optionally include `competitorDetails` and `measurement`. Competitor details are frozen name/domain pairs for the selected competitor names, not a reference to current project settings. `measurement` has this bounded contract:

```ts
type MeasurementScope = {
  version: 1;
  market: { country: "US"; language: "en" };
  brand: { name: string; domain: string };
  prompts: Array<{ id: string; text: string; kind: "neutral" | "branded" }>;
  collectors: Array<{
    engine: "chatgpt" | "perplexity" | "gemini" | "google";
    sourceKind: "web-interface" | "model-api";
    provider: string;
    model: string;
  }>;
};
```

A scope contains 1–8 question identities and 1–4 distinct engines and must match its run's declared identity/configuration. Provider/model labels are at most 100 characters. Collector defaults carry an explicit unreported model-version label; they do not claim a pinned underlying model. Legacy runs may omit both fields and remain readable. Their missing competitor domains stay unknown and their missing collector settings prevent progress comparisons. Comparable trends require matching recorded scope and at least 90% answered/requested coverage; use the [measurement rules](ARCHITECTURE.md#analytics-and-evidence) when interpreting them. Original raw observations remain inspectable.

Optional `researchReceipts` retains the last five original onboarding outcomes independently of current profile edits or question selections. Each retains original URL, sources, questions, call IDs, completion time and known/unknown billing. New receipts also retain `input` with the normalized submitted URL, optional reviewed audience and fixed market, separate from any inferred audience suggestion. Older receipts may omit it. Applying the same receipt twice does not duplicate it. Profile identity changes retain these receipts as workspace evidence, while brand-specific audience, competitor and question context is inherited only for the same brand/domain. Explicit workspace replacement or backup import still replaces the supplied snapshot; this history is not an immutable billing ledger.

All new fields are optional, so older snapshots remain valid without migration. Unsupported markets or malformed/oversized metadata are rejected. Nested unknown fields are excluded from saved data. A competitor `sourceUrl` is retained only when it matches a safe citation in the retained research receipt and the competitor's domain; without it, the suggestion is unverified. Backups are user-supplied evidence, not independently authenticated provider records.

The Settings rerun flow is an authenticated UI mode at `/app?setup=review`; it introduces no reset endpoint or authentication bypass. It uses the same research and workspace routes. Its browser draft holds the starting revision separately from the active snapshot. Saving refuses a changed revision and retains existing prompts, audits, page plans, reports, completed moves and research while applying the reviewed profile (including strategy context for the same brand) and adding selected questions. It does not write monitoring state. `PUT /api/workspace` itself retains its existing full-snapshot/CAS contract; third-party API clients remain responsible for retaining the fields they want to keep.

### Page plans and report snapshots

Optional `project.strategy` contains `goal` (600 characters), `timeframe` (120), `differentiators` (1,200), `writingPreferences` (1,200), and up to 12 `keyPages` (safe owned-domain/subdomain HTTP(S) URLs, 2,048 characters each). Unknown properties are removed. Context is optional and never expands the mandatory onboarding flow.

`pagePlans` contains at most 128 records with the [PagePlan contract](../src/lib/page-plans.ts): `version:1`, unique `id` (200 characters), frozen `brand` and `question` identity/wording, `target` (`existing`, `proposed`, `later`), `rationale` (2,000), `brief` (12,000), `status` (`planned`, `in-progress`, `published`, `measured`, `dismissed`), optional `publishedAt`, `baselineRunId`, optional `baselineMeasurement` and `followupRunId`, and creation/update timestamps. Existing targets require a safe URL owned by the plan's brand; proposed targets may omit it; later decisions have no URL. A measured plan requires a selected follow-up. Unknown metadata is excluded. Legacy plans can lack recorded scope and remain inspectable; the API refuses to invent a comparable recheck.

`reports` contains at most 10 [EvidenceReport records](../src/lib/evidence-reports.ts), each at most 512 KiB of JSON: `version:1`, unique `id`, `title` (160), `createdAt`, cleaned `project`, ordered `runIds` and exact cleaned `runs` (1–5), selected `plans` (0–8), `notes` (4,000), and boolean `demo`. All included runs/plans must match the report's brand. Original answers, errors, scope, citations and billing uncertainty are preserved; unknown fields and unrelated research receipts are excluded. Exact evidence that exceeds the bound is rejected, not silently shortened.

An existing report ID is immutable across normal workspace saves and chunked commits: changed contents return `400`. Append a new ID to save another version. Explicit removal is allowed and does not delete source audits. Snapshot immutability is an application rule, not proof that a user-imported backup came from an authenticated provider. Full backups retain both optional arrays; filtered reports and agent exports cannot replace a full workspace.

### PUT `/api/workspace`

Optional `continuity` holds `{ version: 1, dismissed: [{ brand: { name, domain }, stepId, dismissedAt }] }`. At most 128 entries are accepted; name/domain/step ID/date limits are 200/300/600/40 characters respectively. Dates must parse, IDs must be nonempty, and duplicate brand+step identities are rejected. Brand identity uses trimmed lowercase name and normalized hostname. Unknown properties are stripped. Older snapshots without this field remain valid; full backups retain it. Preferences use the same revision compare-and-swap as other workspace changes and do not mutate evidence, billing or monitoring. The UI waits for acknowledgement before hiding/restoring a suggestion.

Next steps and the 12-entry recent-work digest are pure client projections of saved records, not new endpoints or a durable event stream. The [portable contracts](PORTABLE-CONTRACTS.md) document native mapping and shared behavior fixtures; they do not add a native import endpoint.

Body: `{ "snapshot": { ... }, "revision": 0 }`, using the revision most recently loaded. The route validates the snapshot and writes only known fields, excluding credential fields. Audit IDs must be nonempty and unique. Snapshot data is limited to 8 MiB; the entire JSON body may use another 4 KiB for its envelope, including without Content-Length. Revision must be a nonnegative safe integer.

A successful transaction returns the envelope with an incremented revision. A stale revision returns **409** with `{ error, snapshot, revision, updatedAt }` containing the current saved state. Preserve/export unsaved edits and explicitly refresh before choosing a replacement. Do not simply retry an old snapshot with the new revision. Invalid data is 400, oversized HTTP input is 413, and unavailable storage is 503.

The separate full-backup format is `{ kind: "treg-lens-workspace-backup", version: 1, demo: false, exportedAt, snapshot }`. The UI validates the same 8 MiB workspace-data limit, allows a small wrapper overhead, and asks for replacement confirmation. Filtered reports, illustrative demo exports, credential fields, duplicate IDs, or invalid research are rejected. Import does not restore session or monitor authorization. A monitoring-recovery file uses the separate merge flow below.

### Large workspace upload protocol

Use this protocol for large snapshots; the browser chooses it above 3 MiB. All routes require the verified owner session, same-origin checks, and private/no-store responses. Upload IDs never grant another key access.

1. `POST /api/workspace/uploads` with a JSON manifest `{ id, revision, totalBytes, sha256 }`: client-generated UUID, expected nonnegative revision, 1 byte–8 MiB of UTF-8 snapshot data, and lowercase SHA-256 hex digest. The manifest body is limited to 4 KiB. Returns `{ id, expiresAt, chunkBytes: 1048576 }`.
2. `PUT /api/workspace/uploads/:id/chunks/:index` with `Content-Type: application/octet-stream`. Index is zero-based; each chunk must have its exact declared size, at most 1 MiB. Repeating identical bytes is safe; changing an uploaded chunk is refused. Returns `{ index, received: true }`.
3. `POST /api/workspace/uploads/:id/commit` with no required body. The server verifies complete ordering, length, UTF-8, checksum, snapshot schema, and the original revision before one atomic save. It returns the normal streamed workspace envelope. A conflict is 409, with no blind overwrite. Replaying a committed upload returns its original saved snapshot/revision rather than making a duplicate write or returning newer unrelated state.
4. `DELETE /api/workspace/uploads/:id` aborts an uncommitted draft and returns `{ aborted: true }`.

Drafts expire after 15 minutes. Creating a new manifest replaces older pending drafts for that owner, allowing recovery after a closed tab. Staged chunks are AES-256-GCM encrypted with a separate secret-derivation purpose and owner/upload/index associated data; retention is bounded to two completed uploads plus one pending upload per owner. Expired or unavailable uploads return 404. Final workspace content remains ordinary database data; this staging protection is not whole-database encryption. The in-tab client preserves its manifest for safe retry after a lost commit acknowledgment. Neither upload retries nor save recovery repeats paid research.

Large workspace/recovery JSON responses stream so the 8 MiB snapshot contract fits hosted response transport. For a hosted API client, use chunks rather than sending a body beyond the platform's independent payload cap.

## Scheduled monitoring

### GET `/api/monitor`

Requires a verified session. Returns private/no-store state without plaintext or encrypted credentials:

```ts
type MonitorState = {
  schedule: null | {
    enabled: boolean;
    intervalHours: 24 | 168;
    hourUtc: number;
    perRunBudgetUsd: number;
    monthlyBudgetUsd: number;
    config: { brand: string; domain: string; competitors: string[]; prompts: string[]; engines: string[] };
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastStatus: string;
    lastError: string | null;
    spentMonthUsd: number; // known charges + outstanding reservations, UTC month
    recoveryAudit?: { completedAt: string; url: string };
  };
  worker: { lastSeenAt: string | null; healthy: boolean };
};
```

`healthy` means the worker heartbeat is newer than ten minutes. It does not guarantee provider availability or an exact execution time. `recoveryAudit` identifies retained completed evidence that could not fit into the bounded workspace.

### PUT `/api/monitor`

```json
{
  "enabled": true,
  "intervalHours": 24,
  "hourUtc": 9,
  "perRunBudgetUsd": 0.1,
  "monthlyBudgetUsd": 3,
  "config": {
    "brand": "Your Brand", "domain": "example.com", "competitors": [],
    "prompts": ["Which tools fit this category?"], "engines": ["chatgpt"]
  }
}
```

Requires a verified session and same-origin request. `enabled` is a boolean, interval is 24 or 168, and UTC hour is an integer from 0 through 23. Per-audit budget is $0.001–$1; monthly budget is at least that per-audit ceiling and at most $1,000. Config follows audit validation below: 1–8 prompts, 1–4 supported engines, bounded brand/domain/competitors. Client credential fields are not a way to change the retained key; the signed-in key owns the schedule.

Enabling explicitly authorizes encrypted retention of that key and future paid runs, including after logout or browser close. It sets the first run to the next selected UTC hour. A separate worker is required. A schedule already running cannot be edited through PUT; it returns 409. Setting `enabled:false` pauses and removes the retained credential. PUT returns updated MonitorState and does not immediately execute provider work.

### DELETE `/api/monitor`

Pauses future work, removes the retained credential, clears nextRunAt, and returns state. It does not erase the spending ledger or cancel a provider call already in flight. Logout is a separate action and does not pause the monitor.

### GET `/api/monitor/results`

Verified-session download of `{ version: 1, kind: "monitoring-recovery", runs: SavedRun[] }`. These are paid results retained in the job journal when workspace append failed or a completed journaled run was interrupted before append. The response is a private/no-store JSON attachment named `treg-lens-recovered-audits.json`. Downloading does not rerun the audit or resume monitoring. In **Backup and restore**, this file previews a merge of unique audit IDs into the current workspace; existing audits and settings are preserved. If storage is full, first download a full-workspace backup, delete reviewed older audits, let the deletion save, and explicitly confirm the recovery merge. It does not alter the spending ledger.

### POST `/api/internal/monitor/tick`

Internal worker route, not a user integration endpoint. It requires the purpose-derived runner bearer credential generated by `scripts/monitor.mjs`; an ordinary Treg key or session cookie receives 401. No request body is required. A tick claims at most one due schedule and returns `{ processed: false }` or `{ processed: true, status: "complete" | "paused" }`.

A ten-minute shared database lease prevents overlapping claims. Before paid work, the worker revalidates its encrypted key, reads current catalog prices, and atomically reserves the full ceiling in the job's UTC calendar month. Execution uses that exact quote, per-call caps, and stable job-based idempotency. Final known charges replace the reservation; unknown final charges retain it. Partial/ambiguous failures, interrupted jobs, budget exhaustion, or a storage failure pause monitoring. A stale paid job is not automatically resubmitted. An old database restore is not a billing rollback; use the [documented restore procedure](DEPLOYMENT.md#backups-restore-and-upgrades).

### GET `/api/cron/monitor`

Hosted counterpart to the local POST tick. Requires `Authorization: Bearer <CRON_SECRET>` with an independently configured secret of at least 32 characters; missing/short configuration and ordinary sessions/Treg keys fail closed with 401. The route calls the same monitor domain logic and returns its processed/status envelope. It never accepts a user-controlled schedule or credential in the request.

`vercel.ts` installs its minutely production cron only when `TREG_VERCEL_MONITORING=1`; the Pro configuration gives this handler 360 seconds, below the shared ten-minute lease. Hosted forks omit cron by default for Hobby compatibility. Enabling a user schedule does not install a runner. Preview deployments do not run native cron. All existing budget, journal, uncertainty, and pause rules apply.

## Audit estimate and execution

Both audit endpoints accept this body; `competitors` defaults to `[]`, and `token` is optional:

```json
{
  "brand": "Your Brand",
  "domain": "example.com",
  "competitors": ["Another Brand"],
  "prompts": ["Which tools are useful for this category?"],
  "engines": ["chatgpt", "perplexity"]
}
```

| Field | Validation |
| --- | --- |
| `brand` | Required trimmed string, 1–100 characters |
| `domain` | Required valid HTTP(S) website or hostname; at most 300 input characters; credentials forbidden; hostname must contain a dot |
| `competitors` | Optional array of at most 8 names, each 1–100 trimmed characters |
| `prompts` | Required array of 1–8 strings, each 1–500 trimmed characters |
| `engines` | Required array of 1–4 IDs: `chatgpt`, `perplexity`, `gemini`, `google` |
| `token` | Optional direct credential; see authentication above |
| `maxCostUsd` | Optional positive finite caller-approved estimate ceiling, at most $1 |
| `followupPlanId` / `followupPlanUpdatedAt` | Optional pair: owned saved plan ID (1–200 characters) and its current parseable timestamp (at most 40 characters); both required together |
| `market` | Optional exact `{ "country": "US", "language": "en" }`; unsupported values are rejected |

The domain becomes a lowercase hostname without `www.`, port, path, or scheme. Prompts, engines, and competitor names are deduplicated; the user's own brand is removed from competitors case-insensitively. Input array limits apply before deduplication. The domain is used for citation matching, not fetched by this endpoint.

### POST `/api/aeo/estimate`

Ordinary estimates need no authentication and make no paid provider calls. A request with `followupPlanId` requires a validated session or explicit key to read that owner’s saved plan; a signed-in session owns the plan even when an alternate paying key is supplied. Returns `200` with:

```ts
type CostEstimate = {
  currency: "USD";
  totalCostUsd: number;
  callCount: number; // unique prompts × unique engines
  byEngine: Array<{
    engine: "chatgpt" | "perplexity" | "gemini" | "google";
    endpointId: string;
    calls: number;
    costPerCallUsd: number;
    subtotalUsd: number;
  }>;
  note: string;
  pricedAt: string; // ISO timestamp
};
```

Each selected engine's catalog price must be finite, positive, and at most `$0.10`. A total reservation estimate exceeding **$1** is rejected with `400`. Unavailable or unverified pricing returns `503`. Prices are fetched with a 15-second timeout.

A free estimate can be inspected without a key:

```bash
curl http://localhost:3000/api/aeo/estimate \
  --header 'Content-Type: application/json' \
  --data '{"brand":"Example","domain":"example.com","prompts":["Which tools fit this category?"],"engines":["chatgpt"]}'
```

### Frozen page-plan follow-ups

Send the ordinary audit fields plus `followupPlanId` and `followupPlanUpdatedAt`, first to estimate and then, with its accepted `maxCostUsd`, to run. The server resolves only the validated owner’s saved plan and baseline. Missing plans return `404`; changed plan versions, mismatched questions/engines/competitors/brand, unavailable baselines or unsupported historical collector settings return `409` before spending. It uses the original saved question IDs/types and competitor domains, not the current editable profile.

A completed run is atomically appended. If the reviewed plan is unchanged, `followupRunId` is linked and its update timestamp advances; otherwise concurrent plan edits remain and the user can select the saved run manually. The active profile, question library, plan status and monitoring schedule are not changed by this link. Reading saved comparisons does not call providers. Deleted/legacy scope is never silently replaced with today's settings.

### POST `/api/aeo/run`

Requires a verified caller key or session. It refreshes the catalog estimate immediately before spending; the earlier UI estimate is not a price lock. The browser sends its reviewed estimate as `maxCostUsd`; a higher fresh total returns `409` before any paid answer calls. Ordinary legacy API clients may omit this field, retaining the global $1 reservation limit. Follow-up requests must include an accepted ceiling. This ceiling compares catalog reservation estimates; settled provider charges can still differ, and the response preserves actual known/unknown billing. Optional `market` makes the fixed US/English scope explicit without expanding provider locale support. Returns `200` with:

```ts
type AuditResponse = {
  results: Array<{
    id: string; // Treg call ID when available
    prompt: string;
    engine: "chatgpt" | "perplexity" | "gemini" | "google";
    answer: string;
    citations: Array<{ url: string; title: string; domain: string }>;
    mentionedBrands: string[];
    brandMentioned: boolean;
    position: number | null;
    costUsd: number;
    costKnown: boolean;
    completedAt: string;
    sourceKind: "web-interface" | "model-api";
    provider: string;
  }>;
  errors: Array<{
    prompt: string;
    engine: string;
    error: string;
    costKnown: boolean;
    costUsd?: number;
  }>;
  totalCostUsd: number;
  totalCostKnown: boolean;
  completedAt: string;
  auditId: string;
  savedWorkspaceId: string;
  saved: boolean;
  workspaceRevision?: number;
  workspaceUpdatedAt?: string | null;
  storageError?: string;
  measurement: MeasurementScope;
  competitorDetails: Array<{ name: string; domain?: string }>;
};
```

The route atomically appends the result to server history. With a session, the signed-in workspace owns the evidence even when an explicit in-memory key pays. Without a session, an explicit key owns its own derived namespace. `saved:false` preserves the paid result in the HTTP response and includes a storage warning; export/reconcile it rather than rerunning the paid request to save it. The route captures question identities and competitor domains from the matching saved project before provider execution, and returns the same `measurement`/`competitorDetails` snapshot whether or not append succeeds. Current profile edits never backfill an old audit's identity metadata.

The response can contain partial results or even zero successful answers. Inspect `errors` and cost flags after every `200`. Individual provider authorization, billing, timeout, and availability failures appear in `errors`; their upstream HTTP statuses are not necessarily the Lens response status.

One task is issued per unique prompt/engine pair, with at most 12 worker calls in flight and a 90-second timeout per provider request. The route declares a 300-second execution duration; the deployment host may enforce another limit. Locale is United States / English. ChatGPT, Gemini and Google AI Mode use web-interface answers. Perplexity uses the routed Sonar model API, excluding Cloro, with pricing from the DataForSEO child catalog entry.

`position` uses an explicit numbered recommendation rank when recognized, otherwise first-mention order among recognized brands. Brand detection is heuristic; it is not a sentiment or factuality judgment. Unsafe citation schemes and credentials are discarded, fragments and common tracking parameters removed, and citations deduplicated. See [analytics](./ARCHITECTURE.md#analytics-and-evidence).

## Brand onboarding research

### POST `/api/aeo/onboard`

```json
{
  "url": "example.com",
  "audience": "Small SaaS teams choosing their first analytics tool",
  "market": { "country": "US", "language": "en" },
  "estimateOnly": true
}
```

`url` accepts a public HTTP(S) URL or bare domain; credentials, unsafe/private hosts and nonstandard ports are refused using the source-research URL rules. Query parameters and fragments are removed; a public path is preserved. Optional `audience` is a string of at most 600 characters; the reviewed audience informs the research query and takes precedence over an inferred audience. Optional `market` must be exactly `{ "country": "US", "language": "en" }`; unsupported values return `400` before catalog or paid calls. This describes the currently supported measurement market; it does not add unsupported provider parameters or enable other locales. `estimateOnly` must be boolean when supplied. An estimate requires no key, public DNS lookup, or paid request and returns:

```ts
type OnboardingEstimate = {
  kind: "estimate";
  currency: "USD";
  totalCostUsd: number;
  note: string;
  pricedAt: string;
};
```

To research, send `{ "url": "example.com", "maxCostUsd": 0.005 }` with a verified session or explicit `token`. Use the amount returned by the current estimate, not this example. The positive maximum cannot exceed **$0.05**. The route checks public DNS and refreshes the catalog; a quote above the accepted maximum returns `409` before paid work. Only fixed per-call USD pricing for the allowlisted native `exa.web.answer` endpoint is accepted. One request uses Exa's structured `outputSchema`, with streaming and provider waterfall disabled, a per-call Treg ceiling, and a 90-second timeout. The route duration is 120 seconds.

```ts
type OnboardingResearch = {
  kind: "research";
  input?: { url: string; audience?: string; market: { country: "US"; language: "en" } };
  url: string;
  domain: string;
  brand: string;
  description: string;
  audience?: string;
  market?: { country: "US"; language: "en" };
  competitors: Array<{ name: string; domain?: string; reason?: string; sourceUrl?: string }>;
  questions: string[];
  buyerQuestions?: Array<{
    text: string;
    intent: "category" | "comparison" | "use-case" | "purchase" | "branded" | "other";
    provenance: "generated";
    reason?: string;
  }>;
  sources: Array<{ title: string; url: string }>;
  totalCostUsd: number | null;
  knownCostUsd: number;
  costKnown: boolean;
  errors: Array<{ step: "research"; error: string }>;
  callIds: string[];
  completedAt: string;
};
```

At most five competitors, eight questions, and twelve safe source links are returned. Questions are AI-generated suggestions for review, not observed queries or measured demand. Optional intent/reason metadata is matched to those exact question strings; older provider output containing only strings receives generated/other metadata. A competitor's `sourceUrl` must actually occur among returned safe citations and belong to that competitor's domain or subdomain. Missing, unsafe, unrelated or uncited source URLs are omitted; a name-only competitor remains a suggestion with no verified evidence. Citation presence establishes observed provenance, not proof of every claim or competitive relevance. Malformed or incomplete provider fields stay empty and produce inspectable errors; missing fields are never filled with example brands. Responses are bounded to 512 KiB, text fields are capped, and unsafe links/embedded HTML are filtered.

After a paid submission, upstream errors return a `200` research receipt with errors and known or unknown costs. HTTP `202` is unsettled work; its reservation is not a settled charge and `totalCostUsd` remains `null`. The route does not poll, retry, save a project, start an audit, or enable monitoring. Check Treg activity before deliberately repeating ambiguous work. The client retains the receipt in its recoverable draft, reviews suggestions, and saves the chosen profile/questions plus original receipt through the ordinary revision-checked workspace API. An onboarding description (up to 1,200 characters) and a valid `onboardingCompletedAt` timestamp are optional project fields. A returned receipt is durable server-side only after that workspace save is acknowledged.

## Prompt discovery

### POST `/api/aeo/discover`

```json
{
  "seeds": ["commercial bakery equipment", "bakery ovens for small businesses"],
  "brand": "Your Brand",
  "domain": "your-brand.com",
  "estimateOnly": true
}
```

`seeds` must contain 2–3 single-line strings, each 2–100 trimmed characters, with at least two distinct values after case-insensitive deduplication. `brand` is optional and at most 100 trimmed characters. Optional `domain` is a single-line project-context string of at most 253 characters; it is retained in the receipt, not fetched by discovery. `estimateOnly` must be a boolean when supplied and defaults to `false`. Paid requests can include `token` and `maxCostUsd` (finite, nonnegative, at most `$0.10`). The browser always submits its accepted quote as the ceiling. A higher fresh quote returns `409` before provider work. Legacy API clients may omit the ceiling, retaining the global `$0.10` bound.

The UI suggests editable seeds from reviewed nonbranded buyer questions, description or audience using saved context only. It makes no model call to create defaults and leaves missing context empty for user input. Generated onboarding questions remain distinct from observed discovery.

With `estimateOnly: true`, no authentication or paid call is required. The `200` response is:

```ts
type DiscoveryEstimate = {
  currency: "USD";
  totalCostUsd: number;
  maxCalls: number;
  breakdown: Array<{
    label: string;
    endpointId: string;
    calls: number;
    costPerCallUsd: number;
    subtotalUsd: number;
  }>;
  note: string;
  pricedAt: string;
};
```

The estimate reserves one keyword-idea call per distinct seed plus up to three People Also Ask lookups. Each verified unit price must be positive and at most `$0.05`; estimates over **$0.10** are rejected. Unavailable catalogs or an unexpected provider route fail before paid work.

Omit `estimateOnly` or set it to `false` to execute with a verified key. Keyword calls request up to 8 suggestions per seed through `treg.google.keywords.ideas`, pinned to AnyAPI with waterfall disabled. Up to three selected keyword ideas then go to `cloro.google.serp.organic` for actual People Also Ask questions. Requests use US / English parameters and a 90-second timeout per provider call. Returned candidates are deduplicated case-insensitively.

```ts
type DiscoveryResult = {
  candidates: Array<{
    id: string;
    text: string;
    kind: "question" | "keyword";
    origin: "People Also Ask" | "Keyword idea";
    seed: string;
    keyword: string;
    searchVolume: number | null;
    provider: string;
  }>;
  keywordCount: number;
  questionCount: number;
  totalCostUsd: number;
  totalCostKnown: boolean;
  reservedCostUsd: number;
  errors: Array<{ stage: "keywords" | "questions"; seed: string; error: string }>;
  completedAt: string;
  locale: { country: "US"; language: "en" };
  callIds: string[];
  acceptedEstimate?: DiscoveryEstimate;
  savedReceipt: SavedDiscovery;
  savedWorkspaceId: string;
  saved: boolean;
  storageError?: string;
};
type SavedDiscovery = {
  id: string;
  input: { brand: string; domain: string; seeds: string[] };
  estimate: DiscoveryEstimate; // fresh accepted catalog quote
  result: Omit<DiscoveryResult, "savedReceipt" | "savedWorkspaceId" | "saved" | "storageError" | "acceptedEstimate">;
  selectedCandidateIds: string[];
};
```

Questions have `searchVolume: null`; keyword volume is present only when returned by the provider. No questions are synthesized. Failed stages remain in `errors` while successful candidates survive. A pending upstream `202` adds a stage error, marks billing incomplete, and reports its known reservation in `reservedCostUsd`; Lens does not poll the call or start a replacement. The eight-prompt import selection limit belongs to the UI, not the candidate response.

Before responding, the route atomically appends the original validated receipt to the owner workspace, retaining the latest 20 without replacing concurrent profile edits. With a session, the signed-in workspace owns the receipt even when an in-memory override key pays; an API-only caller uses its own derived namespace. Duplicate receipt IDs do not append twice. Responses retain candidates, `savedReceipt` and `saved:false`/`storageError` when persistence fails; save/export this evidence rather than spending again. Imports are a separate revision-checked workspace save that adds selected questions/provenance and updates the receipt's selected candidate IDs; the UI reports success only after acknowledgment.

The browser stores a credential-free pending marker before requesting paid discovery and a returned receipt until its workspace save is acknowledged. Recovery-storage failure blocks starting new paid research. Reload or an ambiguous network failure never authorizes automatic resubmission. A receipt download is recovery evidence; the full-workspace backup remains the supported complete restore format. Opening saved receipts, changing selection or retrying persistence does not run discovery again.

## Source research

### POST `/api/aeo/source`

```json
{
  "url": "https://example.com/research",
  "brand": "Your Brand",
  "estimateOnly": true
}
```

`brand` is required, 1–100 trimmed characters. `url` is required, at most 2,048 characters, and must pass the public-URL rules below. `estimateOnly` is an optional boolean, defaulting to `false`; paid bodies can include `token`.

With `estimateOnly: true`, the route validates the body and returns current catalog pricing without authentication, DNS lookup, or paid calls:

```ts
type SourceQuote = {
  kind: "estimate";
  currency: "USD";
  totalCostUsd: number;
  steps: Array<{
    step: "metrics" | "extract";
    endpointId: string;
    provider: string;
    estimatedCostUsd: number;
  }>;
  note: string;
  pricedAt: string;
};
```

Paid research revalidates credentials and public DNS, refreshes prices, then requests exactly one Moz URL-metrics call through `treg.web.url.metrics` and one native `exa.web.contents.get` page extraction. Moz routing is pinned with waterfall disabled. Exa receives one URL with text capped at 20,000 requested characters. Catalog fetches have 12-second timeouts; provider calls have 60-second timeouts. Each verified unit price must be positive and at most `$0.05`. The route declares a 120-second duration.

```ts
type SourceResearch = {
  kind: "research";
  url: string;
  domain: string;
  brand: string;
  title: string | null;
  excerpt: string | null;
  contentCharacters: number;
  brandMentioned: boolean | null;
  brandOccurrences: number | null;
  brandExcerpts: string[];
  author: string | null;
  publishedAt: string | null;
  contactRoutes: Array<{ label: string; url: string; kind: "page" | "email" | "profile" }>;
  metrics: {
    domainAuthority: number | null;
    pageAuthority: number | null;
    spamScore: number | null;
    referringDomains: number | null;
    externalLinks: number | null;
    lastCrawled: string | null;
  };
  provenance: {
    metricsProvider: string | null;
    contentProvider: string | null;
    contentFreshness: string | null;
  };
  totalCostUsd: number | null;
  knownCostUsd: number;
  costKnown: boolean;
  callIds: string[];
  errors: Array<{ step: "metrics" | "extract"; error: string }>;
  completedAt: string;
};
```

Missing content leaves brand presence and occurrence count `null`, rather than declaring the brand absent. Missing metrics remain `null`. The parser keeps at most three brand excerpts, a 1,800-character general excerpt, and ten observed contact routes. It does not enrich people, guess email addresses, or send outreach. Content can be cached or incomplete. A `200` can contain one or two failed steps; inspect `errors` and provenance.

### Public URL and SSRF boundary

Source research accepts HTTP(S) only, without URL credentials, backslashes, control characters, unsafe encoded path characters, or nonstandard ports other than 80/443. Local/private/reserved IP literals, localhost, single-label names and designated local/internal/test suffixes are rejected. Fragments are removed. Before paid execution, every address returned by DNS must be public; unresolved names fail with `400`.

The Lens server does not directly download the submitted page: it performs DNS preflight and sends the validated URL to fixed Treg endpoints. Providers resolve and fetch the URL themselves. This check does not pin their DNS resolution or guarantee their redirect behavior; preserve the boundary when extending source lookup. Estimates validate URL syntax but do not resolve it.

## Costs, errors, and retries

All monetary values are USD. Catalog estimates are reservations, not receipts. Paid requests refresh pricing and attach `X-Treg-Route-Max-Cost` before upstream work. Final charges are read from `X-Treg-Cost-Micro` and divided by 1,000,000; arbitrary JSON cost fields are not trusted. Known charges for failed calls still contribute to totals.

| Workflow | Incomplete billing representation |
| --- | --- |
| Audit | `totalCostKnown: false`; numeric total is the sum of known charges; individual results/errors identify unknown charges with `costKnown: false` |
| Discovery | `totalCostKnown: false`; known settled sum stays in `totalCostUsd`; known pending reservations stay separately in `reservedCostUsd` |
| Source | `costKnown: false`, `totalCostUsd: null`, and known partial sum in `knownCostUsd` |

Zero and unknown are different. Reconcile ambiguous failures, pending calls and final charges in Treg activity before retrying. Manual research routes do not provide automatic retries or caller-supplied idempotency. Scheduled audit jobs have their separate durable lease/reservation/idempotency path described above. Each upstream call gets a fresh UUID idempotency key; repeating a Lens request is a new potential spend. Closing a dialog does not cancel its running audit/discovery in the current tab. Audit and discovery routes attempt a server-side append before responding, but a closed/reloaded browser can lose its response while upstream work continues. Check saved history/research and billing before deliberately retrying; neither route is an indefinitely resumable job queue. Inspect the saved flag and preserve returned evidence when append fails.

Discovery exposes a separate pending reservation and call IDs when a provider returns HTTP 202. Audit and source adapters treat HTTP 202 as still processing: its billing header is a reservation rather than a settled charge, no completed answer/page is invented, and the relevant cost-known flag is false. They do not poll for completion. A scheduled audit with an unsettled response pauses and retains its full reserved ceiling. Reconcile these calls through Treg before submitting another paid request.

Application errors use `{ "error": "human-readable message" }` and `Cache-Control: no-store` (also `private` for auth responses). Do not parse message text as a stable machine error code.

| Status | Meaning |
| --- | --- |
| `400` | Invalid fields/JSON, unsafe or unresolved source URL, team selection problem, or a workflow safety limit |
| `401` | Missing caller credential or invalid/revoked explicit key |
| `403` | Rejected `Origin` header |
| `409` | Stale workspace revision, research/audit price above the accepted estimate, or an attempt to edit a running monitoring schedule |
| `405` | Unsupported HTTP method; framework response |
| `413` | Request body exceeds its route limit: 16 KiB normally, 8 MiB plus 4 KiB envelope for workspace PUT, 4 KiB upload manifests, or 1 MiB chunks |
| `415` | Request is not JSON |
| `429` | Process-local attempt, concurrency, or cooldown guard |
| `503` | Missing sign-in configuration, unavailable validation/pricing, or an unexpected server failure |

Partial provider errors usually return `200` with an `errors` array, including upstream billing refusals. Generic failures are sanitized; upstream private account details are not exposed. A timeout is not proof that a provider call was uncharged.

## Rate guards and deployment limits

| Route | Current process-local guard |
| --- | --- |
| Session POST | 20 parsed-JSON attempts per forwarded address in a five-minute window |
| Paid audit | Nominally 3 active audits; 10-second cooldown per forwarded address |
| Paid discovery | Nominally 3 active discoveries; 10-second cooldown per forwarded address |
| Paid source | Nominally 3 active source lookups; 5-second cooldown per forwarded address |
| Paid onboarding | Nominally 3 active website researches; 10-second cooldown per forwarded address |
| Monitor tick | Durable global database lease; one due job per tick, per-workspace monitoring budgets |
| Workspace | Atomic revision compare-and-swap, 8 MiB snapshot bound and 4 KiB envelope allowance |
| Estimates, session GET/DELETE, status | No application rate guard |

Each route owns a separate in-memory counter/map. The address is the first `x-forwarded-for` value or `local`; a trusted reverse proxy must overwrite forwarded headers. No `Retry-After` or rate-limit headers are returned. Manual-route counters reset with the process and are not shared between instances. Monitoring leases/reservations and workspace revisions persist in the selected database. Source DNS preflight happens before its active counter is acquired, so its guard is best-effort rather than an atomic concurrency guarantee. Add an atomic shared limiter if your deployment needs a durable spending boundary.

## Source of truth

- [Route handlers](../src/app/api): methods, auth order, response headers, guards and durations.
- [Audit types and adapter](../src/lib/aeo.ts): request validation, engine mapping, extraction and charges.
- [Discovery types and adapter](../src/lib/discovery.ts): routing, bounded pipeline and pending reservations.
- [Source types and adapter](../src/lib/source-research.ts): public URL checks, DNS preflight and nullable evidence.
- [Session primitives](../src/lib/treg-session.ts) and [server bridge](../src/lib/treg-auth.ts): credential validation and encrypted cookies.
- [API tests](../tests/e2e/api.spec.ts), [monitor contracts](../tests/e2e/monitor-api.spec.ts), and [workspace API tests](../tests/e2e/workspace-api.spec.ts): executable examples and refusal cases without live paid provider traffic.
