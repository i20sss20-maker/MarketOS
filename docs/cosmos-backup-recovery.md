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

## Release-bound restore drill

The repository now separates the drill into three explicit stages:

1. Run **Cosmos Recovery Marker Seed** on the exact release SHA. It writes one tiny, non-user
   marker to each of the three production containers and retains it for backup recovery.
   Download the `cosmos-recovery-marker` evidence; it contains the marker ID and a SHA-256 of
   the source account endpoint, never the connection string or endpoint itself.
2. Perform the Azure restore using the account's actual backup mode. This step stays outside
   CI because restore behavior, permissions, time and charges differ between periodic and
   continuous backup. Restore to a **separate account** for this MarketOS drill.
3. Store only that restored account's connection string as the temporary
   `COSMOS_RESTORE_CONNECTION_STRING` secret in the `azure-production` GitHub environment,
   then run **Cosmos Restore Drill Acceptance** with the marker ID and source endpoint hash.
   The workflow is read-only: it requires a distinct restored account and verifies the marker
   exists in `userState`, `entitlements`, and `forecastJournal` with `/userId` partitioning.

After evidence is captured, remove the temporary restore secret and dispose of the restored
account according to the approved Azure runbook. The workflow intentionally does not delete
the restored account for you.

References:

- https://learn.microsoft.com/en-us/azure/cosmos-db/online-backup-and-restore
- https://learn.microsoft.com/en-us/azure/cosmos-db/periodic-backup-modify-interval-retention
- https://learn.microsoft.com/en-us/azure/cosmos-db/provision-account-continuous-backup
