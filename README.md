# MarketOS

MarketOS is an independent, analyst-first market intelligence platform with professional charting as the visual evidence layer.

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
- Replay V2 with selectable start point, 0.5×–8× speeds, multi-bar jumps and live session statistics
- watchlists and saved workspaces
- Instrument Overview with Replay-safe performance, volatility, range and volume statistics
- local and cloud-evaluated advanced alerts
- scheduled background alert evaluation with a persistent server-owned Alert Inbox
- opt-in VAPID Web Push notifications that deep-link back to the Alert Inbox
- local PNG chart snapshots, visible-candle CSV export and safe shareable chart links
- global Command Palette with Ctrl/Cmd+K, live symbol search and fast workspace/tool navigation
- MarketOS Home Dashboard with watchlist pulse, breadth, alert inbox, market events and recent workspaces
- Chart Templates with presets, saved configurations, custom-indicator merge and Cloud Sync
- independent multi-chart pane visuals for chart type, built-in indicators and display settings, persisted in Workspace V3
- Object Tree for centralized indicator, custom indicator, comparison and drawing management
- Drawing Alerts bridge for creating live price alerts directly from horizontal chart levels
- independent pane links for symbol, timeframe, range/zoom and crosshair, persisted in Workspace V5
- Chart Tabs with per-tab symbol/timeframe/view sessions, Recent Symbols and Cloud Sync
- probabilistic Analyst Forecast with multi-timeframe scoring, EMA/RSI/ATR/MACD evidence, support/resistance, scenarios, catalysts and confidence
- Historical Analog calibration that measures similar prior setups, forward returns, sample reliability and blends them into scenario probabilities
- Forecast Journal + Scorecard with pending/resolved outcomes, provider-only directional accuracy and multi-class Brier scoring
- Forecast Journal V2 exact-horizon evaluation using the first valid historical candle after each forecast horizon, with market-session tolerance and provider-identity guards
- Forecast Journal V3 bar-count horizon evaluation aligned to calibration lookahead bars, resilient to weekends/session gaps, with dynamic history windows for delayed verification
- Analyst Radar that scans up to five watchlist symbols through the full probabilistic forecast engine and ranks setup clarity without emitting trade orders
- Analyst Radar V2 local cache with 15-minute freshness, instant restore and automatic stale refresh on open
- Analyst Radar V3 scan-over-scan tracking for strengthening, weakening and direction reversals with exact candidate-signature isolation
- Analyst Performance dashboard with provider-only realized accuracy, Brier score, confidence calibration, direction/symbol breakdowns and quote-based matured forecast verification
- Forecast Performance V2 engine-aware scorecards separating realized accuracy, Brier and calibration by Analyst engine version, with current-engine metrics preferred in Home Brief
- Forecast Performance V3 sample-aware engine scorecards with Wilson 95% accuracy intervals and a 5-result minimum before Home switches to current-engine metrics
- Forecast Performance V4 current-engine drift monitoring that compares recent vs prior realized windows across accuracy, Brier and calibration with a 12-result minimum before classifying stable/improving/watch/degrading
- Forecast Performance V5 probability reliability with current-engine confidence buckets, Expected Calibration Error (ECE), max-gap tracking, and a 20-result minimum before rating calibration quality
- Analyst Model Health combining sample maturity, realized accuracy interval, Performance Drift and probability reliability into learning/healthy/watch/degraded states shown in Analyst reports and Home without altering forecasts
- Analyst Brief on MarketOS Home combining top Radar setup, scan-over-scan change, structured catalyst impact, matching Forecast Watch alerts and realized analyst performance
- Analyst Brief V2 auto-refresh using the shared cancellable Radar Scanner: fresh cache restores instantly and stale Home intelligence refreshes in place
- Analyst Brief V3 sequential Home intelligence refresh: stale Radar scan first, then throttled matured Forecast Journal verification so realized accuracy/Brier stay current without duplicate provider load
- Analyst Attention Queue on Home prioritizing Radar reversals, meaningful strengthening, near Forecast Watch levels, structured catalysts and matured forecast verification without issuing trade orders
- Analyst Attention Queue V2 source-matched live Watchlist proximity for Forecast Watch levels, with per-symbol Demo fallback rejection and Radar-reference fallback
- Quant Catalyst Impact that uses only realized non-demo structured earnings surprises as a bounded directional input; textual releases remain context-only
- Forecast Watch bridge that turns Analyst resistance/support scenario triggers into guarded Advanced Alerts with duplicate prevention and background-monitoring compatibility
- analyst coverage model for stocks, ETFs, indices, forex, crypto, futures and commodities, subject to configured market-data licensing
- Multiple Watchlists with safe legacy migration, named lists, active-list switching and Cloud Sync
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
