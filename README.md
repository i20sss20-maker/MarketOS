# MarketOS

MarketOS is an independent, AI-native market charting and market-intelligence platform.

The product is chart-first and provider-neutral: professional charts, indicators, drawing tools, replay, multi-chart layouts, screeners, heatmaps, alerts, market events, watchlists, saved workspaces, and structured AI chart context.

## Project boundaries

This repository is **fully isolated** from every other project:

- no shared repositories
- no shared deployments
- no shared databases
- no copied credentials or secrets
- no reused production infrastructure

## Current architecture

- `apps/web` — React/Vite chart workspace
- `services/api` — Azure Functions API
- `packages/market-core` — provider-neutral market contracts
- `infrastructure/azure` — MarketOS-only Azure preview tooling
- `scripts` — runtime and deployment smoke tests
- `.github/workflows/ci.yml` — continuous validation
- `.github/workflows/azure-preview.yml` — manual Azure preview deployment

## Current capabilities

- Candles / line / area charts
- multiple timeframes
- volume pane
- SMA / EMA / Bollinger / RSI / MACD / ATR / Stochastic
- trend, horizontal, zone and Fibonacci drawings
- per-drawing delete and persistence
- second-symbol comparison
- 1x / 2x chart layouts
- historical Replay with replay-aware AI context
- watchlists and saved workspaces
- Instrument Overview with Replay-safe performance, volatility, range and volume statistics
- local and cloud-evaluated advanced alerts
- scheduled background alert evaluation with a persistent server-owned Alert Inbox
- opt-in VAPID Web Push notifications that deep-link back to the Alert Inbox
- local PNG chart snapshots, visible-candle CSV export and safe shareable chart links
- global Command Palette with Ctrl/Cmd+K, live symbol search and fast workspace/tool navigation
- Market Screener + Heatmap + breadth
- market session status and optional quote auto-refresh
- Market Events / earnings calendar
- Company Feed for official company press releases with sanitized plain-text rendering
- MarketOS AI chart-context endpoint
- provider-neutral market data/events adapters
- Demo fallbacks for development

## Market data

The repository includes:

- deterministic Demo provider
- Twelve Data adapter for quotes/candles/search
- batch quote support for screener workloads
- independent Twelve Data earnings-calendar adapter
- independent Twelve Data company press-release adapter with server-side HTML sanitization and cache

No real provider key is committed to source.

## Local development

Requirements:

- Node.js 20
- pnpm 10.15.x
- Azure Functions Core Tools for local API execution

Install:

```bash
pnpm install
```

Run the web app:

```bash
pnpm dev:web
```

Run the API in another terminal:

```bash
pnpm dev:api
```

Local web default: `http://localhost:5173`

Local API default: `http://localhost:7071/api`

## Validation

```bash
pnpm typecheck
pnpm build
pnpm smoke:market
pnpm smoke:ai-chart
pnpm smoke:events
pnpm prepare:azure-api
pnpm smoke:azure
```

GitHub CI runs these checks before feature branches are merged.

## Azure Preview

The Azure Preview path uses **Azure Static Web Apps Free + managed Azure Functions** with Node.js 20.

See:

`infrastructure/azure/README.md`

One-time bootstrap on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\azure\bootstrap-preview.ps1
```

Then run:

**GitHub > Actions > Azure Preview Deploy > Run workflow**

The Azure deployment workflow is manual on purpose. It does not deploy until the MarketOS-only deployment token is configured.

## System Health

Use the **النظام** button in MarketOS to inspect:

- API availability
- current environment
- Market Data provider and mode
- Market Events provider and mode
- Company Feed provider and mode
- AI engine mode
- Web Push / background-alert status
- build identifier when available

The health endpoint never returns provider keys or credentials.

## Important

MarketOS is a charting and market-intelligence product. It does not execute trades, hold funds, or provide brokerage functionality.
