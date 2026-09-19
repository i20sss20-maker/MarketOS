import assert from "node:assert/strict";
import { TwelveDataMarketDataProvider } from "../services/api/dist/src/providers/twelveDataProvider.js";

const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
if (!apiKey) {
  throw new Error("TWELVE_DATA_API_KEY is required for the live provider integration check.");
}

const provider = new TwelveDataMarketDataProvider(apiKey);

function requireMatch(symbols, predicate, label) {
  const match = symbols.find(predicate);
  assert.ok(match, label);
  return match;
}

console.log("Running live Twelve Data integration check...");

const appleResults = await provider.searchSymbols("Apple");
const aapl = requireMatch(
  appleResults,
  (symbol) => symbol.ticker.toUpperCase() === "AAPL",
  "AAPL must be discoverable through symbol_search.",
);

const aaplQuote = await provider.getQuote(aapl);
assert.ok(Number.isFinite(aaplQuote.price) && aaplQuote.price > 0, "AAPL quote must have a positive price.");

const aaplCandles = await provider.getCandles(aapl, "1d", 5);
assert.ok(aaplCandles.length > 0, "AAPL daily time series must return at least one candle.");
assert.ok(
  aaplCandles.every((candle, index) => index === 0 || candle.time > aaplCandles[index - 1].time),
  "AAPL candles must be ascending.",
);

console.log(
  `US check passed: AAPL quote=${aaplQuote.price}, candles=${aaplCandles.length}, source=${aaplQuote.source}`,
);

const elmResults = await provider.searchSymbols("7203");
const elm = requireMatch(
  elmResults,
  (symbol) =>
    symbol.ticker.replace(/\s+/g, "") === "7203" &&
    symbol.micCode?.toUpperCase() === "XSAU",
  "Saudi trial symbol 7203 must resolve to MIC XSAU.",
);

const elmCandles = await provider.getCandles(elm, "1d", 5);
assert.ok(
  elmCandles.length > 0,
  "XSAU:7203 daily time series must return at least one candle. Check Saudi Exchange entitlement on the Twelve Data plan.",
);

console.log(
  `Saudi trial check passed: XSAU:7203 candles=${elmCandles.length}`,
);

const aramcoResults = await provider.searchSymbols("2222");
const aramco = requireMatch(
  aramcoResults,
  (symbol) =>
    symbol.ticker.replace(/\s+/g, "") === "2222" &&
    symbol.micCode?.toUpperCase() === "XSAU",
  "Saudi Aramco 2222 must resolve to MIC XSAU.",
);

console.log(
  `Saudi symbol resolution passed: ${aramco.ticker} -> ${aramco.micCode} (${aramco.exchange})`,
);

console.log("Real provider integration check passed.");
