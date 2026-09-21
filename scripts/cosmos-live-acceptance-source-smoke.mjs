import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/cosmos-live-acceptance.yml",
    "utf8",
  );

assert.match(
  workflow,
  /workflow_dispatch:/,
);
assert.doesNotMatch(
  workflow,
  /^\s*push:/m,
);
assert.doesNotMatch(
  workflow,
  /^\s*schedule:/m,
);
assert.match(
  workflow,
  /environment: azure-production/,
);
assert.match(
  workflow,
  /secrets\.COSMOS_CONNECTION_STRING/,
);
assert.match(
  workflow,
  /cosmos-live-acceptance\.json/,
);
assert.doesNotMatch(
  workflow,
  /echo.*COSMOS_CONNECTION_STRING/i,
);

const live =
  readFileSync(
    "scripts/cosmos-live-acceptance.mjs",
    "utf8",
  );

for (
  const marker
  of [
    "new CosmosClient",
    "marketos-storage-acceptance-v1",
    '["/userId"]',
    "independentClientRead",
    "crossPartitionPointReadBlocked",
    "cleanupVerified",
    ".delete()",
    "cosmos-live-acceptance.json",
  ]
) {
  assert.ok(
    live.includes(marker),
    `Missing Cosmos acceptance marker: ${marker}`,
  );
}

assert.doesNotMatch(
  live,
  /databases\.create|containers\.create|createIfNotExists/,
  "Live acceptance must never provision Cosmos infrastructure or throughput.",
);
assert.doesNotMatch(
  live,
  /writeFileSync[\s\S]{0,300}connectionString/,
  "Evidence must not serialize the Cosmos connection string.",
);

console.log(
  "Cosmos live acceptance source smoke passed: manual-only, secret-isolated, no infrastructure provisioning, temporary records are cleaned up.",
);
