import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const script =
  readFileSync(
    "scripts/hosted-boundary-acceptance.mjs",
    "utf8",
  );
const workflow =
  readFileSync(
    ".github/workflows/hosted-boundary-acceptance.yml",
    "utf8",
  );

assert.match(
  workflow,
  /workflow_dispatch:/,
);
assert.doesNotMatch(
  workflow,
  /\bpush:/,
);
assert.doesNotMatch(
  workflow,
  /\bschedule:/,
);
assert.match(
  workflow,
  /node-version: 22/,
);
assert.match(
  workflow,
  /MARKETOS_ACCEPTANCE_BASE_URL/,
);
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING|INTERNAL_FORECAST_EVALUATION_SECRET/,
);

assert.match(
  script,
  /production\/readiness/,
);
assert.match(
  script,
  /forecastQuota/,
);
assert.match(
  script,
  /metricAlertsConfigured/,
);
assert.match(
  script,
  /costBudgetConfigured/,
);
assert.match(
  script,
  /userData/,
);
assert.match(
  script,
  /AUTH_REQUIRED/,
);
assert.match(
  script,
  /DEMO_DISABLED/,
);
assert.match(
  script,
  /x-ms-client-principal/,
);
assert.match(
  script,
  /spoofed-acceptance-user/,
);
assert.match(
  script,
  /cannot reach the market-data provider/,
);
assert.match(
  script,
  /assert\.notEqual\([\s\S]*spoofAttempt\.status,[\s\S]*400/,
);
assert.match(
  script,
  /productionReady/,
);
assert.match(
  script,
  /redirect: "manual"/,
);
assert.match(
  script,
  /AbortSignal\.timeout/,
);

const providerPaths = [
  "/api/market/quote",
  "/api/market/candles",
  "/api/market/search",
  "/api/market/overview",
  "/api/market/events",
  "/api/market/feed",
];

for (const path of providerPaths) {
  assert.ok(
    script.includes(path),
    `Hosted acceptance must verify anonymous rejection for ${path}`,
  );
}

console.log(
  "Hosted boundary acceptance source smoke passed: manual-only, no provider/storage secrets, all strict provider boundaries covered.",
);
