import assert from "node:assert/strict";
import { TwelveDataMarketDataProvider } from "../services/api/dist/src/providers/twelveDataProvider.js";

const originalFetch = globalThis.fetch;

const calls = {
  search: 0,
  candles: 0,
  quote: 0,
  batch: 0,
};

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const path = url.pathname;

  assert.equal(url.searchParams.get("apikey"), "mock-secret-key");

  if (path.endsWith("/symbol_search")) {
    calls.search += 1;
    return new Response(JSON.stringify({
      data: [
        {
          symbol: "AAPL",
          instrument_name: "Apple Inc.",
          exchange: "NASDAQ",
          mic_code: "XNAS",
          country: "United States",
          currency: "USD",
          instrument_type: "Common Stock",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (path.endsWith("/time_series")) {
    calls.candles += 1;
    return new Response(JSON.stringify({
      values: [
        {
          datetime: "2026-09-19 10:00:00",
          open: "200",
          high: "202",
          low: "199",
          close: "201",
          volume: "100000",
        },
        {
          datetime: "2026-09-19 11:00:00",
          open: "201",
          high: "204",
          low: "200",
          close: "203",
          volume: "120000",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (path.endsWith("/quote")) {
    const requested = url.searchParams.get("symbol") ?? "";
    if (requested.includes(",")) {
      calls.batch += 1;
      return new Response(JSON.stringify({
        AAPL: {
          symbol: "AAPL",
          currency: "USD",
          timestamp: 1789800000,
          last_quote_at: 1789800300,
          open: "200",
          high: "205",
          low: "198",
          close: "203",
          previous_close: "199",
          change: "4",
          percent_change: "2.01005",
          volume: "150000",
          is_market_open: true,
          is_extended_hours: false,
        },
        NVDA: {
          symbol: "NVDA",
          currency: "USD",
          timestamp: 1789800000,
          last_quote_at: 1789800300,
          open: "170",
          high: "175",
          low: "169",
          close: "174",
          previous_close: "171",
          change: "3",
          percent_change: "1.7543",
          volume: "250000",
          is_market_open: true,
          is_extended_hours: false,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    calls.quote += 1;
    return new Response(JSON.stringify({
      symbol: requested,
      currency: "USD",
      timestamp: 1789800000,
      last_quote_at: 1789800300,
      open: "200",
      high: "205",
      low: "198",
      close: "203",
      previous_close: "199",
      change: "4",
      percent_change: "2.01005",
      volume: "150000",
      is_market_open: true,
      is_extended_hours: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ status: "error", message: "Unknown mock route" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};

try {
  const provider = new TwelveDataMarketDataProvider("mock-secret-key");

  const aapl = {
    id: "XNAS:AAPL",
    ticker: "AAPL",
    providerSymbol: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  };

  const nvda = {
    id: "XNAS:NVDA",
    ticker: "NVDA",
    providerSymbol: "NVDA",
    name: "NVIDIA Corp.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  };

  const [searchOne, searchTwo] = await Promise.all([
    provider.searchSymbols("apple"),
    provider.searchSymbols("apple"),
  ]);
  assert.equal(searchOne[0]?.ticker, "AAPL");
  assert.equal(searchTwo[0]?.micCode, "XNAS");
  assert.equal(calls.search, 1, "Concurrent identical searches should coalesce into one provider request");

  const [candlesOne, candlesTwo] = await Promise.all([
    provider.getCandles(aapl, "1h", 120),
    provider.getCandles(aapl, "1h", 120),
  ]);
  assert.equal(candlesOne.length, 2);
  assert.equal(candlesTwo[1]?.close, 203);
  assert.ok(candlesOne[0].time < candlesOne[1].time);
  assert.equal(calls.candles, 1, "Concurrent identical candle loads should coalesce");

  const [quoteOne, quoteTwo] = await Promise.all([
    provider.getQuote(aapl),
    provider.getQuote(aapl),
  ]);
  assert.equal(quoteOne.price, 203);
  assert.equal(quoteOne.timestamp, 1789800300, "last_quote_at must win over the quote interval-open timestamp");
  assert.equal(quoteOne.timestampKind, "last-quote");
  assert.equal(quoteTwo.isMarketOpen, true);
  assert.equal(calls.quote, 1, "Concurrent identical quotes should coalesce");

  await provider.getQuote(aapl);
  assert.equal(calls.quote, 1, "Warm quote cache should avoid another provider request");

  const [batchOne, batchTwo] = await Promise.all([
    provider.getQuotes([aapl, nvda]),
    provider.getQuotes([aapl, nvda]),
  ]);
  assert.equal(batchOne.length, 2);
  assert.equal(batchTwo.find((item) => item.symbol.ticker === "NVDA")?.quote.price, 174);
  assert.equal(calls.batch, 1, "Concurrent identical batches should coalesce");

  await provider.getQuote(nvda);
  assert.equal(
    calls.quote,
    1,
    "Batch results should warm the per-symbol quote cache",
  );

  assert.equal(provider.getStatus().mode, "provider");
  assert.ok(provider.getStatus().message?.includes("caching"));

  console.log(
    `Twelve Data adapter smoke passed: search=${calls.search}, candles=${calls.candles}, quote=${calls.quote}, batch=${calls.batch}`,
  );
} finally {
  globalThis.fetch = originalFetch;
}
