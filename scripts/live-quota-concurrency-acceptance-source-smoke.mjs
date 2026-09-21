import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/live-quota-concurrency-acceptance.yml",
    "utf8",
  );
const script =
  readFileSync(
    "scripts/live-quota-concurrency-acceptance.mjs",
    "utf8",
  );

assert.match(
  workflow,
  /workflow_dispatch:/,
);
assert.match(
  workflow,
  /environment: azure-production/,
);
assert.match(
  workflow,
  /COSMOS_CONNECTION_STRING/,
);
assert.match(
  workflow,
  /node-version: 22/,
);
assert.doesNotMatch(
  workflow,
  /\bpush:|\bschedule:/,
);
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA_API_KEY|MARKET_DATA_API_KEY|AZURE_STATIC_WEB_APPS_API_TOKEN/,
);
assert.doesNotMatch(
  workflow,
  /curl|wget|\/api\/market|\/api\/user/,
);

for (
  const marker
  of [
    "CosmosForecastQuotaStore",
    "CosmosMarketDataQuotaStore",
    "length: 6",
    "length: 4",
    "forecastRecord.count",
    "marketRecord.count",
    "cleanupVerified",
  ]
) {
  assert.ok(
    script.includes(
      marker,
    ),
    `Missing live quota acceptance marker: ${marker}`,
  );
}

assert.doesNotMatch(
  script,
  /fetch\(|https?:\/\//,
  "Live quota acceptance must not call market providers or hosted APIs.",
);
assert.doesNotMatch(
  script,
  /database\.containers\.create|databases\.create|throughput/i,
  "Acceptance must never provision Cosmos resources or throughput.",
);

console.log(
  "Live quota concurrency acceptance source smoke passed: manual-only, bounded, Cosmos-only, no provider/API calls or resource provisioning.",
);
