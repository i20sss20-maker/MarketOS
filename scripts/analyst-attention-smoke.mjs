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

const watchUrl =
  dataUrl(
    transpile(
      readFileSync(
        "apps/web/src/lib/forecastWatch.ts",
        "utf8",
      ),
    ),
  );

let attentionCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/analystAttention.ts",
      "utf8",
    ),
  )
    .replaceAll(
      '"./analystRadar"',
      JSON.stringify(radarUrl),
    )
    .replaceAll(
      '"./forecastWatch"',
      JSON.stringify(watchUrl),
    );

const attentionUrl =
  dataUrl(
    attentionCompiled,
  );

const {
  buildAnalystAttentionQueue,
} = await import(
  attentionUrl
);

const symbolA = {
  id: "TEST:A",
  ticker: "A",
  name: "A",
  exchange: "TEST",
  assetClass: "stock",
  currency: "USD",
};

const symbolB = {
  id: "TEST:B",
  ticker: "B",
  name: "B",
  exchange: "TEST",
  assetClass: "stock",
  currency: "USD",
};

function forecast(
  symbol,
  {
    bull,
    base,
    bear,
    confidence,
    support = 95,
    resistance = 101,
    catalystImpact,
  },
) {
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
      bull >= bear
        ? "bullish"
        : "bearish",
    confidence,
    risk: "medium",
    regime: "trend",
    horizon: "test",
    referencePrice: 100,
    support,
    resistance,
    expectedRangeLow: 90,
    expectedRangeHigh: 110,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "bull",
        probability: bull,
        targetLow: resistance,
        targetHigh: 110,
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
        targetLow: 90,
        targetHigh: support,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
    ],
    catalystImpact,
    catalysts: [],
    evidence: [],
    uncertaintyNote: "test",
  };
}

const currentA = {
  symbol: symbolA,
  forecast:
    forecast(
      symbolA,
      {
        bull: 65,
        base: 22,
        bear: 13,
        confidence: 78,
        resistance: 101,
      },
    ),
  direction: "bull",
  directionProbability: 65,
  confidence: 78,
  clarity: 84,
  calibrated: true,
};

const previousA = {
  symbol: symbolA,
  forecast:
    forecast(
      symbolA,
      {
        bull: 12,
        base: 23,
        bear: 65,
        confidence: 75,
      },
    ),
  direction: "bear",
  directionProbability: 65,
  confidence: 75,
  clarity: 80,
  calibrated: true,
};

const currentB = {
  symbol: symbolB,
  forecast:
    forecast(
      symbolB,
      {
        bull: 69,
        base: 20,
        bear: 11,
        confidence: 80,
        resistance: 104,
        catalystImpact: {
          method:
            "structured-earnings",
          direction: "positive",
          score: 0.8,
          weight: 0.25,
          sampleSize: 4,
          averageSurprisePercent: 8,
          latestSurprisePercent: 11,
          evidence: [],
        },
      },
    ),
  direction: "bull",
  directionProbability: 69,
  confidence: 80,
  clarity: 89,
  calibrated: true,
};

const previousB = {
  ...currentB,
  clarity: 80,
  confidence: 73,
  directionProbability: 61,
  forecast:
    forecast(
      symbolB,
      {
        bull: 61,
        base: 24,
        bear: 15,
        confidence: 73,
        resistance: 104,
      },
    ),
};

const cache = {
  version: 2,
  updatedAt: 20_000,
  signature:
    "TEST:A|TEST:B",
  items: [
    currentA,
    currentB,
  ],
  previousUpdatedAt:
    10_000,
  previousItems: [
    previousA,
    previousB,
  ],
};

const alerts = [
  {
    id: "watch-a",
    symbol: symbolA,
    timeframe: "1h",
    logic: "all",
    conditions: [
      {
        id: "c1",
        type: "numeric",
        metric: "price",
        operator: "above",
        value: 101,
      },
    ],
    enabled: true,
    createdAt: 1,
  },
];

const journal = [
  {
    id: "matured-b",
    symbolId: symbolB.id,
    ticker: symbolB.ticker,
    symbol: symbolB,
    generatedAt: 100,
    dueAt: 900,
    evaluationTimeframe: "1h",
    evaluationBars: 3,
    referencePrice: 100,
    confidence: 70,
    dataMode: "provider",
    expectedOutcome: "bull",
    expectedProbability: 66,
    probabilities: {
      bull: 66,
      base: 20,
      bear: 14,
    },
    thresholdPercent: 1,
    status: "pending",
  },
];

const queue =
  buildAnalystAttentionQueue({
    radarCache: cache,
    journal,
    alerts,
    overview: [
      {
        symbol: symbolA,
        quote: {
          symbol: "A",
          price: 100.5,
          timestamp: 1000,
          source:
            "test-provider",
        },
      },
    ],
    overviewMode:
      "provider",
    nowSeconds: 1000,
    limit: 6,
  });

assert.ok(
  queue.items.length >= 4,
);

assert.equal(
  queue.items[0].kind,
  "reversal",
);
assert.equal(
  queue.items[0]
    .symbol.id,
  symbolA.id,
);

const liveWatch =
  queue.items.find(
    (item) =>
      item.kind ===
        "watch-near" &&
      item.symbol.id ===
        symbolA.id,
  );

assert.ok(liveWatch);
assert.equal(
  liveWatch.proximitySource,
  "live",
);
assert.equal(
  liveWatch.proximityPrice,
  100.5,
);
assert.equal(
  liveWatch.distancePercent,
  0.5,
);
assert.match(
  liveWatch.detail,
  /السعر الحالي/,
);

const demoFallbackQueue =
  buildAnalystAttentionQueue({
    radarCache: cache,
    journal,
    alerts,
    overview: [
      {
        symbol: symbolA,
        quote: {
          symbol: "A",
          price: 100.5,
          timestamp: 1000,
          source:
            "browser-demo",
        },
      },
    ],
    overviewMode:
      "provider",
    nowSeconds: 1000,
    limit: 6,
  });

const fallbackWatch =
  demoFallbackQueue.items.find(
    (item) =>
      item.kind ===
        "watch-near" &&
      item.symbol.id ===
        symbolA.id,
  );

assert.ok(fallbackWatch);
assert.equal(
  fallbackWatch.proximitySource,
  "radar",
);
assert.equal(
  fallbackWatch.distancePercent,
  1,
);
assert.match(
  fallbackWatch.detail,
  /سعر الرادار/,
);

assert.ok(
  queue.items.some(
    (item) =>
      item.kind ===
      "strengthening" &&
      item.symbol.id ===
        symbolB.id,
  ),
);

assert.ok(
  queue.items.some(
    (item) =>
      item.kind ===
      "catalyst" &&
      item.symbol.id ===
        symbolB.id,
  ),
);

assert.ok(
  queue.items.some(
    (item) =>
      item.kind ===
      "verification" &&
      item.symbol.id ===
        symbolB.id,
  ),
);

assert.equal(
  queue.criticalCount,
  2,
);
assert.equal(
  queue.watchNearCount,
  1,
);
assert.equal(
  queue.verificationCount,
  1,
);

const brief =
  readFileSync(
    "apps/web/src/lib/analystBrief.ts",
    "utf8",
  );
const card =
  readFileSync(
    "apps/web/src/components/AnalystBriefCard.tsx",
    "utf8",
  );

assert.match(
  brief,
  /buildAnalystAttentionQueue/,
);
assert.match(
  brief,
  /attention:/,
);
assert.match(
  brief,
  /overviewMode/,
);
assert.match(
  card,
  /ATTENTION QUEUE/,
);
assert.match(
  card,
  /home-analyst-attention-list/,
);

const home =
  readFileSync(
    "apps/web/src/components/HomeDashboard.tsx",
    "utf8",
  );

assert.match(
  home,
  /overviewMode:/,
);
assert.match(
  home,
  /overviewProvider/,
);

console.log(
  "Analyst Attention Queue smoke passed:",
  JSON.stringify({
    order:
      queue.items.map(
        (item) =>
          item.kind +
          ":" +
          item.symbol.ticker,
      ),
    critical:
      queue.criticalCount,
    watchNear:
      queue.watchNearCount,
    verification:
      queue.verificationCount,
  }),
);
