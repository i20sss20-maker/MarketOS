# Production cutover preflight

Run this before any production acceptance or deployment:

```powershell
./infrastructure/azure/production-cutover-preflight.ps1
```

The preflight is intentionally read-only. It checks the **presence and shape** of MarketOS
configuration without printing secret values or changing Azure/GitHub state.

It checks:

- Azure and GitHub CLI authentication;
- the MarketOS resource group and Static Web App;
- strict production mode and HTTPS origin;
- selected market/event/feed provider plus provider credential presence;
- declared market-data timing, usage scope and rights confirmation;
- Cosmos user-state, entitlement and forecast-journal configuration;
- forecast and provider-request daily hard caps;
- Azure metric-alert, cost-budget and Application Insights configuration;
- server forecast-evaluator enablement and worker credential presence;
- the production Static Web Apps deployment-token secret name in GitHub;
- the live provider-acceptance secret name in GitHub.

The script never prints `TWELVE_DATA_API_KEY`, `COSMOS_CONNECTION_STRING`,
`MARKETOS_WORKER_SECRET`, deployment-token values, or the app-settings object.

A green preflight is **not** a release certificate. It does not contact the market-data provider,
write Cosmos data, test login isolation, run load acceptance, evaluate a forecast, deploy the app,
or prove data/commercial rights. Those are covered by the exact-SHA live acceptance workflows and
the Production Release Evidence Gate.

Recommended sequence:

1. run the cutover preflight;
2. run live provider and Cosmos acceptance for the exact `main` SHA;
3. run live quota concurrency and account-erasure acceptance;
4. run the separate-account Cosmos restore drill for that same SHA;
5. run **Azure Production Deploy** for that same SHA;
6. run bounded hosted load and live forecast-evaluator acceptance after deployment;
7. run live Application Insights telemetry acceptance after deployment;
8. run **Production Release Evidence Gate** and require every exact-SHA workflow and its required jobs to be fresh and green.
