import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/hosted-ingress-load-acceptance.yml",
    "utf8",
  );
const script =
  readFileSync(
    "scripts/hosted-ingress-load-acceptance.mjs",
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
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA|COSMOS|client-principal|Cookie|Authorization/,
);

assert.match(
  script,
  /"\/api\/health"/,
);
assert.doesNotMatch(
  script,
  /\/api\/market\//,
);
assert.doesNotMatch(
  script,
  /\/api\/user\//,
);
assert.match(
  script,
  /total >= 20/,
);
assert.match(
  script,
  /total <= 500/,
);
assert.match(
  script,
  /concurrency >= 1/,
);
assert.match(
  script,
  /concurrency <= 20/,
);
assert.match(
  script,
  /p95 <=[\s\S]*5000/,
);
assert.match(
  script,
  /does not prove provider\/Cosmos\/failover capacity/,
);

console.log(
  "Hosted ingress load source smoke passed: manual-only, bounded to health, no provider/Cosmos/authenticated paths or secrets.",
);
