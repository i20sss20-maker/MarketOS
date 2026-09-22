import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const dataUrl = source =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString("base64");

const usageSource = readFileSync(
  "apps/web/src/lib/forecastUsage.ts",
  "utf8",
);
const usage = await import(
  dataUrl(compile(usageSource)),
);

const resetAt =
  Date.now() + 60_000;

const normalized =
  usage.normalizeForecastUsage({
    used: 3,
    limit: 10,
    remaining: 7,
    resetAt,
  });
assert.equal(normalized.used, 3);
assert.equal(normalized.limit, 10);
assert.equal(normalized.remaining, 7);
assert.equal(normalized.resetAt, resetAt);
assert.ok(
  Number.isSafeInteger(
    normalized.updatedAt,
  ),
);

for (const invalid of [
  null,
  {},
  {
    used: -1,
    limit: 10,
    remaining: 10,
    resetAt,
  },
  {
    used: 1,
    limit: 0,
    remaining: 0,
    resetAt,
  },
  {
    used: 1,
    limit: 501,
    remaining: 500,
    resetAt,
  },
  {
    used: 1,
    limit: 10,
    remaining: 11,
    resetAt,
  },
  {
    used: 1,
    limit: 10,
    remaining: 9,
    resetAt: Date.now() - 1,
  },
]) {
  assert.equal(
    usage.normalizeForecastUsage(
      invalid,
    ),
    null,
  );
}

const aiApi =
  readFileSync(
    "apps/web/src/lib/aiApi.ts",
    "utf8",
  );
const view =
  readFileSync(
    "apps/web/src/components/AnalystForecastView.tsx",
    "utf8",
  );
const radar =
  readFileSync(
    "apps/web/src/components/AnalystRadarView.tsx",
    "utf8",
  );
const home =
  readFileSync(
    "apps/web/src/components/HomeDashboard.tsx",
    "utf8",
  );
const multiTimeframe =
  readFileSync(
    "services/api/src/functions/multiTimeframeAnalyze.ts",
    "utf8",
  );

assert.match(
  aiApi,
  /recordForecastUsage/,
);
assert.match(
  aiApi,
  /payload\?\.usage/,
);
assert.match(
  view,
  /FORECAST_USAGE_EVENT/,
);
assert.match(
  view,
  /استخدام Analyst اليوم/,
);
assert.match(
  radar,
  /!strictRealData/,
);
assert.match(
  radar,
  /يبدأ الفحص يدويًا فقط/,
);
assert.match(
  home,
  /if \(REQUIRE_REAL_DATA\)/,
);
assert.match(
  home,
  /listAllServerForecasts/,
);
assert.match(
  home,
  /if \(REQUIRE_REAL_DATA\)[\s\S]*?return;[\s\S]*?scanAnalystRadar/,
);
assert.match(
  home,
  /scanAnalystRadar/,
);

for (
  const marker
  of [
    "consumeProductionAiQuery",
    "consumeProductionMarketQuota",
    "assertRealProvider",
    "assertForecastEvidenceFresh",
    "assertMarketDataPolicy",
  ]
) {
  assert.ok(
    multiTimeframe.includes(
      marker,
    ),
    `Strict Multi-Timeframe AI missing protection: ${marker}`,
  );
}

const multiHandlerIndex =
  multiTimeframe.indexOf(
    "export async function multiTimeframeAnalyze",
  );
const multiAiQuotaIndex =
  multiTimeframe.indexOf(
    "consumeProductionAiQuery",
    multiHandlerIndex,
  );
const multiMarketQuotaIndex =
  multiTimeframe.indexOf(
    "consumeProductionMarketQuota",
    multiHandlerIndex,
  );
const multiProviderIndex =
  multiTimeframe.indexOf(
    "marketDataProvider.getQuote",
    multiHandlerIndex,
  );
const multiFreshnessIndex =
  multiTimeframe.indexOf(
    "assertForecastEvidenceFresh",
    multiHandlerIndex,
  );
const multiBuildIndex =
  multiTimeframe.indexOf(
    "buildMultiTimeframeAnalysis",
    multiHandlerIndex,
  );

assert.ok(
  multiHandlerIndex >= 0 &&
    multiAiQuotaIndex >
      multiHandlerIndex &&
    multiMarketQuotaIndex >
      multiAiQuotaIndex &&
    multiProviderIndex >
      multiMarketQuotaIndex &&
    multiFreshnessIndex >
      multiProviderIndex &&
    multiBuildIndex >
      multiFreshnessIndex,
  "Strict Multi-Timeframe AI must reserve AI quota, reserve market-data quota, load provider evidence, validate freshness, then build analysis.",
);

const multiClientIndex =
  aiApi.indexOf(
    "export async function analyzeMultipleTimeframes",
  );
const multiUsageIndex =
  aiApi.indexOf(
    "recordForecastUsage",
    multiClientIndex,
  );

assert.ok(
  multiClientIndex >= 0 &&
    multiUsageIndex >
      multiClientIndex,
  "Strict Multi-Timeframe client must record the shared AI usage receipt.",
);

console.log(
  "Strict forecast usage smoke passed: receipt validation, visible usage, no hidden strict Radar generation, and Multi-Timeframe AI shares strict quota plus fresh provider evidence.",
);
