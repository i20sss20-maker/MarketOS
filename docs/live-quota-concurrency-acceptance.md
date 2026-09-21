# Live quota concurrency acceptance

This is a manual production acceptance test for the **already-provisioned** MarketOS
`forecastJournal` Cosmos container. It does not call a market-data provider, does not call
the hosted API, and does not create databases, containers, throughput, users, forecasts, or
Azure resources.

Run **Live Quota Concurrency Acceptance** manually in the `azure-production` GitHub
environment after the production Cosmos secret has been synchronized.

The check exercises the actual compiled production quota stores against Cosmos:

- forecast generation: one initial unit plus six concurrent one-unit attempts against a
  hard limit of four; exactly three concurrent attempts must be allowed and three denied;
- provider requests: one initial unit plus four concurrent two-unit attempts against a hard
  limit of five; exactly two concurrent attempts must be allowed and two denied;
- the persisted counters must finish at exactly their hard limits—never above them;
- all temporary quota records use random owner partitions and are removed in a `finally`
  block, then cleanup is verified.

The evidence artifact contains only the database/container names, configured test limits,
aggregate allowed/denied counts, final counters and cleanup state. It does not contain the
Cosmos connection string or temporary owner IDs.

This acceptance closes the **storage-level concurrency** portion of
`HOSTED_FORECAST_QUOTA_CONCURRENCY` and `HOSTED_MARKET_DATA_QUOTA_CONCURRENCY`. It does
not prove the authenticated HTTP route boundary, provider billing behavior, or multi-region
Cosmos behavior. Those remain separate hosted acceptance concerns.

A failure due to quota contention is treated as a failure rather than retried by the workflow:
the production store itself must resolve the bounded concurrent requests without overshooting
or silently dropping the cap.
