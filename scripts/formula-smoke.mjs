import assert from "node:assert/strict";
import {
  evaluateFormula,
  validateFormula,
} from "../packages/formula-core/dist/index.js";

const candles = Array.from({ length: 120 }, (_, index) => {
  const close = 100 + index * 0.08 + Math.sin(index / 6) * 3;
  const open = close - Math.cos(index / 5) * 0.6;
  return {
    time: 1_700_000_000 + index * 3600,
    open,
    high: Math.max(open, close) + 0.8,
    low: Math.min(open, close) - 0.8,
    close,
    volume: 100_000 + index * 750 + Math.round(Math.sin(index / 4) * 10_000),
  };
});

assert.deepEqual(validateFormula("EMA(CLOSE, 20)"), { ok: true });
assert.deepEqual(validateFormula("RSI(14)"), { ok: true });
assert.deepEqual(validateFormula("ATR(14) / CLOSE * 100"), { ok: true });

assert.equal(validateFormula("SMA(CLOSE, CLOSE)").ok, false);
assert.equal(validateFormula("UNKNOWN + 1").ok, false);
assert.equal(validateFormula("EVAL(CLOSE)").ok, false);
assert.equal(validateFormula("CLOSE;process.exit()").ok, false);
assert.equal(validateFormula("SMA(CLOSE, 9999)").ok, false);

const sma = evaluateFormula(candles, "SMA(CLOSE, 5)");
assert.equal(sma.length, candles.length - 4);
const expectedFirstSma =
  candles.slice(0, 5).reduce((sum, candle) => sum + candle.close, 0) / 5;
assert.ok(Math.abs(sma[0].value - expectedFirstSma) < 1e-9);

const ema = evaluateFormula(candles, "EMA(CLOSE, 20)");
assert.ok(ema.length > 90);
assert.ok(ema.every((point) => Number.isFinite(point.value)));

const rsi = evaluateFormula(candles, "RSI(14)");
assert.equal(rsi.length, candles.length - 14);
assert.ok(rsi.every((point) => point.value >= 0 && point.value <= 100));

const atrPercent = evaluateFormula(candles, "ATR(14) / CLOSE * 100");
assert.ok(atrPercent.length > 90);
assert.ok(atrPercent.every((point) => point.value >= 0));

const volumeRatio = evaluateFormula(candles, "VOLUME / SMA(VOLUME, 20)");
assert.ok(volumeRatio.length > 90);
assert.ok(volumeRatio.every((point) => point.value > 0));

const spread = evaluateFormula(
  candles,
  "(CLOSE - SMA(CLOSE, 20)) / SMA(CLOSE, 20) * 100",
);
assert.ok(spread.length > 90);

const minMax = evaluateFormula(candles, "MAX(LOW, MIN(HIGH, CLOSE))");
assert.equal(minMax.length, candles.length);
for (let index = 0; index < minMax.length; index += 1) {
  assert.ok(minMax[index].value >= candles[index].low);
  assert.ok(minMax[index].value <= candles[index].high);
}

const precedence = evaluateFormula(candles, "CLOSE - OPEN * 2");
const lastIndex = candles.length - 1;
assert.ok(
  Math.abs(
    precedence[precedence.length - 1].value -
      (candles[lastIndex].close - candles[lastIndex].open * 2),
  ) < 1e-9,
  "Multiplication must bind before subtraction",
);

const zeroDivision = evaluateFormula(candles, "1 / (CLOSE - CLOSE)");
assert.equal(zeroDivision.length, 0, "Division by zero should yield no plotted points");

console.log(
  `Formula smoke passed: SMA=${sma.length}, EMA=${ema.length}, RSI=${rsi.length}, ATR%=${atrPercent.length}, VolumeRatio=${volumeRatio.length}`,
);
