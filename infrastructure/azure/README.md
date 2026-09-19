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
