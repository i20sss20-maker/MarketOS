import assert from "node:assert/strict";
import {
  calculateCorrelationMatrix,
  calculatePairCorrelation,
  correlationBand,
  correlationDescription,
} from "../packages/correlation-core/dist/index.js";

function candlesFromReturns(returns, start = 100, startTime = 1_800_000_000) {
  const candles = [{
    time: startTime,
    open: start,
    high: start * 1.002,
    low: start * 0.998,
    close: start,
    volume: 100_000,
  }];

  let close = start;
  for (let index = 0; index < returns.length; index += 1) {
    const previous = close;
    close = close * Math.exp(returns[index]);
    candles.push({
      time: startTime + (index + 1) * 3600,
      open: previous,
      high: Math.max(previous, close) * 1.002,
      low: Math.min(previous, close) * 0.998,
      close,
      volume: 100_000 + index * 1_000,
    });
  }
  return candles;
}

const baseReturns = [
  0.01, -0.004, 0.015, 0.006, -0.009, 0.02, -0.003,
  0.012, 0.005, -0.011, 0.018, -0.006, 0.008, 0.013,
];

const a = candlesFromReturns(baseReturns, 100);
const b = candlesFromReturns(baseReturns, 200);
const c = candlesFromReturns(baseReturns.map((value) => -value), 150);
const constant = candlesFromReturns(new Array(baseReturns.length).fill(0.005), 80);

const positive = calculatePairCorrelation(a, b, 8);
assert.ok(positive.correlation !== null);
assert.ok(Math.abs(positive.correlation - 1) < 0.0001);
assert.equal(positive.observations, baseReturns.length);

const negative = calculatePairCorrelation(a, c, 8);
assert.ok(negative.correlation !== null);
assert.ok(Math.abs(negative.correlation + 1) < 0.0001);

const noVariance = calculatePairCorrelation(a, constant, 8);
assert.equal(noVariance.correlation, null);

const insufficient = calculatePairCorrelation(a.slice(0, 5), b.slice(0, 5), 8);
assert.equal(insufficient.correlation, null);
assert.ok(insufficient.observations < 8);

const matrix = calculateCorrelationMatrix([
  { id: "A", label: "AAA", candles: a },
  { id: "B", label: "BBB", candles: b },
  { id: "C", label: "CCC", candles: c },
  { id: "D", label: "DDD", candles: constant },
], 8);

assert.equal(matrix.series.length, 4);
assert.equal(matrix.cells.length, 16);
assert.equal(matrix.strongestPositive?.leftLabel, "AAA");
assert.equal(matrix.strongestPositive?.rightLabel, "BBB");
assert.ok(Math.abs((matrix.strongestPositive?.correlation ?? 0) - 1) < 0.0001);
assert.ok(Math.abs((matrix.strongestNegative?.correlation ?? 0) + 1) < 0.0001);
assert.ok(matrix.averageAbsoluteCorrelation !== null);

assert.equal(correlationBand(0.9), "positive-strong");
assert.equal(correlationBand(-0.9), "negative-strong");
assert.equal(correlationBand(0.1), "neutral");
assert.equal(correlationBand(null), "na");
assert.ok(correlationDescription(0.9).includes("موجب"));
assert.ok(correlationDescription(-0.9).includes("سالب"));
assert.equal(correlationDescription(null), "بيانات غير كافية");

console.log(
  `Correlation smoke passed: positive=${positive.correlation}, negative=${negative.correlation}, pairs=${matrix.pairs.length}`
);
