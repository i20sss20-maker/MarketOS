import assert from "node:assert/strict";
import {
  buildAnalystForecast,
} from "../services/api/dist/src/ai/analystForecastEngine.js";

const symbol = {
  id: "NASDAQ:CAT",
  ticker: "CAT",
  name: "Catalyst Test",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

function dateOffset(days) {
  const date = new Date();
  date.setUTCDate(
    date.getUTCDate() + days,
  );
  return date
    .toISOString()
    .slice(0, 10);
}

function chartAnalysis() {
  return {
    engine: "local-chart-engine",
    generatedAt:
      Math.floor(
        Date.now() / 1000,
      ),
    symbol: "CAT",
    timeframe: "1d",
    summary: "CAT 1D",
    observations: [],
    metrics: {
      lastPrice: 100,
      change20: 1,
      rangeLow20: 95,
      rangeHigh20: 105,
      sma20: 100,
      distanceFromSma20: 0,
      ema20: 100,
      ema50: 99,
      rsi14: 50,
      atr14: 1.5,
      atrPercent: 1.5,
      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,
      realizedRangePercent20: 10.53,
    },
    activeIndicators: [],
    drawingCount: 0,
  };
}

const multi = {
  engine: "local-chart-engine",
  generatedAt:
    Math.floor(
      Date.now() / 1000,
    ),
  symbol: "CAT",
  requestedTimeframes: [
    "1d",
  ],
  items: [
    {
      timeframe: "1d",
      trend: "sideways",
      analysis:
        chartAnalysis(),
    },
  ],
  failures: [],
  alignment: "sideways",
  upCount: 0,
  downCount: 0,
  sidewaysCount: 1,
  rangeLow: 95,
  rangeHigh: 105,
  summary: "CAT: sideways.",
  observations: [],
};

function build(events) {
  return buildAnalystForecast({
    symbol,
    quote: {
      symbol: "CAT",
      price: 100,
      timestamp:
        Math.floor(
          Date.now() / 1000,
        ),
      source: "test",
    },
    multiTimeframe: multi,
    events,
    releases: [],
    dataProvider: "test",
    dataMode: "provider",
  });
}

const baseline =
  build([]);

const positive =
  build([
    {
      id: "real-positive",
      type: "earnings",
      date: dateOffset(-1),
      title:
        "CAT earnings result",
      symbol: "CAT",
      epsEstimate: 1,
      epsActual: 1.25,
      surprisePercent: 25,
      importance: "medium",
      source:
        "twelvedata-events",
    },
  ]);

assert.equal(
  baseline.bias,
  "neutral",
);
assert.equal(
  positive.engine,
  "marketos-forecast-v3",
);
assert.ok(
  positive.catalystImpact,
);
assert.equal(
  positive.catalystImpact
    .direction,
  "positive",
);
assert.equal(
  positive.catalystImpact
    .sampleSize,
  1,
);
assert.equal(
  positive.catalystImpact
    .latestSurprisePercent,
  25,
);
assert.ok(
  positive.catalystImpact
    .weight <= 0.15,
);
assert.equal(
  positive.bias,
  "bullish",
);
assert.ok(
  positive.scenarios.find(
    (item) =>
      item.id === "bull",
  ).probability >
  baseline.scenarios.find(
    (item) =>
      item.id === "bull",
  ).probability,
);

const negative =
  build([
    {
      id: "real-negative",
      type: "earnings",
      date: dateOffset(-1),
      title:
        "CAT earnings result",
      symbol: "CAT",
      epsEstimate: 1,
      epsActual: 0.7,
      surprisePercent: -30,
      importance: "medium",
      source:
        "twelvedata-events",
    },
  ]);

assert.ok(
  negative.catalystImpact,
);
assert.equal(
  negative.catalystImpact
    .direction,
  "negative",
);
assert.ok(
  negative.scenarios.find(
    (item) =>
      item.id === "bear",
  ).probability >
  baseline.scenarios.find(
    (item) =>
      item.id === "bear",
  ).probability,
);

const demo =
  build([
    {
      id: "demo-positive",
      type: "earnings",
      date: dateOffset(-1),
      title:
        "Demo earnings",
      symbol: "CAT",
      epsEstimate: 1,
      epsActual: 2,
      surprisePercent: 100,
      importance: "high",
      source: "demo-events",
    },
  ]);

assert.equal(
  demo.catalystImpact,
  undefined,
);
assert.deepEqual(
  demo.scenarios.map(
    (item) =>
      item.probability,
  ),
  baseline.scenarios.map(
    (item) =>
      item.probability,
  ),
);

const future =
  build([
    {
      id: "future-positive",
      type: "earnings",
      date: dateOffset(1),
      title:
        "Future earnings",
      symbol: "CAT",
      epsEstimate: 1,
      epsActual: 2,
      surprisePercent: 100,
      importance: "high",
      source:
        "twelvedata-events",
    },
  ]);

assert.equal(
  future.catalystImpact,
  undefined,
);

const engineSource =
  await import("node:fs")
    .then(({readFileSync}) =>
      readFileSync(
        "services/api/src/ai/analystForecastEngine.ts",
        "utf8",
      ),
    );
const viewSource =
  await import("node:fs")
    .then(({readFileSync}) =>
      readFileSync(
        "apps/web/src/components/AnalystForecastView.tsx",
        "utf8",
      ),
    );
const endpointSource =
  await import("node:fs")
    .then(({readFileSync}) =>
      readFileSync(
        "services/api/src/functions/analystForecast.ts",
        "utf8",
      ),
    );

assert.match(
  engineSource,
  /structured-earnings/,
);
assert.match(
  engineSource,
  /includes\("demo"\)/,
);
assert.match(
  viewSource,
  /QUANT CATALYST/,
);
assert.match(
  endpointSource,
  /3\s*\*/,
);

console.log(
  "Catalyst Impact smoke passed:",
  JSON.stringify({
    baseline:
      baseline.scenarios.map(
        (item) =>
          item.probability,
      ),
    positive:
      positive.scenarios.map(
        (item) =>
          item.probability,
      ),
    negative:
      negative.scenarios.map(
        (item) =>
          item.probability,
      ),
  }),
);
