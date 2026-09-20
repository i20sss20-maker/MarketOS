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

const journalUrl =
  dataUrl(
    transpile(
      readFileSync(
        "apps/web/src/lib/forecastJournal.ts",
        "utf8",
      ),
    ),
  );

let performanceCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/forecastPerformance.ts",
      "utf8",
    ),
  ).replaceAll(
    '"./forecastJournal"',
    JSON.stringify(journalUrl),
  );

const performanceUrl =
  dataUrl(
    performanceCompiled,
  );

let modelHealthCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/analystModelHealth.ts",
      "utf8",
    ),
  ).replaceAll(
    '"./forecastPerformance"',
    JSON.stringify(
      performanceUrl,
    ),
  );

const modelHealthUrl =
  dataUrl(
    modelHealthCompiled,
  );

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

let briefCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/analystBrief.ts",
      "utf8",
    ),
  );

briefCompiled =
  briefCompiled
    .replaceAll(
      '"./analystRadar"',
      JSON.stringify(radarUrl),
    )
    .replaceAll(
      '"./forecastPerformance"',
      JSON.stringify(
        performanceUrl,
      ),
    )
    .replaceAll(
      '"./forecastWatch"',
      JSON.stringify(watchUrl),
    )
    .replaceAll(
      '"./analystAttention"',
      JSON.stringify(
        attentionUrl,
      ),
    )
    .replaceAll(
      '"./analystModelHealth"',
      JSON.stringify(
        modelHealthUrl,
      ),
    );

const briefUrl =
  dataUrl(briefCompiled);

const {
  buildAnalystBrief,
} = await import(briefUrl);

const symbolA = {
  id: "NASDAQ:AAA",
  ticker: "AAA",
  name: "AAA Corp",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const symbolB = {
  id: "NASDAQ:BBB",
  ticker: "BBB",
  name: "BBB Corp",
  exchange: "NASDAQ",
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
    catalystImpact,
  },
) {
  const top =
    [
      ["bull", bull],
      ["base", base],
      ["bear", bear],
    ].sort(
      (a, b) => b[1] - a[1],
    )[0][0];

  return {
    engine:
      "marketos-forecast-v3",
    generatedAt:
      1_800_000_000,
    symbol,
    dataProvider:
      "test-provider",
    dataMode: "provider",
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
    risk: "medium",
    regime: "trend",
    horizon:
      "عدة أيام",
    referencePrice: 100,
    support: 90,
    resistance: 110,
    expectedRangeLow: 85,
    expectedRangeHigh: 115,
    summary: "test",
    scenarios: [
      {
        id: "bull",
        label: "صاعد",
        probability: bull,
        targetLow: 110,
        targetHigh: 115,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "base",
        label: "محايد",
        probability: base,
        targetLow: 96,
        targetHigh: 104,
        trigger: "test",
        invalidation: "test",
        rationale: [],
      },
      {
        id: "bear",
        label: "هابط",
        probability: bear,
        targetLow: 85,
        targetHigh: 90,
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
    forecast(symbolA, {
      bull: 62,
      base: 24,
      bear: 14,
      confidence: 72,
    }),
  direction: "bull",
  directionProbability: 62,
  confidence: 72,
  clarity: 78,
  calibrated: true,
};

const previousA = {
  symbol: symbolA,
  forecast:
    forecast(symbolA, {
      bull: 14,
      base: 22,
      bear: 64,
      confidence: 70,
    }),
  direction: "bear",
  directionProbability: 64,
  confidence: 70,
  clarity: 76,
  calibrated: true,
};

const currentB = {
  symbol: symbolB,
  forecast:
    forecast(symbolB, {
      bull: 68,
      base: 20,
      bear: 12,
      confidence: 79,
      catalystImpact: {
        method:
          "structured-earnings",
        direction: "positive",
        score: 0.8,
        weight: 0.25,
        sampleSize: 3,
        averageSurprisePercent:
          9.5,
        latestSurprisePercent:
          12.4,
        evidence: [
          "positive earnings",
        ],
      },
    }),
  direction: "bull",
  directionProbability: 68,
  confidence: 79,
  clarity: 88,
  calibrated: true,
};

const previousB = {
  ...currentB,
  confidence: 72,
  clarity: 80,
  directionProbability: 61,
  forecast:
    forecast(symbolB, {
      bull: 61,
      base: 25,
      bear: 14,
      confidence: 72,
    }),
};

const radarCache = {
  version: 2,
  updatedAt: 20_000,
  signature:
    "NASDAQ:AAA|NASDAQ:BBB",
  items: [
    currentA,
    currentB,
  ],
  previousUpdatedAt: 10_000,
  previousItems: [
    previousA,
    previousB,
  ],
};

function resolvedRecord(
  id,
  correct,
  probability,
  engine,
) {
  return {
    id,
    symbolId: symbolA.id,
    ticker: symbolA.ticker,
    symbol: symbolA,
    engine,
    generatedAt: 1000,
    dueAt: 2000,
    referencePrice: 100,
    confidence: 70,
    dataMode: "provider",
    expectedOutcome: "bull",
    expectedProbability:
      probability,
    probabilities: {
      bull: probability,
      base: 20,
      bear:
        80 - probability,
    },
    thresholdPercent: 1,
    status: "resolved",
    evaluatedAt:
      3000 + Number(id),
    evaluationPrice:
      correct ? 104 : 96,
    realizedReturnPercent:
      correct ? 4 : -4,
    realizedOutcome:
      correct ? "bull" : "bear",
    correct,
  };
}

const journal = [
  resolvedRecord(
    "1",
    true,
    60,
    "marketos-forecast-v3",
  ),
  resolvedRecord(
    "2",
    true,
    65,
    "marketos-forecast-v3",
  ),
  resolvedRecord(
    "3",
    false,
    70,
    "marketos-forecast-v2",
  ),
  {
    id: "pending",
    symbolId: symbolB.id,
    ticker: symbolB.ticker,
    symbol: symbolB,
    engine:
      "marketos-forecast-v3",
    generatedAt: 5000,
    dueAt: 9000,
    referencePrice: 100,
    confidence: 75,
    dataMode: "provider",
    expectedOutcome: "bull",
    expectedProbability: 64,
    probabilities: {
      bull: 64,
      base: 22,
      bear: 14,
    },
    thresholdPercent: 1,
    status: "pending",
  },
];

const alerts = [
  {
    id: "watch-bbb",
    symbol: symbolB,
    timeframe: "1h",
    logic: "all",
    conditions: [
      {
        id: "c1",
        type: "numeric",
        metric: "price",
        operator: "above",
        value: 110,
      },
    ],
    enabled: true,
    createdAt: 1,
  },
  {
    id: "unrelated",
    symbol: symbolA,
    timeframe: "1h",
    logic: "all",
    conditions: [
      {
        id: "c2",
        type: "numeric",
        metric: "price",
        operator: "above",
        value: 150,
      },
    ],
    enabled: true,
    createdAt: 2,
  },
];

const brief =
  buildAnalystBrief({
    radarCache,
    journal,
    alerts,
  });

assert.equal(
  brief.available,
  true,
);
assert.equal(
  brief.topSetup?.symbol.id,
  symbolB.id,
);
assert.equal(
  brief.topSetup?.probability,
  68,
);
assert.equal(
  brief.topChange?.symbol.id,
  symbolA.id,
);
assert.equal(
  brief.topChange?.change,
  "reversal",
);
assert.equal(
  brief.topChange
    ?.previousDirection,
  "bear",
);
assert.equal(
  brief.catalyst?.symbol.id,
  symbolB.id,
);
assert.equal(
  brief.catalyst?.direction,
  "positive",
);
assert.equal(
  brief.catalyst
    ?.latestSurprisePercent,
  12.4,
);
assert.equal(
  brief.watchCount,
  1,
);
assert.equal(
  brief.performance.engine,
  "marketos-forecast-v3",
);
assert.equal(
  brief.performance.scope,
  "all-history",
);
assert.equal(
  brief.performance.sampleStatus,
  "insufficient",
);
assert.equal(
  brief.performance.currentEngineResolved,
  2,
);
assert.equal(
  brief.performance.accuracy,
  67,
);
assert.equal(
  brief.performance.resolved,
  3,
);
assert.equal(
  brief.performance.correct,
  2,
);
assert.equal(
  brief.performance.accuracyLow95,
  null,
);
assert.equal(
  brief.performance.accuracyHigh95,
  null,
);
assert.equal(
  brief.performance.pending,
  1,
);
assert.equal(
  brief.modelHealth.status,
  "learning",
);
assert.equal(
  brief.modelHealth.resolved,
  2,
);
assert.equal(
  brief.performance.driftStatus,
  "insufficient",
);
assert.equal(
  brief.performance.driftAccuracyDelta,
  null,
);
assert.equal(
  brief.performance.driftRecentSize,
  2,
);
assert.equal(
  brief.performance.driftBaselineSize,
  0,
);
assert.equal(
  brief.performance.reliabilityStatus,
  "insufficient",
);
assert.equal(
  brief.performance.reliabilityResolved,
  2,
);
assert.equal(
  brief.performance.reliabilityEce,
  null,
);

const matureJournal = [
  ...journal,
  resolvedRecord(
    "4",
    true,
    62,
    "marketos-forecast-v3",
  ),
  resolvedRecord(
    "5",
    false,
    67,
    "marketos-forecast-v3",
  ),
  resolvedRecord(
    "6",
    true,
    71,
    "marketos-forecast-v3",
  ),
];

const matureBrief =
  buildAnalystBrief({
    radarCache,
    journal:
      matureJournal,
    alerts,
  });

assert.equal(
  matureBrief.performance.scope,
  "current-engine",
);
assert.equal(
  matureBrief.performance.currentEngineResolved,
  5,
);
assert.equal(
  matureBrief.performance.sampleStatus,
  "early",
);
assert.equal(
  matureBrief.performance.accuracy,
  80,
);
assert.equal(
  matureBrief.performance.correct,
  4,
);
assert.equal(
  matureBrief.performance.resolved,
  5,
);
assert.equal(
  matureBrief.performance.accuracyLow95,
  38,
);
assert.equal(
  matureBrief.performance.accuracyHigh95,
  96,
);
assert.equal(
  matureBrief.performance.driftStatus,
  "insufficient",
);
assert.equal(
  matureBrief.performance.reliabilityStatus,
  "insufficient",
);
assert.equal(
  matureBrief.performance.reliabilityResolved,
  5,
);
assert.equal(
  matureBrief.modelHealth.status,
  "learning",
);
assert.equal(
  brief.radarProviderCount,
  2,
);
assert.equal(
  brief.radarDemoCount,
  0,
);

const home =
  readFileSync(
    "apps/web/src/components/HomeDashboard.tsx",
    "utf8",
  );
const card =
  readFileSync(
    "apps/web/src/components/AnalystBriefCard.tsx",
    "utf8",
  );
const app =
  readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

assert.match(
  home,
  /AnalystBriefCard/,
);
assert.match(
  home,
  /loadAnalystRadarCache/,
);
assert.match(
  home,
  /loadForecastJournal/,
);
assert.match(
  home,
  /scanAnalystRadar/,
);
assert.match(
  home,
  /isAnalystRadarCacheStale/,
);
assert.match(
  home,
  /analystBriefRefreshStage/,
);
assert.match(
  home,
  /refreshMaturedForecasts/,
);
assert.match(
  home,
  /shouldAutoRefreshForecastMonitor/,
);
assert.match(
  home,
  /saveForecastJournal/,
);
assert.match(
  card,
  /MARKETOS ANALYST BRIEF/,
);
assert.match(
  card,
  /Forecast Watch/,
);
assert.match(
  card,
  /المحرك الحالي/,
);
assert.match(
  card,
  /brief\.performance\.engine/,
);
assert.match(
  card,
  /يجمع عينة/,
);
assert.match(
  card,
  /accuracyLow95/,
);
assert.match(
  card,
  /performanceDriftLabel/,
);
assert.match(
  card,
  /reliabilityBriefLabel/,
);
assert.match(
  card,
  /reliabilityEce/,
);
assert.match(
  card,
  /modelHealthBriefLabel/,
);
assert.match(
  card,
  /home-model-health/,
);
assert.match(
  card,
  /driftAccuracyDelta/,
);
assert.match(
  card,
  /النتائج تتحقق/,
);
assert.match(
  app,
  /watchlist=\{watchlist\}/,
);
assert.match(
  app,
  /alerts=\{alerts\}/,
);
assert.match(
  app,
  /onOpenAnalyst/,
);

console.log(
  "Analyst Brief smoke passed:",
  JSON.stringify({
    top:
      brief.topSetup?.symbol
        .ticker,
    change:
      brief.topChange?.change,
    catalyst:
      brief.catalyst?.direction,
    watches:
      brief.watchCount,
    accuracy:
      brief.performance
        .accuracy,
  }),
);
