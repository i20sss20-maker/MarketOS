import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "services/api/src/ai/forecastCalibration.ts",
  "utf8",
);

const compiled = ts.transpileModule(
  source,
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(compiled).toString("base64");

const {
  buildForecastCalibration,
} = await import(moduleUrl);

const candles = [];
for (let index = 0; index < 220; index += 1) {
  const baseline =
    100 +
    index * 0.11 +
    Math.sin(index / 4) * 1.7 +
    Math.sin(index / 15) * 0.8;
  const open =
    baseline -
    Math.sin(index / 3) * 0.35;
  const close =
    baseline +
    Math.cos(index / 5) * 0.28;

  candles.push({
    time: 1_700_000_000 + index * 86_400,
    open,
    high: Math.max(open, close) + 0.8,
    low: Math.min(open, close) - 0.8,
    close,
    volume: 1_000_000 + index * 1200,
  });
}

const result =
  buildForecastCalibration({
    timeframe: "1d",
    candles,
    lookaheadBars: 5,
  });

assert.ok(result);
assert.equal(
  result.method,
  "historical-analog",
);
assert.equal(
  result.timeframe,
  "1d",
);
assert.equal(
  result.lookaheadBars,
  5,
);
assert.ok(
  result.sampleSize >= 8,
);
assert.ok(
  result.similarityScore >= 0 &&
  result.similarityScore <= 100,
);
assert.ok(
  result.directionalHitRate >= 0 &&
  result.directionalHitRate <= 100,
);
assert.equal(
  result.bullProbability +
    result.baseProbability +
    result.bearProbability,
  100,
);
assert.ok(
  result.blendWeight > 0 &&
  result.blendWeight <= 0.5,
);

const forecastEngine = readFileSync(
  "services/api/src/ai/analystForecastEngine.ts",
  "utf8",
);
const endpoint = readFileSync(
  "services/api/src/functions/analystForecast.ts",
  "utf8",
);
const view = readFileSync(
  "apps/web/src/components/AnalystForecastView.tsx",
  "utf8",
);

assert.match(
  forecastEngine,
  /marketos-forecast-v3/,
);
assert.match(
  forecastEngine,
  /blendScenarioProbabilities/,
);
assert.match(
  endpoint,
  /buildForecastCalibration/,
);
assert.match(
  view,
  /HISTORICAL ANALOG/,
);

console.log(
  "Analyst calibration smoke passed:",
  JSON.stringify({
    samples: result.sampleSize,
    hitRate: result.directionalHitRate,
    similarity: result.similarityScore,
    probabilities: [
      result.bullProbability,
      result.baseProbability,
      result.bearProbability,
    ],
  }),
);
