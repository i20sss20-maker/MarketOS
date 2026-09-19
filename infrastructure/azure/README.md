# MarketOS Azure Preview

This folder is for **MarketOS only**. Do not reuse resource groups, deployment tokens, databases, app settings, or credentials from unrelated projects.

## Recommended preview architecture

MarketOS preview uses:

- Azure Static Web Apps Free
- Managed Azure Functions under the same `/api` origin
- Node.js 20 API runtime
- GitHub Actions manual deployment
- Demo market data/events and the local chart intelligence engine by default

This keeps the first Azure footprint small and avoids creating extra paid resources before the product needs them.

## One-time bootstrap on Windows

Requirements:

- Azure CLI
- Signed in with `az login`
- Optional: GitHub CLI (`gh`) signed in to the GitHub account that owns `i20sss20-maker/MarketOS`

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-preview.ps1
```

Defaults:

- resource group: `rg-marketos-dev`
- Static Web App: `marketos-preview`
- region: `westeurope`
- SKU: Free

Custom example:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-preview.ps1 -ResourceGroup "rg-marketos-dev" -AppName "marketos-preview-yourname" -Location "westeurope"
```

The script verifies Azure login, creates/confirms the MarketOS-only resource group, creates a Free Static Web App if missing, sets safe preview app settings, reads the deployment token, and saves it to GitHub when `gh` is available.

## Azure for Students region policy

Azure for Students subscriptions can have a Microsoft-managed allow-list of deployment regions. Static Web Apps has a smaller backend-region set than Azure overall. If your assigned regions do not overlap a supported Static Web Apps backend region, Azure Policy can reject creation. The script stops on that error and does not create a paid fallback automatically.

## GitHub deployment

Workflow: `.github/workflows/azure-preview.yml`

It is intentionally `workflow_dispatch` only. Run **GitHub > Actions > Azure Preview Deploy > Run workflow** after `AZURE_STATIC_WEB_APPS_API_TOKEN` exists.

Before deployment the workflow runs TypeScript validation, the full build, market-data smoke, AI-chart smoke, and market-events smoke.

## Safe preview settings

```text
MARKET_DATA_PROVIDER=demo
MARKET_EVENTS_PROVIDER=demo
MARKET_FEED_PROVIDER=demo
AI_PROVIDER=local-chart-engine
MARKETOS_ENVIRONMENT=azure-preview
```

To connect Twelve Data later, configure these in Azure Static Web Apps environment variables, never in source:

```text
MARKET_DATA_PROVIDER=twelvedata
MARKET_EVENTS_PROVIDER=twelvedata
MARKET_FEED_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=<secret>
```

Market Events and Company Feed only load on explicit user action. Their provider adapters cache results to reduce provider-credit usage.

## Useful Azure CLI commands

```powershell
az staticwebapp show -n marketos-preview -g rg-marketos-dev
az staticwebapp show -n marketos-preview -g rg-marketos-dev --query defaultHostname -o tsv
az staticwebapp appsettings list -n marketos-preview -g rg-marketos-dev
```

Do not paste a real provider key into commits, screenshots, issues, or chat logs.


## Persistent user accounts and cloud sync

MarketOS uses Azure Static Web Apps built-in authentication for Microsoft Entra ID and GitHub.

Protected user-state route:

`/api/user/state`

The API reads the authenticated user from Azure's `x-ms-client-principal` header. The browser never supplies or chooses the storage user ID.

### Enable persistent Cosmos storage

After the Static Web App exists, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-cosmos.ps1
```

The script:

1. derives a deterministic Cosmos account name from the current Azure subscription
2. creates a Cosmos DB Free Tier account if one is not already present
3. creates SQL database `marketos`
4. creates container `userState` with partition key `/userId`
5. reads the connection string without printing it
6. writes the connection string directly to Azure Static Web Apps application settings
7. switches `USER_DATA_PROVIDER` from `memory` to `cosmos`

No paid fallback is created automatically if Free Tier creation fails.

### Authentication shortcuts

On Azure:

- `/login/microsoft`
- `/login/github`
- `/logout`

The MarketOS account panel can upload the current device state, restore the cloud copy, or delete the cloud copy. Restore is intentionally manual in V1 to avoid overwriting a user's local layouts or alerts without confirmation.

### Cloud-synced state

V1 sync includes:

- Watchlist
- saved Workspaces/layouts
- advanced Alerts
- Chart Settings
- custom indicators
- selected UI/workspace preferences

Provider keys and Azure secrets are never part of the user-state payload.


## Background alert worker

MarketOS can evaluate cloud-synced alerts on a schedule even when the browser is closed.

Architecture:

```text
Azure Functions Timer (Flex Consumption)
        |
        | worker secret
        v
MarketOS /api/internal/alerts/sweep
        |
        +--> Cosmos user states
        +--> Market Data Gateway
        +--> shared @marketos/alert-core
```

The worker intentionally does **not** receive Cosmos or market-data credentials. It only receives:

- the HTTPS internal sweep URL
- a generated MarketOS worker secret
- the timer schedule

The API remains the single place that owns provider and user-data access.

### Prerequisite

Persistent Cosmos storage must already be enabled:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-cosmos.ps1
```

### Create and deploy the scheduled worker

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-alert-worker.ps1
```

Defaults:

- Azure Functions Flex Consumption
- Node.js 22
- schedule: every 5 minutes
- no always-ready instance
- up to 5 user-state pages per timer execution
- 10 users per API sweep page
- up to 5 oldest alert symbol/timeframe groups per user per sweep

The server rotates alert groups by oldest `lastCheckedAt`, so users with more alert groups are processed fairly across timer runs.

The bootstrap:

1. verifies Cosmos persistence is enabled
2. creates a worker Storage Account if needed
3. creates the Flex Consumption Function App
4. generates a cryptographically random worker secret
5. stores the secret in both Azure services without printing it
6. builds the TypeScript worker
7. packages production dependencies
8. deploys the zip package to Azure Functions
9. enables `ALERT_WORKER_ENABLED=true` in MarketOS System Health

Azure Functions Flex Consumption is execution-based. No always-ready worker is created by the MarketOS bootstrap.

## Web Push notifications

MarketOS can send opt-in browser notifications when the background alert worker triggers an alert. Web Push uses the existing Static Web App API and Cosmos user state, so the MarketOS setup does not create another Azure resource.

Prerequisites:

- Azure Static Web App is deployed
- persistent Cosmos user state is enabled
- users sign in before registering a device

Enable Web Push once from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-web-push.ps1
```

The bootstrap:

1. verifies Azure login and persistent Cosmos storage
2. reuses existing VAPID keys when present
3. generates a new VAPID key pair locally only when needed
4. writes the public/private keys directly to Azure app settings
5. never prints the VAPID private key
6. enables `WEB_PUSH_ENABLED=true`

Do not rotate VAPID keys during normal updates because existing browser subscriptions are tied to the public key. Intentional rotation is available with:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-web-push.ps1 -RotateKeys
```

After Web Push is configured, signed-in users can enable or disable notifications for each browser/device from **MarketOS > Account**. Background alert deliveries are still stored in Alert Inbox even if Push is disabled or a delivery fails.

Web Push settings:

```text
WEB_PUSH_ENABLED=true
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=https://<marketos-host>
```

The private key is server-side only and is never returned by `/api/push/config`.

