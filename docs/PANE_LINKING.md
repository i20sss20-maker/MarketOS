# Pane Linking V1

MarketOS multi-chart panes can be linked independently by dimension.

## Link modes

- **Symbol** — changing the symbol from any visible pane aligns all visible panes to the selected symbol.
- **Timeframe** — changing the timeframe from any visible pane aligns all visible panes to the selected timeframe.
- **Range** — synchronizes Zoom / Scroll using the existing logical-range synchronization.
- **Crosshair** — synchronizes the hovered time across visible panes. Each target pane uses its nearest local candle and local close price.

Each mode can be enabled or disabled separately.

## Range compatibility

Range linking is only applied when all visible panes use the same timeframe.

When visible timeframes differ:

- Symbol Link continues to work.
- Timeframe Link continues to work.
- Range Link is temporarily unavailable.

Enabling Timeframe Link immediately aligns visible pane timeframes and makes Range Link compatible again.

## Persistence

The current link preferences are stored locally:

- `marketos:chart-sync` — Range Link
- `marketos:pane-link-symbol` — Symbol Link
- `marketos:pane-link-timeframe` — Timeframe Link
- `marketos:pane-link-crosshair` — Crosshair Link

These keys are part of MarketOS Cloud Sync UI state.

## Workspaces

Workspace V5 stores:

```ts
paneLinks: {
  range: boolean;
  symbol: boolean;
  timeframe: boolean;
  crosshair: boolean;
}
```

Older Workspace V2/V3/V4 data remains compatible:

- legacy `chartSyncEnabled` becomes the Range setting,
- Symbol Link defaults to OFF,
- Timeframe Link defaults to OFF,
- Crosshair Link defaults to OFF.

## Same-symbol panes

Multi-chart mode supports loading the same symbol in multiple panes. This is required for workflows such as:

- one symbol across multiple independent visual setups,
- one symbol across multiple timeframes when Timeframe Link is disabled,
- linked-symbol analysis with different pane indicators.

Single-chart comparison mode keeps its existing safety behavior and does not treat the same symbol as a comparison overlay.
