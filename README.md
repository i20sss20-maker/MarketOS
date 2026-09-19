# MarketOS

MarketOS is an independent, AI-native market charting and market-intelligence platform.

The product direction is chart-first: professional market charts, watchlists, screeners, alerts, market context, and AI that can understand and interact with chart context.

## Project boundaries

This repository is **fully isolated** from every other project:

- no shared repositories
- no shared deployments
- no shared databases
- no copied credentials or secrets
- no reused production infrastructure

## Current foundation

- `apps/web` — React/Vite chart-first web client
- `services/api` — Azure Functions API boundary
- `packages/market-core` — provider-neutral market data contracts
- `docs` — architecture and product roadmap
- `infrastructure/azure` — Azure deployment notes; no paid resources are provisioned by this repository yet

The first chart prototype uses TradingView Lightweight Charts for UI prototyping. Market data is demo-only until a licensed provider is selected.

## Local development

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev:web
```

In a second terminal:

```bash
pnpm dev:api
```

## Important

MarketOS is not a broker and this foundation does not execute trades, hold funds, or provide brokerage functionality.
