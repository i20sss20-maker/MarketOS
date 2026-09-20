import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/analystRadar.ts",
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
  analystRadarClarity,
  buildAnalystRadarDelta,
  buildAnalystRadarDeltas,
  buildAnalystRadarItem,
  prepareRadarSymbols,
  rankAnalystRadar,
} = await import(moduleUrl);

function forecast({
  ticker,
  top,
  confidence,
  risk = "medium",
  mode = "provider",
  calibrated = true,
}) {
  const probabilities =
    top === "bull"
      ? {
          bull: 64,
          base: 23,
          bear: 13,
        }
      : top === "bear"
        ? {
            bull: 12,
            base: 24,
            bear: 64,
          }
        : {
            bull: 25,
            base: 51,
            bear: 24,
          };

  return {
    engine: "marketos-forecast-v2",
    generatedAt: 1_800_000_000,
    symbol: {
      id: `TEST:${ticker}`,
      ticker,
      name: ticker,
      exchange: "TEST",
      assetClass: "stock",
      currency: "USD",
    },
    dataProvider: "test-provider",
    dataMode: mode,
    timeframes: [
      "1h",
      "4h",
      "1d",
      "1w",
    ],
    bias:
      top === "bull"
        ? "bullish"
        : top === "bear"
          ? "bearish"
          : "neutral",
    confidence,
    risk,
    regime: "trend",
    horizon: "عدة أيام",
    referencePrice: 100,
    support: 95,
    resistance: 105,
    expectedRangeLow: 92,
    expectedRangeHigh: 108,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "صاعد",
        probability:
          probabilities.bull,
        targetLow: 105,
        targetHigh: 108,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "base",
        label: "محايد",
        probability:
          probabilities.base,
        targetLow: 98,
        targetHigh: 102,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "bear",
        label: "هابط",
        probability:
          probabilities.bear,
        targetLow: 92,
        targetHigh: 95,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
    ],
    calibration: calibrated
      ? {
          method:
            "historical-analog",
          timeframe: "1d",
          lookaheadBars: 5,
          sampleSize: 32,
          comparableSamples: 24,
          currentSignal: 0.5,
          outcomeThresholdPercent: 1.2,
          directionalHitRate: 63,
          averageForwardReturn: 1.7,
          medianForwardReturn: 1.4,
          bullProbability:
            probabilities.bull,
          baseProbability:
            probabilities.base,
          bearProbability:
            probabilities.bear,
          similarityScore: 79,
          reliability: "high",
          blendWeight: 0.42,
        }
      : undefined,
    catalysts: [],
    evidence: [],
    uncertaintyNote: "test",
  };
}

const symbols = [
  {
    id: "TEST:A",
    ticker: "A",
    name: "A",
    exchange: "TEST",
    assetClass: "stock",
    currency: "USD",
  },
  {
    id: "TEST:B",
    ticker: "B",
    name: "B",
    exchange: "TEST",
    assetClass: "stock",
    currency: "USD",
  },
  {
    id: "TEST:C",
    ticker: "C",
    name: "C",
    exchange: "TEST",
    assetClass: "stock",
    currency: "USD",
  },
];

const prepared =
  prepareRadarSymbols(
    symbols[1],
    symbols,
    2,
  );

assert.equal(
  prepared.length,
  2,
);
assert.equal(
  prepared[0].id,
  "TEST:B",
);
assert.equal(
  new Set(
    prepared.map(
      (item) => item.id,
    ),
  ).size,
  prepared.length,
);

const strong =
  forecast({
    ticker: "A",
    top: "bull",
    confidence: 78,
    risk: "low",
  });
const weaker =
  forecast({
    ticker: "B",
    top: "base",
    confidence: 58,
    risk: "high",
    calibrated: false,
  });

assert.ok(
  analystRadarClarity(
    strong,
  ) >
  analystRadarClarity(
    weaker,
  ),
);

const ranked =
  rankAnalystRadar([
    buildAnalystRadarItem(
      symbols[1],
      weaker,
    ),
    buildAnalystRadarItem(
      symbols[0],
      strong,
    ),
  ]);

assert.equal(
  ranked[0].symbol.id,
  "TEST:A",
);
assert.equal(
  ranked[0].direction,
  "bull",
);
assert.equal(
  ranked[0].directionProbability,
  64,
);

const previousStrong =
  buildAnalystRadarItem(
    symbols[0],
    forecast({
      ticker: "A",
      top: "bull",
      confidence: 60,
      risk: "medium",
    }),
  );

const strengthening =
  buildAnalystRadarDelta(
    ranked[0],
    previousStrong,
  );

assert.equal(
  strengthening.change,
  "strengthening",
);
assert.equal(
  strengthening.directionChanged,
  false,
);
assert.ok(
  strengthening.clarityDelta > 0,
);

const previousBear =
  buildAnalystRadarItem(
    symbols[0],
    forecast({
      ticker: "A",
      top: "bear",
      confidence: 72,
    }),
  );

const reversal =
  buildAnalystRadarDelta(
    ranked[0],
    previousBear,
  );

assert.equal(
  reversal.change,
  "reversal",
);
assert.equal(
  reversal.directionChanged,
  true,
);
assert.equal(
  reversal.previousDirection,
  "bear",
);

const deltas =
  buildAnalystRadarDeltas(
    ranked,
    [previousStrong],
  );

assert.equal(
  deltas.length,
  ranked.length,
);
assert.equal(
  deltas[0].change,
  "strengthening",
);

const panel = readFileSync(
  "apps/web/src/components/CommercialAiPanel.tsx",
  "utf8",
);
const app = readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);
const view = readFileSync(
  "apps/web/src/components/AnalystRadarView.tsx",
  "utf8",
);

assert.match(
  panel,
  /tab === "radar"/,
);
assert.match(
  panel,
  /AnalystRadarView/,
);
assert.match(
  app,
  /radarSymbols=\{watchlist\}/,
);
assert.match(
  view,
  /MARKETOS RADAR/,
);
assert.match(
  view,
  /getAnalystForecast/,
);
assert.match(
  view,
  /analyst-radar-change/,
);
assert.match(
  view,
  /candidateSignature/,
);

console.log(
  "Analyst Radar smoke passed:",
  JSON.stringify({
    prepared:
      prepared.map(
        (item) => item.ticker,
      ),
    top:
      ranked[0].symbol.ticker,
    clarity:
      ranked[0].clarity,
  }),
);
