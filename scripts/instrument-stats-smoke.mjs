import assert from "node:assert/strict";
import { calculateInstrumentStats } from "../packages/market-stats-core/dist/index.js";

const candles = Array.from({ length: 60 }, (_, index) => {
  const close = 100 + index;
  return {
    time: 1_800_000_000 + index * 3600,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100_000 + index * 1_000,
  };
});

const stats = calculateInstrumentStats(candles);

assert.equal(stats.lastPrice, 159);
assert.equal(stats.previousClose, 158);
assert.equal(stats.open, 158.5);
assert.equal(stats.high, 160);
assert.equal(stats.low, 158);
assert.equal(stats.volume, 159_000);

assert.equal(stats.sma20, 149.5);
assert.equal(stats.sma50, 134.5);
assert.ok(stats.distanceFromSma20Percent > 6);
assert.ok(stats.distanceFromSma50Percent > 18);

assert.equal(stats.atr14, 2);
assert.ok(stats.atr14Percent > 1.2 && stats.atr14Percent < 1.3);
assert.ok(
  stats.realizedVolatility20Percent !== null &&
  stats.realizedVolatility20Percent > 0,
);

assert.equal(stats.averageVolume20, 149_500);
assert.ok(
  stats.latestVolumeRatio !== null &&
  stats.latestVolumeRatio > 1 &&
  stats.latestVolumeRatio < 1.1,
);

assert.equal(stats.upBars20, 20);
assert.equal(stats.downBars20, 0);
assert.equal(stats.unchangedBars20, 0);

const oneBar = stats.performance.find((item) => item.bars === 1);
const fiveBars = stats.performance.find((item) => item.bars === 5);
const twentyBars = stats.performance.find((item) => item.bars === 20);
const fiftyBars = stats.performance.find((item) => item.bars === 50);

assert.ok(oneBar?.changePercent !== null);
assert.ok(fiveBars?.changePercent !== null);
assert.ok(twentyBars?.changePercent !== null);
assert.ok(fiftyBars?.changePercent !== null);
assert.ok((oneBar?.changePercent ?? 0) > 0);
assert.ok((fiftyBars?.changePercent ?? 0) > (twentyBars?.changePercent ?? 0));

assert.ok(
  stats.rangePosition20Percent !== null &&
  stats.rangePosition20Percent > 90 &&
  stats.rangePosition20Percent < 100,
);

const quoteStats = calculateInstrumentStats(candles, {
  symbol: "TEST",
  price: 160,
  open: 155,
  high: 161,
  low: 154,
  previousClose: 150,
  percentChange: 6.6667,
  volume: 300_000,
  timestamp: candles[candles.length - 1].time,
  source: "test",
});

assert.equal(quoteStats.lastPrice, 160);
assert.equal(quoteStats.previousClose, 150);
assert.equal(quoteStats.open, 155);
assert.equal(quoteStats.high, 161);
assert.equal(quoteStats.low, 154);
assert.equal(quoteStats.volume, 300_000);
assert.equal(quoteStats.quoteChangePercent, 6.6667);
assert.equal(quoteStats.rangePosition20Percent, 100);
assert.ok(
  quoteStats.latestVolumeRatio !== null &&
  quoteStats.latestVolumeRatio > 2,
);

const insufficient = calculateInstrumentStats(candles.slice(0, 10));
assert.equal(insufficient.sma20, null);
assert.equal(insufficient.sma50, null);
assert.equal(insufficient.atr14, null);
assert.equal(insufficient.realizedVolatility20Percent, null);
assert.equal(
  insufficient.performance.find((item) => item.bars === 20)?.changePercent,
  null,
);
assert.equal(
  insufficient.performance.find((item) => item.bars === 50)?.changePercent,
  null,
);

console.log(
  `Instrument stats smoke passed: last=${stats.lastPrice}, SMA20=${stats.sma20}, ATR14=${stats.atr14}, volumeRatio=${stats.latestVolumeRatio}`,
);
