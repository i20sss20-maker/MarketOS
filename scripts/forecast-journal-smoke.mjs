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
  maturedForecastSymbols,
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
  maturedSymbols[0]?.id,
  "NASDAQ:TEST",
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
