# MarketOS architecture

## Principles

1. Chart-first product.
2. Provider-neutral market data.
3. AI is a replaceable gateway, not hard-wired into the UI.
4. No trading execution in the foundation.
5. Secrets stay server-side.
6. Every Azure resource for MarketOS lives in its own resource group.
7. No infrastructure, database, credential, repository, or deployment may be shared with unrelated projects.

## Logical flow

```text
Market-data provider
        |
        v
MarketOS API / data gateway
        |
        +---- cache / historical storage
        |
        +---- web & mobile clients
        |
        +---- AI context builder
                    |
                    v
                AI gateway
```

## Market data

The `MarketDataProvider` contract exists before a vendor is chosen. This lets MarketOS switch providers or use different vendors per asset class without rewriting chart components.

Real-time and exchange data must only be enabled when the project has the appropriate data rights.

## AI

The AI layer will receive structured chart context rather than screenshots by default:

- symbol
- timeframe
- OHLCV
- indicators
- visible range
- user drawings
- market events

This keeps the AI explainable and makes chart actions deterministic.

## Azure

Initial Azure target:

- Static Web Apps or equivalent web hosting
- Azure Functions for API endpoints
- Key Vault for provider secrets
- Storage for cache/historical artifacts
- Application Insights for observability

No paid resource is provisioned automatically in this foundation.
