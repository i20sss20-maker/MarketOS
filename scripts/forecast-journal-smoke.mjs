import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/forecastJournal.ts",
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
  maturedForecastGroups,
  maturedForecastSymbols,
  resolveForecastJournalWithCandles,
  resolveForecastJournalWithPrice,
  updateForecastJournal,
  summarizeForecastJournal,
} = await import(moduleUrl);

function forecast({
  generatedAt,
  price,
  mode = "provider",
}) {
  return {
    engine: "marketos-forecast-v2",
    generatedAt,
    symbol: {
      id: "NASDAQ:TEST",
      ticker: "TEST",
      name: "Test Corp",
      exchange: "NASDAQ",
      assetClass: "stock",
      currency: "USD",
    },
    dataProvider: "test",
    dataMode: mode,
    timeframes: ["1h", "4h", "1d", "1w"],
    bias: "bullish",
    confidence: 68,
    risk: "medium",
    regime: "trend",
    horizon: "عدة أيام",
    referencePrice: price,
    support: price - 2,
    resistance: price + 2,
    expectedRangeLow: price - 4,
    expectedRangeHigh: price + 5,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "سيناريو صاعد",
        probability: 62,
        targetLow: price + 2,
        targetHigh: price + 5,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "base",
        label: "سيناريو محايد",
        probability: 24,
        targetLow: price - 1,
        targetHigh: price + 1,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "bear",
        label: "سيناريو هابط",
        probability: 14,
        targetLow: price - 5,
        targetHigh: price - 2,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
    ],
    calibration: {
      method: "historical-analog",
      timeframe: "1h",
      lookaheadBars: 2,
      sampleSize: 30,
      comparableSamples: 22,
      currentSignal: 0.5,
      outcomeThresholdPercent: 1,
      directionalHitRate: 63,
      averageForwardReturn: 1.7,
      medianForwardReturn: 1.4,
      bullProbability: 64,
      baseProbability: 22,
      bearProbability: 14,
      similarityScore: 78,
      reliability: "high",
      blendWeight: 0.42,
    },
    catalysts: [],
    evidence: [],
    uncertaintyNote: "test",
  };
}

let journal =
  updateForecastJournal(
    [],
    forecast({
      generatedAt: 1_800_000_000,
      price: 100,
    }),
  );

assert.equal(
  journal.length,
  1,
);
assert.equal(
  journal[0].status,
  "pending",
);
assert.equal(
  journal[0].expectedOutcome,
  "bull",
);
assert.equal(
  journal[0].symbol?.id,
  "NASDAQ:TEST",
);
assert.equal(
  journal[0].evaluationTimeframe,
  "1h",
);
assert.equal(
  journal[0].evaluationBars,
  2,
);

const dueAt =
  journal[0].dueAt;

const tooEarly =
  resolveForecastJournalWithPrice(
    journal,
    {
      symbolId:
        "NASDAQ:TEST",
      price: 103,
      timestamp:
        dueAt - 1,
      dataMode:
        "provider",
    },
  );

assert.equal(
  tooEarly[0].status,
  "pending",
);

const maturedSymbols =
  maturedForecastSymbols(
    journal,
    dueAt + 1,
    "provider",
  );

assert.equal(
  maturedSymbols.length,
  0,
);

const maturedGroups =
  maturedForecastGroups(
    journal,
    dueAt + 1,
    "provider",
  );

assert.equal(
  maturedGroups.length,
  1,
);
assert.equal(
  maturedGroups[0].symbol.id,
  "NASDAQ:TEST",
);
assert.equal(
  maturedGroups[0].timeframe,
  "1h",
);

const legacyRecords = [
  {
    ...journal[0],
    evaluationTimeframe:
      undefined,
    evaluationBars:
      undefined,
  },
];

const legacySymbols =
  maturedForecastSymbols(
    legacyRecords,
    dueAt + 1,
    "provider",
  );

assert.equal(
  legacySymbols[0]?.id,
  "NASDAQ:TEST",
);

const legacyResolved =
  resolveForecastJournalWithPrice(
    legacyRecords,
    {
      symbolId:
        "NASDAQ:TEST",
      price: 104,
      timestamp:
        dueAt + 60,
      dataMode:
        "provider",
    },
  );

assert.equal(
  legacyResolved[0].status,
  "resolved",
);
assert.equal(
  legacyResolved[0]
    .evaluationMethod,
  "quote",
);

const v2Records = [
  {
    ...journal[0],
    evaluationBars:
      undefined,
  },
];

const v2Resolved =
  resolveForecastJournalWithCandles(
    v2Records,
    {
      symbolId:
        "NASDAQ:TEST",
      timeframe: "1h",
      dataMode:
        "provider",
      candles: [
        {
          time:
            dueAt + 120,
          close: 103,
        },
      ],
    },
  );

assert.equal(
  v2Resolved[0].status,
  "resolved",
);
assert.equal(
  v2Resolved[0]
    .evaluationMethod,
  "horizon-candle",
);

journal =
  updateForecastJournal(
    journal,
    forecast({
      generatedAt:
        1_800_000_000 +
        2 * 60 * 60 +
        1,
      price: 103,
    }),
  );

const stillPending =
  journal.find(
    (item) =>
      item.generatedAt ===
      1_800_000_000,
  );

assert.ok(stillPending);
assert.equal(
  stillPending.status,
  "pending",
);

const noAnchor =
  resolveForecastJournalWithCandles(
    journal,
    {
      symbolId:
        "NASDAQ:TEST",
      timeframe: "1h",
      dataMode:
        "provider",
      candles: [
        {
          time:
            dueAt +
            9 * 60 * 60,
          close: 103,
        },
      ],
    },
  );

assert.equal(
  noAnchor.find(
    (item) =>
      item.generatedAt ===
      1_800_000_000,
  )?.status,
  "pending",
);

const generatedAt =
  1_800_000_000;

journal =
  resolveForecastJournalWithCandles(
    journal,
    {
      symbolId:
        "NASDAQ:TEST",
      timeframe: "1h",
      dataMode:
        "provider",
      candles: [
        {
          time:
            generatedAt,
          close: 100,
        },
        {
          time:
            generatedAt +
            60 * 60,
          close: 101,
        },
        {
          time:
            generatedAt +
            10 * 60 * 60,
          close: 103,
        },
      ],
    },
  );

const resolved =
  journal.find(
    (item) =>
      item.generatedAt ===
      1_800_000_000,
  );

assert.ok(resolved);
assert.equal(
  resolved.status,
  "resolved",
);
assert.equal(
  resolved.realizedOutcome,
  "bull",
);
assert.equal(
  resolved.correct,
  true,
);
assert.equal(
  resolved.realizedReturnPercent,
  3,
);
assert.equal(
  resolved.evaluationMethod,
  "horizon-bars",
);
assert.equal(
  resolved.evaluatedAt,
  generatedAt +
    10 * 60 * 60,
);
assert.equal(
  resolved.evaluationDelaySeconds,
  8 * 60 * 60,
);

const summary =
  summarizeForecastJournal(
    journal,
  );

assert.equal(
  summary.providerResolved,
  1,
);
assert.equal(
  summary.providerCorrect,
  1,
);
assert.equal(
  summary.providerAccuracy,
  100,
);
assert.ok(
  summary.providerBrierScore !==
    null,
);

const demoJournal =
  updateForecastJournal(
    journal,
    forecast({
      generatedAt:
        1_800_020_000,
      price: 104,
      mode: "demo",
    }),
  );

const demoSummary =
  summarizeForecastJournal(
    demoJournal,
  );

assert.equal(
  demoSummary.providerResolved,
  1,
);

const cloud = readFileSync(
  "apps/web/src/lib/cloudState.ts",
  "utf8",
);
const view = readFileSync(
  "apps/web/src/components/AnalystForecastView.tsx",
  "utf8",
);

assert.match(
  cloud,
  /marketos:forecast-journal/,
);
assert.match(
  view,
  /FORECAST SCORECARD/,
);

console.log(
  "Forecast Journal smoke passed:",
  JSON.stringify(summary),
);
