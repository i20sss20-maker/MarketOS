import assert from "node:assert/strict";
import {
  buildAnalystForecast,
} from "../services/api/dist/src/ai/analystForecastEngine.js";

function analysis(
  timeframe,
  {
    lastPrice = 112,
    change20,
    distanceFromSma20,
    rangeLow,
    rangeHigh,
    rsi14,
    atrPercent,
    macdHistogram,
  },
) {
  return {
    engine: "local-chart-engine",
    generatedAt: 1_800_000_000,
    symbol: "TEST",
    timeframe,
    summary: `TEST ${timeframe}`,
    observations: [],
    metrics: {
      lastPrice,
      change20,
      rangeLow20: rangeLow,
      rangeHigh20: rangeHigh,
      sma20: 105,
      distanceFromSma20,
      ema20: 108,
      ema50: 103,
      rsi14,
      atr14: 2,
      atrPercent,
      macd: 1.4,
      macdSignal: 0.9,
      macdHistogram,
      realizedRangePercent20:
        ((rangeHigh - rangeLow) /
          rangeLow) *
        100,
    },
    activeIndicators: [
      "sma20",
      "ema20",
      "rsi14",
      "macd",
      "atr14",
    ],
    drawingCount: 0,
  };
}

const symbol = {
  id: "NASDAQ:TEST",
  ticker: "TEST",
  name: "Test Corp",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const bullishMulti = {
  engine: "local-chart-engine",
  generatedAt: 1_800_000_000,
  symbol: "TEST",
  requestedTimeframes: [
    "1h",
    "4h",
    "1d",
    "1w",
  ],
  items: [
    {
      timeframe: "1h",
      trend: "up",
      analysis: analysis("1h", {
        change20: 2.4,
        distanceFromSma20: 1.4,
        rangeLow: 102,
        rangeHigh: 114,
        rsi14: 61,
        atrPercent: 1.7,
        macdHistogram: 0.5,
      }),
    },
    {
      timeframe: "4h",
      trend: "up",
      analysis: analysis("4h", {
        change20: 3.2,
        distanceFromSma20: 1.9,
        rangeLow: 98,
        rangeHigh: 117,
        rsi14: 64,
        atrPercent: 2.1,
        macdHistogram: 0.7,
      }),
    },
    {
      timeframe: "1d",
      trend: "up",
      analysis: analysis("1d", {
        change20: 4.1,
        distanceFromSma20: 2.3,
        rangeLow: 94,
        rangeHigh: 121,
        rsi14: 66,
        atrPercent: 2.4,
        macdHistogram: 0.9,
      }),
    },
    {
      timeframe: "1w",
      trend: "sideways",
      analysis: analysis("1w", {
        change20: 0.7,
        distanceFromSma20: 0.4,
        rangeLow: 88,
        rangeHigh: 126,
        rsi14: 54,
        atrPercent: 3,
        macdHistogram: 0.1,
      }),
    },
  ],
  failures: [],
  alignment: "up",
  upCount: 3,
  downCount: 0,
  sidewaysCount: 1,
  rangeLow: 88,
  rangeHigh: 126,
  summary:
    "TEST: 3/4 فريمات صاعدة.",
  observations: [
    "1H: صاعد.",
    "4H: صاعد.",
    "1D: صاعد.",
    "1W: جانبي.",
  ],
};

const bullish =
  buildAnalystForecast({
    symbol,
    quote: {
      symbol: "TEST",
      price: 112,
      timestamp: 1_800_000_000,
      source: "test",
    },
    multiTimeframe:
      bullishMulti,
    events: [
      {
        id: "event-1",
        type: "earnings",
        date: "2026-09-25",
        title: "Earnings",
        symbol: "TEST",
        importance: "medium",
        source: "test-events",
      },
    ],
    releases: [
      {
        id: "release-1",
        symbol: "TEST",
        datetime:
          "2026-09-19T12:00:00Z",
        title:
          "Quarterly business update",
        bodyText: "Update",
        languages: ["en"],
        source: "test-feed",
      },
    ],
    dataProvider: "test",
    dataMode: "provider",
  });

assert.equal(
  bullish.bias,
  "bullish",
);
assert.ok(
  bullish.confidence >= 35 &&
  bullish.confidence <= 90,
);
assert.equal(
  bullish.scenarios.reduce(
    (sum, item) =>
      sum + item.probability,
    0,
  ),
  100,
);
assert.ok(
  bullish.scenarios.find(
    (item) => item.id === "bull",
  ).probability >
  bullish.scenarios.find(
    (item) => item.id === "bear",
  ).probability,
);
assert.ok(
  bullish.support <=
  bullish.referencePrice,
);
assert.ok(
  bullish.resistance >=
  bullish.referencePrice,
);
assert.ok(
  bullish.catalysts.length >= 2,
);
assert.ok(
  bullish.evidence.some(
    (item) =>
      item.includes("RSI14"),
  ),
);
assert.ok(
  bullish.evidence.some(
    (item) =>
      item.includes("MACD"),
  ),
);
assert.ok(
  bullish.evidence.some(
    (item) =>
      item.includes("ATR14"),
  ),
);

const bearishItems =
  bullishMulti.items.map(
    (item) => ({
      ...item,
      trend: "down",
      analysis: {
        ...item.analysis,
        metrics: {
          ...item.analysis.metrics,
          change20:
            -Math.abs(
              item.analysis.metrics
                .change20,
            ),
          distanceFromSma20:
            -Math.abs(
              item.analysis.metrics
                .distanceFromSma20,
            ),
          rsi14: 36,
          macdHistogram: -0.8,
        },
      },
    }),
  );

const bearish =
  buildAnalystForecast({
    symbol: {
      ...symbol,
      id: "CRYPTO:TESTUSD",
      ticker: "TEST/USD",
      name: "Test Crypto",
      exchange: "Crypto",
      assetClass: "crypto",
    },
    quote: {
      symbol: "TEST/USD",
      price: 95,
      timestamp: 1_800_000_000,
      source: "test",
    },
    multiTimeframe: {
      ...bullishMulti,
      items: bearishItems,
      alignment: "down",
      upCount: 0,
      downCount: 4,
      sidewaysCount: 0,
      summary:
        "TEST/USD: 4/4 فريمات هابطة.",
    },
    events: [],
    releases: [],
    dataProvider: "test",
    dataMode: "provider",
  });

assert.equal(
  bearish.bias,
  "bearish",
);
assert.ok(
  bearish.scenarios.find(
    (item) => item.id === "bear",
  ).probability >
  bearish.scenarios.find(
    (item) => item.id === "bull",
  ).probability,
);
assert.equal(
  bearish.horizon,
  "24–72 ساعة مع سياق يومي",
);

console.log(
  `Analyst Forecast smoke passed: bullish=${bullish.confidence}% / bearish=${bearish.confidence}%`,
);
