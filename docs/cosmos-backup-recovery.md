# Cosmos backup and recovery gate

MarketOS production configuration must not rely on persistent Cosmos data without confirming
the Azure account's backup policy.

Run locally while authenticated to Azure:

```powershell
./infrastructure/azure/verify-cosmos-backup-policy.ps1
```

The verifier is intentionally **read-only for Cosmos**. It reads the account backup policy,
records only non-secret metadata in MarketOS Static Web Apps settings, and never changes backup
mode, retention, redundancy, throughput, containers, or data.

It records:

- whether Azure returned a supported backup policy;
- `periodic` or `continuous` mode;
- the UTC verification date;
- periodic interval/retention/redundancy or continuous tier as informational metadata.

Production readiness accepts the verification for at most 30 days. This is a drift guard, not a
restore test.

Azure Cosmos DB supports periodic and continuous backup modes. Periodic mode is the default and
restore procedures differ from continuous point-in-time restore. Do not migrate backup modes just
to make MarketOS green: backup mode is an operational/cost/recovery decision and must be reviewed
separately.

A production release still needs a restore runbook drill appropriate to the selected policy.
MarketOS deliberately does not automate a destructive or billable restore from CI.

References:

- https://learn.microsoft.com/en-us/azure/cosmos-db/online-backup-and-restore
- https://learn.microsoft.com/en-us/azure/cosmos-db/periodic-backup-modify-interval-retention
- https://learn.microsoft.com/en-us/azure/cosmos-db/provision-account-continuous-backup
