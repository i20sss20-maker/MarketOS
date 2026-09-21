# Hosted production boundary acceptance

This workflow is a **post-deployment boundary check**, not a market-accuracy test and not
proof that authenticated Cosmos writes or paid provider entitlements work.

Run **Hosted Production Boundary Acceptance** manually in GitHub Actions and provide only
the HTTPS MarketOS production origin.

The workflow performs no authenticated provider request. It verifies:

- `/api/health` identifies the deployment as production, reports a configured provider,
  persistent user storage, and configured forecast quota;
- `/api/production/readiness` has no configuration blockers while still refusing to claim
  full production acceptance;
- anonymous quote, candle, search, overview, event and company-feed requests return
  `AUTH_REQUIRED` before provider work can begin;
- a forged client-supplied `x-ms-client-principal` header is stripped/rejected by the hosted
  Static Web Apps boundary. This probe intentionally omits the search query, so even a broken
  boundary returns before any market-data provider request can occur;
- the legacy Demo snapshot endpoint is disabled;
- anonymous server forecast history is blocked.

The workflow writes non-secret response/status evidence to a short-lived artifact.

It deliberately does **not** test:

- Microsoft/GitHub interactive sign-in;
- cross-user owner isolation with two real hosted accounts;
- live provider entitlement, delay, exchange session, or commercial display rights;
- a real Cosmos write/read/restart cycle;
- server evaluator scheduling;
- predictive accuracy;
- load, recovery, or cost ceilings.

Those remain separate hosted acceptance gates. This workflow is manual-only and contains no
market-data, Cosmos, or internal evaluator secret.
