import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );

const policyUrl = dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function realDataRequired(env = {}) {
  return env.MARKETOS_ENVIRONMENT === "production" ||
    env.MARKETOS_ENVIRONMENT === "azure-production" ||
    env.MARKETOS_REQUIRE_REAL_DATA === "true";
}
`);

let compiled =
  ts.transpileModule(
    readFileSync(
      "services/api/src/production/marketDataPolicy.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

compiled =
  compiled.replace(
    '"./policy.js"',
    JSON.stringify(policyUrl),
  );

const {
  marketDataPolicy,
  assertMarketDataPolicy,
} = await import(
  dataUrl(compiled),
);

const now =
  new Date(
    "2026-09-21T12:00:00Z",
  );

const production = {
  MARKETOS_ENVIRONMENT:
    "production",
};

assert.equal(
  marketDataPolicy(
    production,
    now,
  ).configured,
  false,
);

for (
  const [
    env,
    code,
  ] of [
    [
      production,
      "MARKET_DATA_TIMING_UNDECLARED",
    ],
    [
      {
        ...production,
        MARKET_DATA_TIMING:
          "delayed",
        MARKET_DATA_USAGE_SCOPE:
          "commercial",
        MARKET_DATA_RIGHTS_CONFIRMED:
          "true",
        MARKET_DATA_RIGHTS_CONFIRMED_AT:
          "2026-09-20",
      },
      "MARKET_DATA_DELAY_INVALID",
    ],
    [
      {
        ...production,
        MARKET_DATA_TIMING:
          "realtime",
      },
      "MARKET_DATA_USAGE_SCOPE_UNDECLARED",
    ],
    [
      {
        ...production,
        MARKET_DATA_TIMING:
          "realtime",
        MARKET_DATA_USAGE_SCOPE:
          "commercial",
      },
      "MARKET_DATA_RIGHTS_UNCONFIRMED",
    ],
    [
      {
        ...production,
        MARKET_DATA_TIMING:
          "realtime",
        MARKET_DATA_USAGE_SCOPE:
          "commercial",
        MARKET_DATA_RIGHTS_CONFIRMED:
          "true",
        MARKET_DATA_RIGHTS_CONFIRMED_AT:
          "2026-09-22",
      },
      "MARKET_DATA_RIGHTS_CONFIRMATION_INVALID",
    ],
    [
      {
        ...production,
        MARKET_DATA_TIMING:
          "end-of-day",
        MARKET_DATA_USAGE_SCOPE:
          "commercial",
        MARKET_DATA_RIGHTS_CONFIRMED:
          "true",
        MARKET_DATA_RIGHTS_CONFIRMED_AT:
          "2026-09-01",
        MARKET_DATA_RIGHTS_EXPIRES_AT:
          "2026-09-20",
      },
      "MARKET_DATA_RIGHTS_EXPIRED",
    ],
  ]
) {
  assert.throws(
    () =>
      assertMarketDataPolicy(
        env,
        now,
      ),
    (error) =>
      error.code === code,
  );
}

const delayed =
  assertMarketDataPolicy(
    {
      ...production,
      MARKET_DATA_TIMING:
        "delayed",
      MARKET_DATA_DELAY_MINUTES:
        "15",
      MARKET_DATA_USAGE_SCOPE:
        "commercial",
      MARKET_DATA_RIGHTS_CONFIRMED:
        "true",
      MARKET_DATA_RIGHTS_CONFIRMED_AT:
        "2026-09-20",
      MARKET_DATA_RIGHTS_EXPIRES_AT:
        "2027-09-20",
    },
    now,
  );

assert.deepEqual(
  delayed,
  {
    timing: "delayed",
    delayMinutes: 15,
    usageScope:
      "commercial",
    rightsConfirmed: true,
    rightsConfirmedAt:
      "2026-09-20",
    rightsExpiresAt:
      "2027-09-20",
    configured: true,
  },
);

const realtime =
  assertMarketDataPolicy(
    {
      ...production,
      MARKET_DATA_TIMING:
        "realtime",
      MARKET_DATA_USAGE_SCOPE:
        "personal",
      MARKET_DATA_RIGHTS_CONFIRMED:
        "true",
      MARKET_DATA_RIGHTS_CONFIRMED_AT:
        "2026-09-21",
    },
    now,
  );

assert.equal(
  realtime.delayMinutes,
  0,
);
assert.equal(
  realtime.configured,
  true,
);

const preview =
  assertMarketDataPolicy(
    {
      MARKETOS_ENVIRONMENT:
        "local",
    },
    now,
  );
assert.equal(
  preview.configured,
  false,
);

const readiness =
  readFileSync(
    "services/api/src/functions/productionReadiness.ts",
    "utf8",
  );
assert.match(
  readiness,
  /assertMarketDataPolicy\(\)/,
);

const health =
  readFileSync(
    "services/api/src/functions/health.ts",
    "utf8",
  );
assert.match(
  health,
  /dataPolicy: marketDataPolicy\(\)/,
);

const status =
  readFileSync(
    "services/api/src/functions/marketStatus.ts",
    "utf8",
  );
assert.match(
  status,
  /dataPolicy: marketDataPolicy\(\)/,
);

const app =
  readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );
assert.match(
  app,
  /Real-time/,
);
assert.match(
  app,
  /Delayed/,
);
assert.match(
  app,
  /EOD/,
);

const system =
  readFileSync(
    "apps/web/src/components/SystemPanel.tsx",
    "utf8",
  );
assert.match(
  system,
  /إقرار الحقوق/,
);
assert.match(
  system,
  /ليست تحققًا مستقلاً من الترخيص/,
);

console.log(
  "Market data provenance smoke passed: production fails closed without timing/rights declarations and UI exposes declared timing/scope.",
);
