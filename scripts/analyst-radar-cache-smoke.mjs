import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const storageMap =
  new Map();

globalThis.window = {
  localStorage: {
    getItem(key) {
      return storageMap.has(key)
        ? storageMap.get(key)
        : null;
    },
    setItem(key, value) {
      storageMap.set(
        key,
        String(value),
      );
    },
    removeItem(key) {
      storageMap.delete(key);
    },
  },
};

const source = readFileSync(
  "apps/web/src/lib/analystRadarCache.ts",
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
  ANALYST_RADAR_CACHE_TTL_MS,
  analystRadarSignature,
  isAnalystRadarCacheStale,
  loadAnalystRadarCache,
  saveAnalystRadarCache,
} = await import(
  moduleUrl
);

const a = {
  id: "NASDAQ:A",
  ticker: "A",
  name: "A",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const b = {
  id: "NASDAQ:B",
  ticker: "B",
  name: "B",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const forecast = {
  engine: "marketos-forecast-v2",
  generatedAt: 1_800_000_000,
  symbol: a,
  dataProvider: "test",
  dataMode: "provider",
  timeframes: ["1h"],
  bias: "bullish",
  confidence: 70,
  risk: "medium",
  regime: "trend",
  horizon: "test",
  referencePrice: 100,
  support: 95,
  resistance: 105,
  expectedRangeLow: 92,
  expectedRangeHigh: 108,
  summary: "test",
  scenarios: [
    {
      id: "bull",
      label: "bull",
      probability: 60,
      targetLow: 105,
      targetHigh: 108,
      trigger: "test",
      invalidation: "test",
      rationale: [],
    },
    {
      id: "base",
      label: "base",
      probability: 25,
      targetLow: 98,
      targetHigh: 102,
      trigger: "test",
      invalidation: "test",
      rationale: [],
    },
    {
      id: "bear",
      label: "bear",
      probability: 15,
      targetLow: 92,
      targetHigh: 95,
      trigger: "test",
      invalidation: "test",
      rationale: [],
    },
  ],
  catalysts: [],
  evidence: [],
  uncertaintyNote: "test",
};

const item = {
  symbol: a,
  forecast,
  direction: "bull",
  directionProbability: 60,
  confidence: 70,
  clarity: 72,
  calibrated: false,
};

assert.equal(
  analystRadarSignature([
    a,
    b,
  ]),
  "NASDAQ:A|NASDAQ:B",
);

const firstSaved =
  saveAnalystRadarCache(
    [a, b],
    [item],
    10_000,
  );

assert.ok(firstSaved);
assert.equal(
  firstSaved.previousItems.length,
  0,
);

const nextItem = {
  ...item,
  confidence: 78,
  clarity: 82,
  forecast: {
    ...forecast,
    generatedAt:
      forecast.generatedAt +
      60,
    confidence: 78,
  },
};

const secondSaved =
  saveAnalystRadarCache(
    [a, b],
    [nextItem],
    20_000,
  );

assert.ok(secondSaved);
assert.equal(
  secondSaved.previousUpdatedAt,
  10_000,
);
assert.equal(
  secondSaved.previousItems.length,
  1,
);
assert.equal(
  secondSaved.previousItems[0]
    .clarity,
  72,
);

const restored =
  loadAnalystRadarCache([
    a,
    b,
  ]);

assert.ok(restored);
assert.equal(
  restored.items.length,
  1,
);
assert.equal(
  restored.items[0]
    .symbol.id,
  a.id,
);
assert.equal(
  restored.items[0]
    .clarity,
  82,
);
assert.equal(
  restored.updatedAt,
  20_000,
);
assert.equal(
  restored.previousUpdatedAt,
  10_000,
);
assert.equal(
  restored.previousItems[0]
    .clarity,
  72,
);

assert.equal(
  isAnalystRadarCacheStale(
    restored,
    20_000 +
      ANALYST_RADAR_CACHE_TTL_MS -
      1,
  ),
  false,
);

assert.equal(
  isAnalystRadarCacheStale(
    restored,
    20_000 +
      ANALYST_RADAR_CACHE_TTL_MS,
  ),
  true,
);

assert.equal(
  loadAnalystRadarCache([
    b,
    a,
  ]),
  null,
);

const view = readFileSync(
  "apps/web/src/components/AnalystRadarView.tsx",
  "utf8",
);

assert.match(
  view,
  /loadAnalystRadarCache/,
);
assert.match(
  view,
  /saveAnalystRadarCache/,
);
assert.match(
  view,
  /runRadar\(true\)/,
);
assert.match(
  view,
  /15\s*دقيقة/,
);
assert.match(
  view,
  /previousItems/,
);
assert.match(
  view,
  /candidateSignature/,
);

console.log(
  "Analyst Radar V3 cache smoke passed:",
  JSON.stringify({
    ttlMinutes:
      ANALYST_RADAR_CACHE_TTL_MS /
      60_000,
    restored:
      restored.items.length,
  }),
);
