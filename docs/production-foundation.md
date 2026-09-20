# MarketOS: real-data and persistent journal foundation

Status: implementation slice, **not a production launch**. This change adds a guarded
API and server-owned forecast snapshots; it does not activate Azure or a data subscription.
All resources must remain within MarketOS, separate from all other projects.

## What changes

- `MARKETOS_REQUIRE_REAL_DATA=true`, or `MARKETOS_ENVIRONMENT=production` /
  `azure-production`, makes the market-data gateway reject Demo/misconfigured providers.
  Invalid quotes, unknown/future quote timestamps, duplicate/disordered/invalid OHLC bars,
  and synthetic events/news cannot be silently substituted in that mode.
- Unknown Twelve Data quote timestamps now remain `0` (unknown), never retrieval time.
  The production guard rejects them. A valid timestamp is not proof of real-time entitlement;
  delayed and end-of-day data still need explicit UI disclosure and licensing review.
- Real-data forecast generation requires an authenticated SWA user, a verified quote,
  two successful timeframes, and the calibration timeframe. Missing real news/events may be
  omitted; synthetic ones are not used. Forecast probabilities remain experimental.
- `POST /api/user/forecasts` accepts **only** `symbol` and optional `requestId`.
  It generates the forecast server-side and stores the complete original report before
  returning success. The browser cannot submit a price, probability, result or owner ID.
- Reuse the same 16–128-character request ID to retry the same instrument: the original
  saved forecast is returned. Different instruments with the same ID get HTTP 409.
  Cosmos `create` and its uniqueness constraint implement first-write-wins; there is no upsert.
  Concurrent identical requests can still do duplicate provider work before the first insert;
  distributed request coalescing and credit limits remain release blockers.
- `GET /api/user/forecasts?limit=20&cursor=...` reads only the authenticated user's partition,
  with a 1–50 page size. Owner IDs include the identity provider and are not returned.
  There is no client PUT/PATCH to overwrite the archived forecast or its result.
- The server history returns `evaluationStatus: pending`. This slice does **not** implement
  server outcome evaluation or replace the existing local performance calculations.
- `VITE_MARKETOS_REQUIRE_REAL_DATA=true` at web build time directs Analyst/Radar forecast
  requests through the authenticated server journal. Preview builds keep their existing route.
  Historical server snapshots can be read through the API; a server-history UI is still pending.

## Required configuration (never commit real values)

Set server variables in **the MarketOS** Azure resource settings:

```text
MARKETOS_ENVIRONMENT=production
MARKETOS_REQUIRE_REAL_DATA=true
MARKETOS_WEB_ORIGIN=https://<actual-marketos-host>
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=<secret from the selected data subscription>
MARKET_EVENTS_PROVIDER=twelvedata
MARKET_FEED_PROVIDER=twelvedata
USER_DATA_PROVIDER=cosmos
COSMOS_CONNECTION_STRING=<MarketOS-only secret>
COSMOS_DATABASE=marketos
COSMOS_CONTAINER=userState
FORECAST_JOURNAL_ENABLED=true
FORECAST_JOURNAL_CONTAINER=forecastJournal
```

Set `VITE_MARKETOS_REQUIRE_REAL_DATA=true` when building the web bundle. This is a public
boolean, not a secret. Provider keys and Cosmos credentials must never have a VITE_ prefix.

Provision `forecastJournal` separately with partition key `/userId`, using approved
throughput/retention settings. Do not point it at `userState`: that would interfere with
existing user-state worker queries. Runtime requests never provision resources or throughput.
The adapter verifies the container's partition-key path before use. Missing or inaccessible
storage returns an error, never an in-memory success. A single process caches the container
check; configuration changes should restart the application.

SWA must be the only ingress to the managed API. The existing `/api/user/*` rule requires
`authenticated`; the handler checks the gateway-injected principal again. The principal header
is not itself a signed authentication token. Do not deploy these handlers as a publicly
reachable standalone Function and trust an arbitrary client-supplied header. Confirm that
SWA strips/spoof-protects headers and blocks cross-user access in the actual hosted environment.

`MARKETOS_WEB_ORIGIN` must be an HTTPS origin. Explicit foreign or opaque browser origins
are rejected. An absent Origin is allowed for same-origin reads and non-browser clients;
these still require the trusted gateway principal. JSON writes only; body cap 16 KiB;
archived report cap 256 KiB. Storage/provider internals are not echoed as error messages.

## Configuration check, not a release certificate

`GET /api/production/readiness` is a secret-free configuration check. HTTP 200 means the
required settings and selected provider are present; it does NOT contact the provider,
validate a subscription, or prove database access. It deliberately keeps
`productionReady: false` and lists the outstanding acceptance checks.

Before release, complete and demonstrate:

1. Hosted sign-in and API ingress/owner isolation; HTTPS and authorization on all paid API routes.
2. Real Cosmos create/read/restart behavior, concurrency, backups, retention and user deletion.
3. Licensed provider data against known instruments, exchange calendars, delays and timestamps.
4. Remove client-side chart/overview/demo fallbacks in production. The existing application can
   still display clearly labelled Demo chart data after API failure; only the server Analyst
   path is strict in this slice. Do not describe the complete UI as live yet.
5. Server-side evaluation using finalized candles and a fixed, recorded horizon. Existing
   browser-side scoring is not a verified or tamper-resistant production track record.
6. Cross-instance quotas, rate limits, monitoring, provider-cost controls and failure recovery.

No data provider, exchange, commercial license, paid subscription or Azure resource was
activated by this change. The first market and the permitted monthly budget are not decided.

## Verification

`pnpm smoke:production-foundation` runs deterministic runtime tests with explicit test doubles
for Azure Functions, Cosmos and market data. It tests request validation, authentication
ordering, origin checks, source separation, first-write-wins and partition isolation, retries,
configuration blockers and safe failures. It does **not** claim actual Azure persistence or
live market accuracy. Existing CI still runs its original suite. The isolated validation
workflow also type-checks and builds on Node 22 without deploying.

Implementation references:
- https://learn.microsoft.com/en-us/azure/static-web-apps/user-information
- https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-javascript-create-item
- https://learn.microsoft.com/en-us/azure/cosmos-db/account-overview
