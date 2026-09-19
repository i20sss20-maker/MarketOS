import assert from "node:assert/strict";
import {
  defaultBacktestConfig,
  runBacktest,
  strategyCatalog,
} from "../packages/strategy-core/dist/index.js";

function buildSyntheticCandles(count = 360) {
  const candles = [];
  let previousClose = 100;

  for (let index = 0; index < count; index += 1) {
    const trend = index * 0.035;
    const cycle = Math.sin(index / 7.5) * 7.5;
    const pulse = Math.sin(index / 2.7) * 1.1;
    const close = 100 + trend + cycle + pulse;
    const open = previousClose;
    const high = Math.max(open, close) + 0.45;
    const low = Math.min(open, close) - 0.45;

    candles.push({
      time: 1_700_000_000 + index * 3600,
      open,
      high,
      low,
      close,
      volume: 100_000 + Math.round((1 + Math.sin(index / 5)) * 45_000),
    });

    previousClose = close;
  }

  return candles;
}

const candles = buildSyntheticCandles();

assert.equal(strategyCatalog.length, 3, "Strategy catalog should expose three starter strategies");

const sma = runBacktest(candles, {
  ...defaultBacktestConfig,
  strategy: "sma-cross",
  fastPeriod: 5,
  slowPeriod: 20,
  startingCapital: 10_000,
  commissionBps: 5,
  slippageBps: 2,
});

assert.ok(sma.trades.length > 0, "SMA Cross should produce trades on the synthetic cycle");
assert.ok(Number.isFinite(sma.metrics.totalReturnPercent));
assert.ok(Number.isFinite(sma.metrics.maxDrawdownPercent));
assert.ok(sma.metrics.maxDrawdownPercent >= 0);
assert.ok(sma.metrics.exposurePercent >= 0 && sma.metrics.exposurePercent <= 100);
assert.equal(
  sma.metrics.winningTrades + sma.metrics.losingTrades,
  sma.metrics.totalTrades,
  "Win/loss counts must reconcile with total trades",
);
assert.ok(sma.equityCurve.length > 0, "Backtest should produce an equity curve");

const rsi = runBacktest(candles, {
  ...defaultBacktestConfig,
  strategy: "rsi-reversion",
  rsiPeriod: 7,
  rsiEntry: 35,
  rsiExit: 60,
  commissionBps: 5,
  slippageBps: 2,
});

assert.ok(rsi.trades.length > 0, "RSI Reversion should produce trades on the synthetic cycle");
assert.ok(Number.isFinite(rsi.metrics.endingCapital) && rsi.metrics.endingCapital > 0);

const breakout = runBacktest(candles, {
  ...defaultBacktestConfig,
  strategy: "breakout",
  breakoutPeriod: 8,
  breakoutExitPeriod: 5,
  commissionBps: 5,
  slippageBps: 2,
});

assert.ok(breakout.trades.length > 0, "Breakout should produce trades on the synthetic cycle");
assert.ok(Number.isFinite(breakout.metrics.buyHoldReturnPercent));

const zeroCost = runBacktest(candles, {
  ...defaultBacktestConfig,
  strategy: "sma-cross",
  fastPeriod: 5,
  slowPeriod: 20,
  commissionBps: 0,
  slippageBps: 0,
});

assert.ok(
  zeroCost.metrics.endingCapital >= sma.metrics.endingCapital,
  "Removing commission/slippage should not reduce ending capital for identical signals",
);

assert.throws(
  () => runBacktest(candles, {
    ...defaultBacktestConfig,
    strategy: "sma-cross",
    fastPeriod: 30,
    slowPeriod: 10,
  }),
  /Fast SMA period/,
);

assert.throws(
  () => runBacktest(candles.slice(0, 20), defaultBacktestConfig),
  /at least 25 candles/,
);

for (const result of [sma, rsi, breakout]) {
  for (const trade of result.trades) {
    assert.ok(trade.exitIndex >= trade.entryIndex);
    assert.ok(trade.entryPrice > 0 && trade.exitPrice > 0);
    assert.ok(Number.isFinite(trade.returnPercent));
    assert.ok(Number.isFinite(trade.pnl));
  }
}

console.log(
  [
    "Backtest smoke passed",
    `SMA trades=${sma.metrics.totalTrades}, return=${sma.metrics.totalReturnPercent.toFixed(2)}%`,
    `RSI trades=${rsi.metrics.totalTrades}, return=${rsi.metrics.totalReturnPercent.toFixed(2)}%`,
    `Breakout trades=${breakout.metrics.totalTrades}, return=${breakout.metrics.totalReturnPercent.toFixed(2)}%`,
  ].join(" | "),
);
