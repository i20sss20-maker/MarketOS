import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const journalSource =
  readFileSync(
    "apps/web/src/lib/forecastJournal.ts",
    "utf8",
  );

const journalCompiled =
  ts.transpileModule(
    journalSource,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

const journalUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    journalCompiled,
  ).toString("base64");

const performanceSource =
  readFileSync(
    "apps/web/src/lib/forecastPerformance.ts",
    "utf8",
  );

let performanceCompiled =
  ts.transpileModule(
    performanceSource,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

performanceCompiled =
  performanceCompiled.replace(
    '"./forecastJournal"',
    JSON.stringify(
      journalUrl,
    ),
  );

const performanceUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    performanceCompiled,
  ).toString("base64");

const {
  buildForecastPerformance,
} = await import(
  performanceUrl
);

function record({
  id,
  symbolId,
  ticker,
  expectedOutcome,
  expectedProbability,
  confidence,
  correct,
  realizedReturnPercent,
  evaluatedAt,
  engine,
  dataMode = "provider",
}) {
  const probabilities =
    expectedOutcome === "bull"
      ? {
          bull:
            expectedProbability,
          base: 22,
          bear:
            78 -
            expectedProbability,
        }
      : expectedOutcome ===
          "bear"
        ? {
            bull:
              78 -
              expectedProbability,
            base: 22,
            bear:
              expectedProbability,
          }
        : {
            bull: 25,
            base:
              expectedProbability,
            bear:
              75 -
              expectedProbability,
          };

  return {
    id,
    symbolId,
    ticker,
    engine,
    generatedAt:
      evaluatedAt - 3600,
    dueAt:
      evaluatedAt - 60,
    referencePrice: 100,
    confidence,
    dataMode,
    expectedOutcome,
    expectedProbability,
    probabilities,
    thresholdPercent: 1,
    status: "resolved",
    evaluatedAt,
    evaluationPrice:
      100 *
      (
        1 +
        realizedReturnPercent /
          100
      ),
    realizedReturnPercent,
    realizedOutcome:
      correct
        ? expectedOutcome
        : expectedOutcome ===
            "bull"
          ? "bear"
          : "bull",
    correct,
  };
}

const records = [
  record({
    id: "a1",
    symbolId: "A",
    ticker: "AAA",
    expectedOutcome: "bull",
    expectedProbability: 70,
    confidence: 80,
    correct: true,
    realizedReturnPercent: 4,
    evaluatedAt: 106,
    engine: "marketos-forecast-v3",
  }),
  record({
    id: "a2",
    symbolId: "A",
    ticker: "AAA",
    expectedOutcome: "bear",
    expectedProbability: 58,
    confidence: 60,
    correct: false,
    realizedReturnPercent: 3,
    evaluatedAt: 105,
    engine: "marketos-forecast-v2",
  }),
  record({
    id: "b1",
    symbolId: "B",
    ticker: "BBB",
    expectedOutcome: "bear",
    expectedProbability: 65,
    confidence: 72,
    correct: true,
    realizedReturnPercent: -2,
    evaluatedAt: 104,
    engine: "marketos-forecast-v3",
  }),
  record({
    id: "b2",
    symbolId: "B",
    ticker: "BBB",
    expectedOutcome: "base",
    expectedProbability: 45,
    confidence: 50,
    correct: true,
    realizedReturnPercent: 0.2,
    evaluatedAt: 103,
    engine: "marketos-forecast-v3",
  }),
  record({
    id: "c1",
    symbolId: "C",
    ticker: "CCC",
    expectedOutcome: "bull",
    expectedProbability: 66,
    confidence: 78,
    correct: false,
    realizedReturnPercent: -3,
    evaluatedAt: 102,
    engine: "marketos-forecast-v3",
  }),
  record({
    id: "c2",
    symbolId: "C",
    ticker: "CCC",
    expectedOutcome: "bull",
    expectedProbability: 60,
    confidence: 68,
    correct: true,
    realizedReturnPercent: 2,
    evaluatedAt: 101,
    engine: "marketos-forecast-v2",
  }),
  record({
    id: "demo",
    symbolId: "D",
    ticker: "DEMO",
    expectedOutcome: "bull",
    expectedProbability: 90,
    confidence: 90,
    correct: true,
    realizedReturnPercent: 8,
    evaluatedAt: 100,
    engine: "marketos-forecast-v3",
    dataMode: "demo",
  }),
  {
    id: "pending",
    symbolId: "P",
    ticker: "PEND",
    engine: "marketos-forecast-v3",
    generatedAt: 99,
    dueAt: 200,
    referencePrice: 10,
    confidence: 70,
    dataMode: "provider",
    expectedOutcome: "bull",
    expectedProbability: 60,
    probabilities: {
      bull: 60,
      base: 25,
      bear: 15,
    },
    thresholdPercent: 1,
    status: "pending",
  },
];

const report =
  buildForecastPerformance(
    records,
  );

assert.equal(
  report.providerRecords,
  6,
);
assert.equal(
  report.summary
    .providerResolved,
  6,
);
assert.equal(
  report.summary
    .providerCorrect,
  4,
);
assert.equal(
  report.summary
    .providerAccuracy,
  67,
);
assert.equal(
  report.summary.pending,
  1,
);
assert.equal(
  report.averageExpectedProbability,
  60.7,
);
assert.equal(
  report.calibrationGap,
  6.3,
);

assert.equal(
  report.currentEngine,
  "marketos-forecast-v3",
);
assert.equal(
  report.currentEnginePerformance?.engine,
  "marketos-forecast-v3",
);
assert.equal(
  report.currentEnginePerformance?.resolved,
  4,
);
assert.equal(
  report.currentEnginePerformance?.correct,
  3,
);
assert.equal(
  report.currentEnginePerformance?.accuracy,
  75,
);
assert.equal(
  report.currentEnginePerformance?.accuracyLow95,
  30,
);
assert.equal(
  report.currentEnginePerformance?.accuracyHigh95,
  95,
);
assert.equal(
  report.currentEnginePerformance?.sampleStatus,
  "insufficient",
);
assert.equal(
  report.drift.status,
  "insufficient",
);
assert.equal(
  report.drift.engine,
  "marketos-forecast-v3",
);
assert.equal(
  report.drift.reason.length,
  1,
);
assert.equal(
  report.currentEnginePerformance?.averageExpectedProbability,
  61.5,
);
assert.equal(
  report.currentEnginePerformance?.calibrationGap,
  13.5,
);
assert.ok(
  report.currentEnginePerformance?.brierScore !==
    null,
);

assert.equal(
  report.engines.length,
  2,
);
assert.equal(
  report.engines[0].engine,
  "marketos-forecast-v3",
);
assert.equal(
  report.engines[0].isCurrent,
  true,
);
assert.equal(
  report.engines[1].engine,
  "marketos-forecast-v2",
);
assert.equal(
  report.engines[1].resolved,
  2,
);
assert.equal(
  report.engines[1].accuracy,
  50,
);
assert.equal(
  report.engines[1].accuracyLow95,
  9,
);
assert.equal(
  report.engines[1].accuracyHigh95,
  91,
);
assert.equal(
  report.engines[1].sampleStatus,
  "insufficient",
);

const driftRecords = [
  ...Array.from(
    { length: 8 },
    (_, index) =>
      record({
        id:
          `drift-recent-${index}`,
        symbolId: "DRIFT",
        ticker: "DRIFT",
        expectedOutcome:
          "bull",
        expectedProbability:
          70,
        confidence: 75,
        correct:
          index < 2,
        realizedReturnPercent:
          index < 2
            ? 3
            : -3,
        evaluatedAt:
          2_000 -
          index,
        engine:
          "marketos-forecast-v3",
      }),
  ),
  ...Array.from(
    { length: 8 },
    (_, index) =>
      record({
        id:
          `drift-base-${index}`,
        symbolId: "DRIFT",
        ticker: "DRIFT",
        expectedOutcome:
          "bull",
        expectedProbability:
          70,
        confidence: 75,
        correct:
          index < 7,
        realizedReturnPercent:
          index < 7
            ? 3
            : -3,
        evaluatedAt:
          1_900 -
          index,
        engine:
          "marketos-forecast-v3",
      }),
  ),
];

const driftReport =
  buildForecastPerformance(
    driftRecords,
  );

assert.equal(
  driftReport.drift.status,
  "degrading",
);
assert.equal(
  driftReport.drift.recentSize,
  8,
);
assert.equal(
  driftReport.drift.baselineSize,
  8,
);
assert.equal(
  driftReport.drift.recentAccuracy,
  25,
);
assert.equal(
  driftReport.drift.baselineAccuracy,
  88,
);
assert.equal(
  driftReport.drift.accuracyDelta,
  -63,
);
assert.equal(
  driftReport.drift.recentBrier,
  1.075,
);
assert.equal(
  driftReport.drift.baselineBrier,
  0.3,
);
assert.equal(
  driftReport.drift.brierDelta,
  0.775,
);
assert.equal(
  driftReport.drift.calibrationGapDelta,
  27,
);
assert.ok(
  driftReport.drift.reason.length >=
    1,
);

const bull =
  report.directions.find(
    (item) =>
      item.outcome === "bull",
  );
const bear =
  report.directions.find(
    (item) =>
      item.outcome === "bear",
  );
const base =
  report.directions.find(
    (item) =>
      item.outcome === "base",
  );

assert.equal(
  bull?.resolved,
  3,
);
assert.equal(
  bull?.accuracy,
  67,
);
assert.equal(
  bear?.accuracy,
  50,
);
assert.equal(
  base?.accuracy,
  100,
);
assert.equal(
  report.symbols[0]
    .ticker,
  "BBB",
);
assert.equal(
  report.recent[0].id,
  "a1",
);

const panel =
  readFileSync(
    "apps/web/src/components/CommercialAiPanel.tsx",
    "utf8",
  );
const view =
  readFileSync(
    "apps/web/src/components/AnalystPerformanceView.tsx",
    "utf8",
  );
const monitor =
  readFileSync(
    "apps/web/src/lib/forecastMonitor.ts",
    "utf8",
  );

assert.match(
  panel,
  /tab === "performance"/,
);
assert.match(
  view,
  /ANALYST PERFORMANCE/,
);
assert.match(
  view,
  /حسب إصدار المحلل/,
);
assert.match(
  view,
  /performance\.engines/,
);
assert.match(
  view,
  /engine\.isCurrent/,
);
assert.match(
  view,
  /95%/,
);
assert.match(
  view,
  /sampleLabel/,
);
assert.match(
  view,
  /عينة غير كافية/,
);
assert.match(
  view,
  /Performance Drift/,
);
assert.match(
  view,
  /performance\.drift/,
);
assert.match(
  view,
  /driftLabel/,
);
assert.match(
  view,
  /refreshMaturedForecasts/,
);
assert.match(
  monitor,
  /getMarketCandles/,
);
assert.match(
  monitor,
  /resolveForecastJournalWithCandles/,
);
assert.match(
  monitor,
  /resolvedByCandles/,
);
assert.match(
  monitor,
  /resolvedByLegacyQuote/,
);
assert.match(
  monitor,
  /response\.provider !==\s*status\.provider/,
);
assert.match(
  view,
  /عدد الشموع الفعلي/,
);
assert.match(
  view,
  /عدد الشموع/,
);
assert.match(
  monitor,
  /historyLimitForGroup/,
);
assert.match(
  monitor,
  /1500/,
);

console.log(
  "Analyst Performance smoke passed:",
  JSON.stringify({
    accuracy:
      report.summary
        .providerAccuracy,
    brier:
      report.summary
        .providerBrierScore,
    calibrationGap:
      report.calibrationGap,
    topSymbol:
      report.symbols[0]
        .ticker,
  }),
);
