# Strict browser mode and server history

This is a code implementation, not confirmation of a live Azure deployment or data entitlement.

Build the web application with `VITE_MARKETOS_REQUIRE_REAL_DATA=true`; enable the corresponding
server mode and server journal configuration documented in `production-foundation.md`.
No client environment variable contains a secret.

## Implemented

- Strict initial charts contain no generated candles. All four chart panes, watchlist,
  screener, events, news, and correlation failure paths leave unavailable data empty rather
  than generating Demo data. Missing batch symbols remain missing, not fabricated.
- API responses are also checked in the browser. A Demo backend accidentally connected to
  a strict browser is rejected. Quotes preserve the provider timestamp; valid timestamps
  do not prove real-time entitlement. Exchange delays and source-age disclosure still need
  a provider-coverage acceptance test.
- A stale quote response from a previously selected instrument cannot replace the current quote.
  The main chart clears on symbol/timeframe changes and ignores cancelled results. Additional
  chart panes clear in strict mode and also ignore cancelled results.
- Strict Analyst responses require the server journal receipt and return the archived report.
- The Performance tab in strict mode now opens an authenticated server history, with original
  report details, pagination, failure/retry/sign-in states, and request cancellation. It never
  uses localStorage or browser history as a fallback. Duplicate report IDs must have identical
  hashes. A hash is an identifier, not an independently signed attestation of market accuracy.
- Browser forecast performance history is excluded from loading, saving and preference sync
  in strict mode. The forecast view does not create local outcomes in this mode.
- Production Radar uses session-only memory, never previous Demo localStorage. The cache resets
  when the main app receives a different authenticated identity. Hosted authentication and all
  account-transition cases still require browser acceptance tests before release.
- The existing Correlation panel's early return was moved below its final hook to keep hook
  order consistent when opening and closing the panel.

## Not done / not claimed

Server outcome evaluation is still pending: this UI explicitly shows `pending`, never a
fabricated success rate. Neither the Cosmos account nor deployment token nor data subscription
is provisioned by these changes. Rate limits, operational recovery, actual provider freshness,
server evaluation using finalized source bars, and hosted authentication/ownership remain
release gates. Preview builds retain deliberately labelled demo behavior.

## Tests

`pnpm smoke:production-client` runs 22 scenarios against controlled responses: source rejection,
no fabricated fallback, validation of quotes/candles/news, receipt requirement, pagination,
immutable history deduplication, authentication failures, cache separation and local-journal
exclusion. They are not live-service or interactive browser tests. Full TypeScript/build and
existing CI must pass. `production-client-verify.yml` builds strict mode and records a
secret-presence-only deployment access check; no credential values are printed or exported.

References:
- https://vite.dev/guide/env-and-mode
- https://learn.microsoft.com/en-us/azure/static-web-apps/user-information
