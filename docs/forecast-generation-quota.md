# Forecast generation quota — cost and abuse guard

Status: implemented server guard, not a hosted-capacity claim. This change does not activate a paid
provider, Azure resource, or subscription. It deliberately fails closed in strict real-data mode when
quota configuration or persistent entitlement storage is unavailable.

## Policy

A new server forecast request is charged against a UTC-day generation counter **after** request replay
is checked and **before** any market-provider generation begins. Replaying the same saved request ID is
free because the original archived report is returned without another provider generation.

The effective limit is the lower of:

- the active plan's existing `aiQueriesPerDay` limit; and
- the operator safety ceiling `FORECAST_DAILY_HARD_CAP` (required, integer 1–500).

This first guard treats a server forecast as one AI generation unit. It does not yet unify usage across
other AI endpoints, so it must not be described as a complete account-wide AI billing meter.

A consumed slot is not refunded if downstream provider generation, forecast construction, or final
archive storage later fails. That is intentional cost protection: a provider attempt may already have
incurred quota/cost. Idempotent request IDs prevent normal client retries from consuming another slot.

## Persistence and concurrency

Quota documents live in the existing separate `forecastJournal` Cosmos container and use the same
hashed owner partition (`/userId`). No additional Cosmos container is required by this feature.
Each UTC day has one `marketos-forecast-usage-v1` document per owner. Create conflicts and ETag
replace conflicts are retried; once the effective limit is reached, the server returns HTTP 429 without
starting forecast generation. Corrupt quota state, excessive contention, unavailable storage, or a
wrong partition key fail closed.

Persistent entitlements are also mandatory. In strict real-data mode, `ENTITLEMENT_DATA_PROVIDER`
must resolve to Cosmos; a process-memory entitlement store cannot authorize paid provider work.
Default users still resolve to the Free plan when no entitlement document exists.

## Configuration

Required on the MarketOS API before real forecast generation:

```text
FORECAST_DAILY_HARD_CAP=<1..500>
ENTITLEMENT_DATA_PROVIDER=cosmos
FORECAST_JOURNAL_ENABLED=true
FORECAST_JOURNAL_CONTAINER=forecastJournal
USER_DATA_PROVIDER=cosmos
COSMOS_CONNECTION_STRING=<MarketOS-only secret>
COSMOS_DATABASE=marketos
```

`GET /api/health` exposes only whether quota configuration is present, the non-secret hard cap,
entitlement storage mode and UTC window. `GET /api/production/readiness` includes quota configuration
as a blocker but still reports `productionReady: false` until hosted acceptance is completed.

## Validation and remaining acceptance

`pnpm smoke:forecast-quota` covers hard-cap validation, plan/operator limit intersection, UTC rollover,
wrong/malformed storage, plan reductions and concurrent ETag consumption. Foundation route tests also
verify that replays do not consume quota, a denied quota never starts generation, memory entitlements
fail closed, and storage errors do not leak internals.

Still required before public launch: live Cosmos concurrency/load tests, provider-account cost limits,
Azure Monitor/Application Insights dashboards and alerts, user-visible usage UX, account-wide usage
policy across non-forecast AI routes, abuse controls beyond daily generation, and a reviewed commercial
market-data entitlement. Passing deterministic tests is not a live capacity or cost guarantee.
