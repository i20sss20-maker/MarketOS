import assert from "node:assert/strict";
import { buildMultiTimeframeAnalysis } from "../services/api/dist/src/ai/multiTimeframeEngine.js";

function analysis(timeframe, change20, distanceFromSma20, rangeLow, rangeHigh) {
  return {
    engine: "local-chart-engine",
    generatedAt: 1_800_000_000,
    symbol: "TEST",
    timeframe,
    summary: `TEST ${timeframe}`,
    observations: [],
    metrics: {
      lastPrice: 110,
      change20,
      rangeLow20: rangeLow,
      rangeHigh20: rangeHigh,
      sma20: 105,
      distanceFromSma20,
      realizedRangePercent20: ((rangeHigh - rangeLow) / rangeLow) * 100,
    },
    activeIndicators: ["sma20"],
    drawingCount: 0,
  };
}

const requested = ["15m", "1h", "4h", "1d"];

const aligned = buildMultiTimeframeAnalysis(
  "TEST",
  requested,
  [
    { timeframe: "15m", analysis: analysis("15m", 1.8, 0.8, 99, 111) },
    { timeframe: "1h", analysis: analysis("1h", 2.4, 1.2, 97, 114) },
    { timeframe: "4h", analysis: analysis("4h", 3.1, 1.8, 94, 118) },
    { timeframe: "1d", analysis: analysis("1d", 0.4, 0.1, 90, 121) },
  ],
);

assert.equal(aligned.alignment, "up");
assert.equal(aligned.upCount, 3);
assert.equal(aligned.sidewaysCount, 1);
assert.equal(aligned.downCount, 0);
assert.equal(aligned.rangeLow, 90);
assert.equal(aligned.rangeHigh, 121);
assert.equal(aligned.items.length, 4);
assert.ok(aligned.summary.includes("3/4"));
assert.ok(aligned.observations.some((line) => line.includes("15M")));

const mixed = buildMultiTimeframeAnalysis(
  "TEST",
  requested,
  [
    { timeframe: "15m", analysis: analysis("15m", 2.2, 1, 100, 112) },
    { timeframe: "1h", analysis: analysis("1h", -2.4, -1.1, 96, 115) },
    { timeframe: "4h", analysis: analysis("4h", 0.3, 0.1, 92, 119) },
  ],
  [{ timeframe: "1d", error: "mock unavailable" }],
);

assert.equal(mixed.alignment, "mixed");
assert.equal(mixed.upCount, 1);
assert.equal(mixed.downCount, 1);
assert.equal(mixed.sidewaysCount, 1);
assert.equal(mixed.failures.length, 1);
assert.ok(mixed.observations.some((line) => line.includes("تعذر تحليل")));

assert.throws(
  () => buildMultiTimeframeAnalysis("TEST", requested, [], []),
  /No timeframe analysis is available/,
);

console.log(
  `Multi-timeframe smoke passed: alignment=${aligned.alignment}, mixed=${mixed.alignment}, range=${aligned.rangeLow}-${aligned.rangeHigh}`,
);
