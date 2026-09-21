# Azure production deployment

MarketOS has separate Preview and Production deployment paths.

Production uses `.github/workflows/azure-production.yml` and is deliberately manual-only.
The operator must provide the exact production origin and type:

```text
DEPLOY MARKETOS PRODUCTION
```

Before upload, the workflow builds with `VITE_MARKETOS_REQUIRE_REAL_DATA=true` and runs the
strict client, server foundation, provider-authentication, market-data provenance, operations
guardrail, and Azure packaging checks.

The deployment job receives only the Static Web Apps deployment token. Market-data provider
keys, Cosmos credentials, and worker secrets are not workflow inputs.

After upload, the workflow waits for `/api/health` and runs hosted boundary acceptance.
The deployment run is not green merely because files uploaded successfully: the hosted
configuration must also report persistent storage/quota/provider readiness and anonymous
provider endpoints must remain blocked.

This workflow does not provision or purchase:

- an Azure Static Web App;
- Cosmos DB;
- a market-data subscription or exchange entitlement;
- monitoring resources or a Cost Management budget;
- background workers.

Those are separate, explicit operator actions because they can involve credentials, account
permissions, or cost.

## Deployment credential

`AZURE_STATIC_WEB_APPS_API_TOKEN` must be stored in GitHub secret storage available to the
`azure-production` environment. Never paste it into source, chat, screenshots, issue bodies,
or workflow inputs.

The Azure bootstrap can copy the token directly to GitHub when authenticated `gh` is
available. It intentionally no longer prints the token as a fallback.

## Rollback

A failed hosted acceptance means the release is **not accepted**. Preserve the previous known
good deployment artifact/commit and use the Static Web Apps deployment history or redeploy the
previous commit after investigating the failed readiness evidence. Do not change production
data/provider settings merely to make acceptance green.

The hosted boundary artifact contains statuses and non-secret readiness data only.


## Verified artifact and deployment binding

The verify job creates the production web/API bundle once, generates an npm lockfile for the
standalone Azure API runtime dependencies, proves that lockfile installs, and uploads the exact
bundle as a workflow artifact. The deploy job downloads that artifact and uses `npm ci`; it does
not rebuild MarketOS source.

After Azure Static Web Apps deploys the bundle, the workflow requires the action's
`static_web_app_url` output to match the manually supplied HTTPS production origin. Hosted
acceptance then runs against the URL returned by Azure, not an arbitrary URL copied into the
workflow form.

This prevents a green verification for one bundle followed by a different rebuild at deploy time,
and prevents production acceptance from accidentally testing a different Static Web App.


## Immutable build identity

`prepare:azure-api` writes the full Git commit SHA into `dist/build-info.json` inside the
standalone API artifact. The public health response exposes only the first 12 hexadecimal
characters. During the production workflow, hosted acceptance receives `${{ github.sha }}`
and requires the deployed health endpoint to report the matching prefix.

This makes the release traceable to the exact workflow commit even though runtime GitHub
environment variables are not guaranteed to exist inside managed Static Web Apps Functions.
A deployment that serves a stale/different API bundle fails acceptance.
