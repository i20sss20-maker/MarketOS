import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/live-forecast-evaluation-acceptance.yml",
    "utf8",
  );
const script =
  readFileSync(
    "scripts/live-forecast-evaluation-acceptance.mjs",
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
  /RUN ONE MARKETOS EVALUATION/,
);
assert.match(
  workflow,
  /I UNDERSTAND EVALUATION CONSUMES MARKET DATA/,
);
assert.match(
  workflow,
  /MARKETOS_WORKER_SECRET/,
);
assert.doesNotMatch(
  workflow,
  /\bpush:|\bschedule:/,
);
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING|AZURE_STATIC_WEB_APPS_API_TOKEN/,
);

for (
  const marker
  of [
    "/api/internal/forecasts/evaluate",
    "invalid-acceptance-secret",
    "accepted.body?.acquired",
    "accepted.body.checked <= 3",
    "invalidCredentialRejected",
  ]
) {
  assert.ok(
    script.includes(
      marker,
    ),
    `Missing live evaluator acceptance marker: ${marker}`,
  );
}

assert.doesNotMatch(
  script,
  /console\.log\([^\n]*workerSecret|JSON\.stringify\([^\n]*workerSecret/,
  "Worker credential must never be logged or written to evidence.",
);
assert.doesNotMatch(
  script,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING/,
);

console.log(
  "Live forecast evaluator acceptance source smoke passed: manual-only, explicit provider-quota acknowledgement, invalid-secret probe, bounded three-record sweep, no provider/storage credentials.",
);
