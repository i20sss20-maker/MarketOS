# Live forecast evaluation acceptance

This manual production check invokes **one real bounded sweep** through the deployed
`/api/internal/forecasts/evaluate` endpoint.

It can consume market-data provider quota for pending forecasts. For that reason the workflow
requires both exact acknowledgements:

- `RUN ONE MARKETOS EVALUATION`
- `I UNDERSTAND EVALUATION CONSUMES MARKET DATA`

The workflow runs in the `azure-production` environment and reads the existing
`MARKETOS_WORKER_SECRET` secret. The secret is sent only in the request header and is never
written to the evidence artifact or logs.

The check first sends an invalid worker credential and requires HTTP 401. It then sends the
real worker credential and requires:

- HTTP 200 with `ok=true` and `enabled=true`;
- no redirect, so the worker credential cannot be forwarded to another origin;
- successful acquisition of the evaluator lease;
- at most three checked reports, preserving the production batch cap;
- every checked report accounted for as resolved, pending, or failed.

If the scheduled timer completed a batch inside the evaluator's 15-minute minimum interval,
lease acquisition can legitimately fail. In that case this acceptance fails intentionally:
wait for the interval and run it again rather than weakening the production lease.

A sweep with zero checked forecasts is still useful evidence that the hosted endpoint,
worker credential, feature flag, Cosmos checkpoint/lease path and bounded sweep orchestration
are operational. It is **not** evidence of predictive accuracy. A sweep with pending/failed
forecasts is also not converted into a success result.

The artifact contains only the production origin, timestamp, invalid-credential rejection
boolean, enabled/lease state and aggregate counts. It contains no provider key, worker secret,
Cosmos credential, user ID, symbol, price or forecast payload.
