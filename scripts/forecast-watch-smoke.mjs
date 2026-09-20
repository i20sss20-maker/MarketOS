import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const source =
  readFileSync(
    "apps/web/src/lib/forecastWatch.ts",
    "utf8",
  );

const compiled =
  ts.transpileModule(
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

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    compiled,
  ).toString("base64");

const {
  buildForecastWatchSpec,
  hasForecastWatchAlert,
} = await import(
  moduleUrl
);

const symbol = {
  id: "NASDAQ:TEST",
  ticker: "TEST",
  name: "Test",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

function forecast({
  referencePrice = 100,
  support = 95,
  resistance = 105,
} = {}) {
  return {
    engine:
      "marketos-forecast-v3",
    generatedAt:
      1_800_000_000,
    symbol,
    dataProvider: "test",
    dataMode: "provider",
    timeframes: ["1h"],
    bias: "neutral",
    confidence: 60,
    risk: "medium",
    regime: "range",
    horizon: "test",
    referencePrice,
    support,
    resistance,
    expectedRangeLow: 90,
    expectedRangeHigh: 110,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "bull",
        probability: 42,
        targetLow: 106,
        targetHigh: 110,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "base",
        label: "base",
        probability: 34,
        targetLow: 98,
        targetHigh: 102,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "bear",
        label: "bear",
        probability: 24,
        targetLow: 90,
        targetHigh: 94,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
    ],
    catalysts: [],
    evidence: [],
    uncertaintyNote: "test",
  };
}

const result = forecast();

const bull =
  buildForecastWatchSpec(
    result,
    "bull",
  );
const bear =
  buildForecastWatchSpec(
    result,
    "bear",
  );

assert.deepEqual(
  bull,
  {
    side: "bull",
    operator: "above",
    value: 105,
    label:
      "اختراق المقاومة",
    probability: 42,
  },
);

assert.deepEqual(
  bear,
  {
    side: "bear",
    operator: "below",
    value: 95,
    label: "كسر الدعم",
    probability: 24,
  },
);

assert.equal(
  buildForecastWatchSpec(
    forecast({
      referencePrice: 100,
      resistance: 100.005,
    }),
    "bull",
  ),
  null,
);

assert.equal(
  buildForecastWatchSpec(
    forecast({
      referencePrice: 100,
      support: 99.995,
    }),
    "bear",
  ),
  null,
);

const alerts = [
  {
    id: "alert-1",
    symbol,
    timeframe: "1h",
    logic: "all",
    conditions: [
      {
        id: "condition-1",
        type: "numeric",
        metric: "price",
        operator: "above",
        value: 105,
      },
    ],
    enabled: true,
    createdAt: 1,
  },
];

assert.equal(
  hasForecastWatchAlert(
    alerts,
    symbol.id,
    "1h",
    bull,
  ),
  true,
);

assert.equal(
  hasForecastWatchAlert(
    alerts,
    symbol.id,
    "4h",
    bull,
  ),
  false,
);

assert.equal(
  hasForecastWatchAlert(
    [
      {
        ...alerts[0],
        enabled: false,
      },
    ],
    symbol.id,
    "1h",
    bull,
  ),
  false,
);

assert.equal(
  hasForecastWatchAlert(
    [
      {
        ...alerts[0],
        triggeredAt: 2,
      },
    ],
    symbol.id,
    "1h",
    bull,
  ),
  false,
);

const app =
  readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );
const panel =
  readFileSync(
    "apps/web/src/components/CommercialAiPanel.tsx",
    "utf8",
  );
const view =
  readFileSync(
    "apps/web/src/components/AnalystForecastView.tsx",
    "utf8",
  );

assert.match(
  app,
  /createForecastWatch/,
);
assert.match(
  app,
  /hasForecastWatchAlert/,
);
assert.match(
  panel,
  /onWatchForecast/,
);
assert.match(
  view,
  /SCENARIO WATCH/,
);
assert.match(
  view,
  /onWatchScenario/,
);

console.log(
  "Forecast Watch smoke passed:",
  JSON.stringify({
    bull:
      bull.value,
    bear:
      bear.value,
    duplicateGuard: true,
  }),
);
