import assert from "node:assert/strict";
import { DemoMarketDataProvider } from "../services/api/dist/src/providers/demoProvider.js";

const provider = new DemoMarketDataProvider("smoke-test");
const symbols = await provider.searchSymbols("aramco");
assert.ok(symbols.length > 0, "Saudi Aramco should be discoverable in demo search");

const symbol = symbols[0];
const candles = await provider.getCandles(symbol, "1h", 120);
assert.equal(candles.length, 120, "Demo provider should return requested candle count");
assert.ok(candles.every((candle, index) => index === 0 || candle.time > candles[index - 1].time), "Candles must be ascending");
assert.ok(candles.every((candle) => candle.high >= candle.low), "Each candle high must be >= low");

const quote = await provider.getQuote(symbol);
assert.ok(Number.isFinite(quote.price) && quote.price > 0, "Quote price should be positive");

const catalog = await provider.searchSymbols("");
const batch = await provider.getQuotes(catalog);
assert.equal(batch.length, catalog.length, "Batch quotes should return every demo catalog symbol");
assert.ok(
  batch.every((item) => Number.isFinite(item.quote.price) && item.quote.price > 0),
  "Every batch quote should have a positive price",
);
assert.equal(provider.getStatus().mode, "demo");

console.log(
  `Market data smoke test passed: ${symbol.ticker}, ${candles.length} candles, quote ${quote.price}, batch ${batch.length}`,
);
