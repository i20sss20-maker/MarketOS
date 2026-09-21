# Live market-data provider acceptance

The normal CI suite uses fixtures. It does not prove that a paid/provider account is entitled
to the instruments or timing MarketOS intends to use.

Run **Real Provider Check** manually only after the provider key is stored in the
`market-data-acceptance` GitHub environment. The workflow requires an operator to declare:

- the expected primary-feed timing: realtime, delayed, or end-of-day;
- delay minutes when delayed;
- personal or commercial usage scope;
- the date on which the provider/exchange rights were reviewed;
- the exact confirmation phrase `I CONFIRM MARKET DATA RIGHTS`.

This declaration does not purchase or independently verify legal rights. It prevents MarketOS
from silently treating an unspecified plan as production-ready.

## Timestamp semantics

Twelve Data documents `/quote.timestamp` as the opening time of the requested interval
(default quote interval is one day), while `last_quote_at` represents the last minute quote.
MarketOS therefore prefers `last_quote_at` for quote freshness and records
`timestampKind="last-quote"`. The interval-open timestamp is retained only as a labelled
fallback.

When production timing is declared realtime or delayed and the market is not explicitly
closed, MarketOS rejects an interval-open timestamp as freshness evidence. It also rejects
a last-quote timestamp older than:

- 15 minutes for a realtime declaration;
- the declared delay plus 15 minutes for a delayed declaration.

The extra 15 minutes is an acceptance allowance, not a claim that the feed is delayed by that
amount.

## Live checks

The workflow currently checks:

- Apple/AAPL resolves to MIC XNAS;
- AAPL quote source, timestamp and timing semantics;
- recent ascending AAPL daily candles;
- Saudi trial symbol 7203 resolves to MIC XSAU and returns recent daily candles;
- Saudi Aramco 2222 resolves to MIC XSAU.

The Saudi checks prove endpoint entitlement/availability for those requests, not realtime
Saudi data. Twelve Data's public exchange directory currently labels XSAU as EOD; MarketOS
must not present it as realtime unless the actual provider/exchange entitlement changes and
the production timing declaration is updated accordingly.

The evidence artifact stores symbols, MICs and timestamps only. It does not store the API key
or live prices.

References:
- https://twelvedata.com/docs
- https://twelvedata.com/exchanges/XSAU
