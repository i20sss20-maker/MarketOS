import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/live-account-erasure-storage-acceptance.yml",
    "utf8",
  );
const script =
  readFileSync(
    "scripts/live-account-erasure-storage-acceptance.mjs",
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
  /curl|wget|\/api\/market/,
);

for (
  const marker
  of [
    "CosmosUserStateStore",
    "CosmosEntitlementStore",
    "CosmosForecastLedger",
    "createAccountDataEraseHandler",
    "DELETE MARKETOS DATA",
    "otherOwnerPreserved",
    "cleanupVerified",
  ]
) {
  assert.ok(
    script.includes(
      marker,
    ),
    `Missing live erasure acceptance marker: ${marker}`,
  );
}

assert.doesNotMatch(
  script,
  /fetch\(|https?:\/\/(?!marketos\.acceptance\.invalid)/,
  "Live erasure acceptance must not call providers or external hosted services.",
);
assert.doesNotMatch(
  script,
  /database\.containers\.create|databases\.create|throughput/i,
  "Live erasure acceptance must not provision Cosmos resources.",
);

console.log(
  "Live account-erasure storage acceptance source smoke passed: manual-only, Cosmos-only, real handler orchestration, owner-preservation and cleanup checks, no provider/resource provisioning.",
);
