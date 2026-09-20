import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}

function dataUrl(source) {
  return (
    "data:text/javascript;base64," +
    Buffer.from(source).toString(
      "base64",
    )
  );
}

const radarUrl =
  dataUrl(
    transpile(
      readFileSync(
        "apps/web/src/lib/analystRadar.ts",
        "utf8",
      ),
    ),
  );

const aiUrl =
  dataUrl(
    `export async function getAnalystForecast() {
      throw new Error("default loader must not run in scanner smoke");
    }`,
  );

let scannerCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/analystRadarScanner.ts",
      "utf8",
    ),
  )
    .replaceAll(
      '"./analystRadar"',
      JSON.stringify(radarUrl),
    )
    .replaceAll(
      '"./aiApi"',
      JSON.stringify(aiUrl),
    );

const scannerUrl =
  dataUrl(
    scannerCompiled,
  );

const {
  scanAnalystRadar,
} = await import(
  scannerUrl
);

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

function forecast(
  symbol,
  {
    bull,
    base,
    bear,
    confidence,
    risk,
  },
) {
  const top =
    [
      ["bull", bull],
      ["base", base],
      ["bear", bear],
    ].sort(
      (a, b) =>
        b[1] - a[1],
    )[0][0];

  return {
    engine:
      "marketos-forecast-v3",
    generatedAt:
      1_800_000_000,
    symbol,
    dataProvider: "test",
    dataMode: "provider",
    timeframes: ["1h"],
    bias:
      top === "bull"
        ? "bullish"
        : top === "bear"
          ? "bearish"
          : "neutral",
    confidence,
    risk,
    regime: "trend",
    horizon: "test",
    referencePrice: 100,
    support: 90,
    resistance: 110,
    expectedRangeLow: 85,
    expectedRangeHigh: 115,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "bull",
        probability: bull,
        targetLow: 110,
        targetHigh: 115,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "base",
        label: "base",
        probability: base,
        targetLow: 98,
        targetHigh: 102,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "bear",
        label: "bear",
        probability: bear,
        targetLow: 85,
        targetHigh: 90,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
    ],
    calibration: {
      method:
        "historical-analog",
      timeframe: "1h",
      lookaheadBars: 3,
      sampleSize: 30,
      comparableSamples: 20,
      currentSignal: 0.4,
      outcomeThresholdPercent: 1,
      directionalHitRate: 60,
      averageForwardReturn: 1,
      medianForwardReturn: 0.8,
      bullProbability: bull,
      baseProbability: base,
      bearProbability: bear,
      similarityScore: 75,
      reliability: "high",
      blendWeight: 0.42,
    },
    catalysts: [],
    evidence: [],
    uncertaintyNote: "test",
  };
}

const order = [];
const progress = [];

const result =
  await scanAnalystRadar(
    symbols,
    {
      forecastLoader:
        async (symbol) => {
          order.push(
            symbol.ticker,
          );

          if (
            symbol.id ===
            "TEST:C"
          ) {
            throw new Error(
              "provider failure",
            );
          }

          if (
            symbol.id ===
            "TEST:B"
          ) {
            return forecast(
              symbol,
              {
                bull: 72,
                base: 18,
                bear: 10,
                confidence: 82,
                risk: "low",
              },
            );
          }

          return forecast(
            symbol,
            {
              bull: 55,
              base: 30,
              bear: 15,
              confidence: 64,
              risk: "medium",
            },
          );
        },
      onProgress:
        (snapshot) => {
          progress.push({
            done:
              snapshot.done,
            total:
              snapshot.total,
            items:
              snapshot.items
                .map(
                  (item) =>
                    item.symbol
                      .ticker,
                ),
            failures:
              snapshot.failures
                .length,
          });
        },
    },
  );

assert.deepEqual(
  order,
  ["A", "B", "C"],
);
assert.equal(
  progress.length,
  4,
);
assert.deepEqual(
  progress.map(
    (item) =>
      item.done,
  ),
  [0, 1, 2, 3],
);
assert.equal(
  result.items.length,
  2,
);
assert.equal(
  result.items[0]
    .symbol.ticker,
  "B",
);
assert.equal(
  result.failures.length,
  1,
);
assert.equal(
  result.failures[0]
    .symbol.ticker,
  "C",
);
assert.ok(
  result.scannedAt > 0,
);

const controller =
  new AbortController();
controller.abort();

await assert.rejects(
  () =>
    scanAnalystRadar(
      symbols,
      {
        signal:
          controller.signal,
        forecastLoader:
          async (symbol) =>
            forecast(
              symbol,
              {
                bull: 60,
                base: 25,
                bear: 15,
                confidence: 70,
                risk: "low",
              },
            ),
      },
    ),
  (error) =>
    error instanceof Error &&
    error.name ===
      "AbortError",
);

const radarView =
  readFileSync(
    "apps/web/src/components/AnalystRadarView.tsx",
    "utf8",
  );
const home =
  readFileSync(
    "apps/web/src/components/HomeDashboard.tsx",
    "utf8",
  );

assert.match(
  radarView,
  /scanAnalystRadar/,
);
assert.match(
  home,
  /scanAnalystRadar/,
);
assert.match(
  home,
  /AbortController/,
);
assert.match(
  home,
  /saveAnalystRadarCache/,
);

console.log(
  "Analyst Radar Scanner smoke passed:",
  JSON.stringify({
    order,
    top:
      result.items[0]
        .symbol.ticker,
    failures:
      result.failures.length,
    progress:
      progress.map(
        (item) =>
          item.done,
      ),
  }),
);
