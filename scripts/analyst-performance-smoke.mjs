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
    dataMode: "demo",
  }),
  {
    id: "pending",
    symbolId: "P",
    ticker: "PEND",
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
  view,
  /شمعة نهاية الأفق/,
);
assert.match(
  view,
  /شمعة الأفق/,
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
