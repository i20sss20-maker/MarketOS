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

assert.deepEqual(
  usage.normalizeForecastUsage({
    used: 3,
    limit: 10,
    remaining: 7,
    resetAt,
  }),
  {
    used: 3,
    limit: 10,
    remaining: 7,
    resetAt,
    updatedAt:
      usage.normalizeForecastUsage({
        used: 3,
        limit: 10,
        remaining: 7,
        resetAt,
      }).updatedAt,
  },
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
  /!strictRealData/,
);
assert.match(
  home,
  /scanAnalystRadar/,
);

console.log(
  "Strict forecast usage smoke passed: receipt validation, visible usage, and no hidden strict Radar generation.",
);
