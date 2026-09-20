# Server forecast outcomes — controlled rollout

This change implements server evaluation and its opt-in timer. It does not provision or
activate Azure, a data subscription, Cosmos, or the timer in the user's account. Unit
responses are fixtures; predictive accuracy and hosted operations remain unverified.

## Frozen, auditable scoring policy

New calibrated real-data reports can include an immutable `evaluationPlan` created from
server data during analysis. It stores the provider, timeframe (4h or daily), lookahead
bar count, neutral-return threshold, original quote price/time, and the most recent
available anchor bar's time/open. The plan and original forecast each have a SHA-256
fingerprint. No browser-submitted plan, price, owner, success flag or result is accepted.

The policy is **quote-to-future-closed-bars-v1**: compare the original forecast's reference
quote price to the close of the Nth actual bar after the recorded anchor. This is a
prospectively frozen direction/return test, not proof that a conditional scenario was
triggered, a target was touched, a trade was profitable, or the historical analog model
is out-of-sample calibrated. It is not silently equated with the older browser score.

The evaluator requires the exact anchor and actual subsequent bars from the same provider.
A later date cannot substitute for a missing historical anchor. Session gaps/weekends do
not manufacture bars. If the anchor open changed (e.g. an adjustment or revision), the
report remains unresolved for investigation; it is not scored against a different basis.
The current history window is bounded at 5,000 bars; older missing history stays pending.
The provider must return the requested instrument, interval and, when supplied, MIC.
Incomplete parsed bars are errors in strict mode, not silently dropped observations.

## Finality is conservative, not inferred from a fresh request timestamp

Twelve Data's `datetime` identifies the bar OPEN; daily values are exchange-local date
labels even with `timezone=UTC`. The evaluator therefore:

- requires a subsequent observed bar, never scores the last returned bar;
- waits the full four-hour interval and a five-minute settlement allowance for 4h bars;
- for daily labels, waits the entire labelled day plus a conservative 14-hour civil-time
  offset and five minutes, as well as requiring the next actual session's bar;
- rejects future, duplicated, disordered, invalid and wrong-source evidence.

This deliberately delays results. `targetBarTime` remains a provider bar label;
`confirmedAt` is when the server confirmed the result, NOT a fabricated market close time.
A future enhancement can use verified exchange calendars and explicit provider finality.
Unlabelled legacy records are never retrofitted with a hindsight-selected plan.

Realized return and multiclass Brier are calculated without early rounding. A 1e-9
percentage-point numerical tolerance keeps exact threshold boundaries neutral. UI rounds
only for display. Each result includes the policy/report hashes and evidence fingerprint.
The original forecast is not modified; outcome metadata is conditionally saved with the
Cosmos ETag. A losing concurrent writer rereads the winner, never overwrites it.

## Bounded background operation

`POST /api/internal/forecasts/evaluate` accepts no evaluation inputs. It requires the
existing constant-time-checked worker secret, real-data mode, and
`FORECAST_EVALUATION_ENABLED=true`. When disabled it performs no storage/provider work.
The Cosmos journal contains one reserved evaluator checkpoint in a non-user partition:

- 150-second ETag-controlled lease, with a 15-minute minimum between completed batches;
- maximum 3 forecasts per page and a 45-second pre-request batch budget;
- persisted continuation so long histories rotate across timer invocations;
- failed/incomplete pages retain their cursor; per-record failures are not scored;
- stale workers cannot advance a newer lease owner's checkpoint.

This is an intentionally low-throughput starting point, not a claim of production-scale
capacity. The reserved control document is excluded by journal `kind`/owner filters.
The only timer lives in the existing separate alert worker, not the SWA HTTP API. It uses
`0 */15 * * * *`, no run-on-startup, monitoring enabled, a 90-second HTTP timeout, and
rejects redirects so the worker credential cannot be forwarded to another endpoint.
No extra Azure resource or charge is enabled by committing these files.

## Enable only after hosted acceptance

On the MarketOS API and existing worker, set `FORECAST_EVALUATION_ENABLED=true` only after
reviewing the data entitlement and actual Cosmos/auth/provider tests. On the worker also set
`MARKETOS_FORECAST_EVALUATION_URL=https://<MarketOS-host>/api/internal/forecasts/evaluate`.
The API and worker must share the existing secret `MARKETOS_WORKER_SECRET` (at least 32
characters). Do not expose it in VITE variables, browser code, logs, URLs or chat.
Existing API settings and the separate `/userId` journal container remain required.
Disabling the feature flag stops evaluation without removing original reports or results.

The authenticated server history displays pending/resolved results, return, Brier,
recorded horizon, and confirmation time. Pagination permits pending -> resolved updates,
rejects conflicting outcomes, and does not roll a stored result back from stale pages.
Counts refer only to the displayed reports; no global accuracy is invented from a page.

## Validation and remaining acceptance

`node scripts/server-forecast-evaluation-smoke.mjs` runs deterministic service-double tests
for finality, gaps, provenance, integrity, atomic results, worker leases/checkpoints,
endpoint authorization/input refusal, source failures, timer configuration and UI receipt
validation. The installed-SDK, strict-client and existing foundation tests remain in CI.
Node 22 CI builds the strict browser, API and separate worker and checks packaging.

Remaining: deployment authorization, actual Cosmos ETags/checkpoint/pagination/restart,
worker HTTPS authentication, real provider symbols/adjustments/session labels and licences,
observability/alerts/backups, user-level generation quotas, load testing, and a prospective
out-of-sample assessment. The configuration readiness endpoint still correctly returns
`productionReady: false`; an implemented evaluator is not a hosted acceptance result.

Primary implementation references:
- https://twelvedata.com/docs (time_series datetime and timezone semantics)
- https://learn.microsoft.com/en-us/azure/cosmos-db/database-transactions-optimistic-concurrency
- https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions
- https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer
