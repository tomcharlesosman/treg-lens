# HTTP API

Treg Lens exposes a small JSON API for its own workspace and for scripts running against your instance. It is an application API, not a general Treg proxy. Provider URLs and endpoint IDs are fixed server-side.

Start with the [README](../README.md) for setup, [architecture](./ARCHITECTURE.md) for implementation boundaries, and [testing](./TESTING.md) for the fixture-backed API suite. Contracts below come from the checked-in route handlers and types; Treg catalog prices remain dynamic.

## Routes at a glance

| Method | Path | Credential required | Provider work |
| --- | --- | --- | --- |
| `GET` | `/api/auth/session` | Optional session cookie | Free key metadata validation when a session exists |
| `POST` | `/api/auth/session` | `token` in JSON | Free key metadata validation; creates session |
| `DELETE` | `/api/auth/session` | None | Clears browser session cookie |
| `GET` | `/api/aeo/status` | Optional session cookie | Free key metadata validation when a session exists |
| `POST` | `/api/aeo/estimate` | None | Public catalog reads only |
| `POST` | `/api/aeo/run` | Session or explicit `token` | Paid answer-engine calls |
| `POST` | `/api/aeo/discover` | None for `estimateOnly: true`; otherwise session or `token` | Catalog reads or paid keyword/PAA calls |
| `POST` | `/api/aeo/source` | None for `estimateOnly: true`; otherwise session or `token` | Catalog reads or paid Moz/Exa calls |

Next.js supplies `OPTIONS` with an `Allow` header and `HEAD` for GET-enabled routes. Other unsupported methods return `405`; framework-generated responses need not use the JSON error format below. There are no pagination, streaming, webhook, job-status, workspace-storage, or import endpoints.

## Request and authentication rules

All POST bodies must use `Content-Type: application/json` and fit within **16,384 bytes**, including when sent without `Content-Length`. Invalid JSON or invalid fields return `400`; oversized bodies return `413`; other content types return `415`. Unknown fields are ignored by the current validators.

POST routes and session DELETE inspect `Origin` when supplied. A valid HTTP(S) origin must have the same host and port as the request's `Host` header; the check does not compare the incoming request scheme. Requests without `Origin`, such as server-side scripts, are accepted. These routes do not configure cross-origin browser access.

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

`SESSION_SECRET` must be a stable private value of at least 32 characters. Keep it identical across instances of one deployment. Rotating it invalidates existing cookies and changes the browser workspace namespace. See [environment boundaries](./ARCHITECTURE.md#environment-boundaries).

### Direct API clients

Paid request bodies accept an optional `token`. A non-empty explicit token takes precedence over the cookie and is validated independently. An invalid explicit key does not fall back to a valid cookie or an operator credential. Empty tokens are treated as omitted. Effective paid-key validation requires a trimmed, printable ASCII key of at most 2,048 characters without internal whitespace. Sign-in may also reject an unusually long key whose sealed cookie would exceed its size budget.

Lens does not read client credentials from `Authorization`, `X-Treg-Token`, URL query parameters, or an `org` body field. `X-Treg-Token` is the header Lens sends upstream to Treg. Public paid routes never inherit an operator's `TREG_TOKEN` or `TREG_ORG`. A script using an explicit token does not need to create a browser session.

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

No body is needed. Returns the anonymous response above and expires the cookie. It does not delete local workspace history or revoke the Treg key. This stateless logout cannot invalidate another copy of an already issued cookie; revoke the underlying Treg key or rotate the deployment secret when revocation is required.

### GET `/api/aeo/status`

Returns `200` with `{ "configured": true }` or `{ "configured": false }`, using `Cache-Control: private, no-store`. This checks the browser session, not operator environment variables or a future explicit-token request. Treg validation unavailability can return `503`.

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

The domain becomes a lowercase hostname without `www.`, port, path, or scheme. Prompts, engines, and competitor names are deduplicated; the user's own brand is removed from competitors case-insensitively. Input array limits apply before deduplication. The domain is used for citation matching, not fetched by this endpoint.

### POST `/api/aeo/estimate`

No authentication or paid provider calls. Returns `200` with:

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

### POST `/api/aeo/run`

Requires a verified caller key or session. It refreshes the catalog estimate immediately before spending; the earlier UI estimate is not a price lock. Returns `200` with:

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
};
```

The response can contain partial results or even zero successful answers. Inspect `errors` and cost flags after every `200`. Individual provider authorization, billing, timeout, and availability failures appear in `errors`; their upstream HTTP statuses are not necessarily the Lens response status.

One task is issued per unique prompt/engine pair, with at most 12 worker calls in flight and a 90-second timeout per provider request. The route declares a 300-second execution duration; the deployment host may enforce another limit. Locale is United States / English. ChatGPT, Gemini and Google AI Mode use web-interface answers. Perplexity uses the routed Sonar model API, excluding Cloro, with pricing from the DataForSEO child catalog entry.

`position` uses an explicit numbered recommendation rank when recognized, otherwise first-mention order among recognized brands. Brand detection is heuristic; it is not a sentiment or factuality judgment. Unsafe citation schemes and credentials are discarded, fragments and common tracking parameters removed, and citations deduplicated. See [analytics](./ARCHITECTURE.md#analytics-and-evidence).

## Prompt discovery

### POST `/api/aeo/discover`

```json
{
  "seeds": ["AI agent tools", "AI search visibility"],
  "brand": "Your Brand",
  "estimateOnly": true
}
```

`seeds` must contain 2–3 single-line strings, each 2–100 trimmed characters, with at least two distinct values after case-insensitive deduplication. `brand` is optional and at most 100 trimmed characters. `estimateOnly` must be a boolean when supplied and defaults to `false`. Paid requests can include `token`.

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
};
```

Questions have `searchVolume: null`; keyword volume is present only when returned by the provider. No questions are synthesized. Failed stages remain in `errors` while successful candidates survive. A pending upstream `202` adds a stage error, marks billing incomplete, and reports its known reservation in `reservedCostUsd`; Lens does not poll the call or start a replacement. The eight-prompt import selection limit belongs to the UI, not the candidate response.

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

Zero and unknown are different. Reconcile ambiguous failures, pending calls and final charges in Treg activity before retrying. These synchronous routes do not provide automatic retries, durable jobs, or caller-supplied idempotency. Each upstream call gets a fresh UUID idempotency key; repeating a Lens request is a new potential spend. Closing a dialog does not cancel its running audit/discovery in the current tab; a page reload or browser disconnect can lose the result even if upstream work continues.

Only discovery models a separate pending reservation. Audit and source adapters expect synchronous provider responses and do not expose a pending-job state. If an upstream contract starts returning asynchronous acceptance for those tools, adapt its status and billing handling before relying on the totals as final receipts.

Application errors use `{ "error": "human-readable message" }` and `Cache-Control: no-store` (also `private` for auth responses). Do not parse message text as a stable machine error code.

| Status | Meaning |
| --- | --- |
| `400` | Invalid fields/JSON, unsafe or unresolved source URL, team selection problem, or a workflow safety limit |
| `401` | Missing caller credential or invalid/revoked explicit key |
| `403` | Rejected `Origin` header |
| `405` | Unsupported HTTP method; framework response |
| `413` | Request body exceeds 16 KiB |
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
| Estimates, session GET/DELETE, status | No application rate guard |

Each route owns a separate in-memory counter/map. The address is the first `x-forwarded-for` value or `local`; a trusted reverse proxy must overwrite forwarded headers. No `Retry-After` or rate-limit headers are returned. Counters reset with the process and are not shared between instances. Source DNS preflight happens before its active counter is acquired, so its guard is best-effort rather than an atomic concurrency guarantee. Add an atomic shared limiter if your deployment needs a durable spending boundary.

## Source of truth

- [Route handlers](../src/app/api): methods, auth order, response headers, guards and durations.
- [Audit types and adapter](../src/lib/aeo.ts): request validation, engine mapping, extraction and charges.
- [Discovery types and adapter](../src/lib/discovery.ts): routing, bounded pipeline and pending reservations.
- [Source types and adapter](../src/lib/source-research.ts): public URL checks, DNS preflight and nullable evidence.
- [Session primitives](../src/lib/treg-session.ts) and [server bridge](../src/lib/treg-auth.ts): credential validation and encrypted cookies.
- [API tests](../tests/e2e/api.spec.ts): executable examples and refusal cases without paid provider traffic.
