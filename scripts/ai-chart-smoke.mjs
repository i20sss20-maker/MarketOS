import assert from "node:assert/strict";
import { analyzeChartContext, sanitizeChartContext } from "../services/api/dist/src/ai/localChartEngine.js";

const candles = Array.from({ length: 60 }, (_, index) => {
  const base = 100 + index * 0.2;
  return {
    time: 1_700_000_000 + index * 3600,
    open: base,
    high: base + 1,
    low: base - 1,
    close: base + 0.4,
    volume: 100_000 + index * 1_000,
  };
});

const context = sanitizeChartContext({
  symbol: {
    id: "NASDAQ:TEST",
    ticker: "TEST",
    name: "Test Corp",
    exchange: "NASDAQ",
    assetClass: "stock",
    currency: "USD",
  },
  timeframe: "1h",
  visibleCandles: candles,
  indicators: ["sma20", "rsi14"],
  userDrawings: [
    { type: "horizontal", price: 110 },
    {
      type: "trend",
      points: [
        { time: candles[20].time, price: candles[20].low },
        { time: candles[50].time, price: candles[50].high },
      ],
    },
    {
      type: "measure",
      points: [
        { time: candles[30].time, price: candles[30].close },
        { time: candles[40].time, price: candles[40].close },
      ],
    },
    {
      type: "text",
      point: { time: candles[45].time, price: candles[45].high },
      text: "اختبار ملاحظة",
    },
  ],
  prompt: "Explain the chart",
});

const analysis = analyzeChartContext(context);

assert.equal(analysis.symbol, "TEST");
assert.equal(analysis.timeframe, "1h");
assert.equal(analysis.drawingCount, 4);
assert.deepEqual(analysis.activeIndicators, ["sma20", "rsi14"]);
assert.ok(analysis.metrics.lastPrice > 0);
assert.ok(analysis.metrics.rangeHigh20 > analysis.metrics.rangeLow20);
assert.ok(
  Number.isFinite(
    analysis.metrics.ema20,
  ),
);
assert.ok(
  Number.isFinite(
    analysis.metrics.ema50,
  ),
);
assert.ok(
  Number.isFinite(
    analysis.metrics.rsi14,
  ),
);
assert.ok(
  Number.isFinite(
    analysis.metrics.atr14,
  ),
);
assert.ok(
  Number.isFinite(
    analysis.metrics.atrPercent,
  ),
);
assert.ok(
  Number.isFinite(
    analysis.metrics.macdHistogram,
  ),
);
assert.ok(analysis.observations.length >= 7);
assert.ok(analysis.observations.some((item) => item.includes("قياس")));
assert.ok(analysis.observations.some((item) => item.includes("ملاحظة")));
assert.ok(analysis.summary.includes("TEST"));

console.log(`AI chart smoke test passed: ${analysis.summary}`);
