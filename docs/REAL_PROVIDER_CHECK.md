# Real Market Data Provider Check

MarketOS keeps real provider validation separate from normal CI so a provider key is never required for routine builds and provider credits are not consumed automatically.

## GitHub secret

Add this repository secret:

`TWELVE_DATA_API_KEY`

Do not place the key in source files, issues, logs, screenshots, or chat messages.

## Run the check

Go to:

**GitHub > Actions > Real Provider Check > Run workflow**

The workflow is manual only.

## What it validates

The current integration check validates:

1. `AAPL` can be found through `symbol_search`
2. AAPL quote returns a positive price
3. AAPL daily candles return valid ascending data
4. Saudi Exchange trial symbol `7203` resolves to MIC `XSAU`
5. `XSAU:7203` daily candles are accessible with the configured plan
6. Saudi Aramco `2222` resolves to MIC `XSAU`

A failure on the Saudi candle test normally means the Twelve Data plan/key does not include the required Saudi Exchange entitlement.

## After it passes

Only after the live check passes should Azure Preview be changed from:

```text
MARKET_DATA_PROVIDER=demo
```

to:

```text
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=<secret>
```

Market Events remains independently configurable with `MARKET_EVENTS_PROVIDER`.

This lets MarketOS use Twelve Data for charts while keeping the earnings calendar on Demo or another provider if desired.
