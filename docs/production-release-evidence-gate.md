# Production release evidence gate

MarketOS must not be described as a fully accepted production release just because the code
builds or Azure deployment succeeds. The **Production Release Evidence Gate** is the final
manual evidence check for one exact `main` commit.

Run it only after all required production acceptance workflows have completed successfully
for the same commit SHA.

The gate requires successful evidence for:

1. full MarketOS CI;
2. exact verified Azure production deployment, including the hosted boundary check;
3. live provider entitlement/timestamp acceptance;
4. live Cosmos persistence/isolation acceptance;
5. live Cosmos forecast + provider-request quota concurrency acceptance;
6. live account-erasure persistent-store acceptance;
7. bounded hosted ingress load acceptance;
8. one live hosted forecast-evaluator sweep;
9. live Application Insights component/link/ingestion acceptance;
10. a separate-account Cosmos backup restore drill that recovers the exact-SHA recovery marker across all three persistent containers.

Every run must:

- belong to `main`;
- match the release candidate's full 40-character SHA;
- have the expected event type;
- have completed successfully;
- be no older than the configured evidence window (default 72 hours).

Hosted load, evaluator, and Application Insights acceptance must also complete **after** the exact
production deployment for that SHA. Restore-drill evidence is release-bound by the recovery marker's
full SHA and must come from a distinct restored Cosmos account. Evidence from another commit cannot
satisfy the gate.

The workflow uses the built-in GitHub token with read-only `actions: read` and `contents: read`
permissions. It does not receive Azure deployment tokens, Cosmos credentials, provider keys or the
worker secret. It reads only workflow-run metadata and stores a non-secret manifest of run IDs,
timestamps and URLs.

A green gate means the required workflows are green for the exact release candidate. It does not
independently repeat or strengthen those underlying tests, and it is not a claim of guaranteed
forecast accuracy or financial performance.

GitHub's workflow-runs API supports filtering by `head_sha`, event and status; MarketOS still
rechecks SHA, branch, event, completion and conclusion locally before accepting a run.
