import assert from "node:assert/strict";
import {
  applySmartScreener,
  parseSmartScreenerQuery,
} from "../packages/screener-core/dist/index.js";

const items = [
  {
    symbol: { id: "XNAS:AAPL", ticker: "AAPL", name: "Apple", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
    quote: { symbol: "AAPL", price: 210, percentChange: 2.6, volume: 1_500_000, timestamp: 1, source: "test" },
  },
  {
    symbol: { id: "XNAS:NVDA", ticker: "NVDA", name: "NVIDIA", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
    quote: { symbol: "NVDA", price: 180, percentChange: 4.2, volume: 3_200_000, timestamp: 1, source: "test" },
  },
  {
    symbol: { id: "XSAU:2222", ticker: "2222", name: "Aramco", exchange: "Saudi Exchange", assetClass: "stock", currency: "SAR" },
    quote: { symbol: "2222", price: 28.5, percentChange: 0.8, volume: 900_000, timestamp: 1, source: "test" },
  },
  {
    symbol: { id: "CRYPTO:BTCUSD", ticker: "BTC/USD", name: "Bitcoin", exchange: "Crypto", assetClass: "crypto", currency: "USD" },
    quote: { symbol: "BTC/USD", price: 65_000, percentChange: -4.4, volume: 7_000_000, timestamp: 1, source: "test" },
  },
  {
    symbol: { id: "FX:EURUSD", ticker: "EUR/USD", name: "Euro Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
    quote: { symbol: "EUR/USD", price: 1.1, percentChange: -0.2, volume: 400_000, timestamp: 1, source: "test" },
  },
];

const arabic = parseSmartScreenerQuery("الأسهم الصاعدة أكثر من 2% والحجم فوق 1M");
assert.ok(arabic.recognized.length >= 3);
assert.deepEqual(arabic.rule.assetClasses, ["stock"]);
assert.equal(arabic.rule.minChangePercent, 2);
assert.equal(arabic.rule.minVolume, 1_000_000);

const arabicResults = applySmartScreener(items, arabic.rule);
assert.deepEqual(arabicResults.map((item) => item.symbol.ticker), ["AAPL", "NVDA"]);

const crypto = parseSmartScreenerQuery("crypto down below -3%");
assert.deepEqual(crypto.rule.assetClasses, ["crypto"]);
assert.equal(crypto.rule.maxChangePercent, -3);
const cryptoResults = applySmartScreener(items, crypto.rule);
assert.deepEqual(cryptoResults.map((item) => item.symbol.ticker), ["BTC/USD"]);

const volumeTop = parseSmartScreenerQuery("الحجم فوق 500K أعلى 2");
assert.equal(volumeTop.rule.minVolume, 500_000);
assert.equal(volumeTop.rule.limit, 2);
assert.equal(volumeTop.rule.sortBy, "change");
assert.equal(volumeTop.rule.sortDirection, "desc");

const volumeTopResults = applySmartScreener(items, volumeTop.rule);
assert.deepEqual(volumeTopResults.map((item) => item.symbol.ticker), ["NVDA", "AAPL"]);

const price = parseSmartScreenerQuery("السعر تحت 100 والحجم فوق 500K");
assert.equal(price.rule.maxPrice, 100);
assert.equal(price.rule.minVolume, 500_000);
const priceResults = applySmartScreener(items, price.rule);
assert.deepEqual(priceResults.map((item) => item.symbol.ticker), ["2222"]);

const arabicDigits = parseSmartScreenerQuery("الأسهم فوق ٢% والحجم فوق ١M");
assert.equal(arabicDigits.rule.minChangePercent, 2);
assert.equal(arabicDigits.rule.minVolume, 1_000_000);

const lowest = parseSmartScreenerQuery("bottom 2");
assert.equal(lowest.rule.sortDirection, "asc");
assert.equal(lowest.rule.limit, 2);
const lowestResults = applySmartScreener(items, lowest.rule);
assert.deepEqual(lowestResults.map((item) => item.symbol.ticker), ["BTC/USD", "EUR/USD"]);

const unknown = parseSmartScreenerQuery("وش الأخبار اليوم");
assert.equal(unknown.recognized.length, 0);
assert.ok(unknown.ignored.length > 0);

console.log(
  `Smart Screener smoke passed: Arabic=${arabicResults.length}, crypto=${cryptoResults.length}, top=${volumeTopResults.length}`,
);
