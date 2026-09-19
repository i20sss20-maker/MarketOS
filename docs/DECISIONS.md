# MarketOS decisions

## Current product decisions

- MarketOS is a charting and market-intelligence product, not a brokerage product.
- The chart is the core workspace.
- AI must be able to consume structured chart context and later place deterministic overlays/actions on the chart.
- Market data and AI vendors remain replaceable behind internal interfaces.
- The first prototype uses demo candles only.
- MarketOS infrastructure is isolated from every unrelated project.
- Azure for Students is used only for development/validation; production infrastructure will be decided separately.
