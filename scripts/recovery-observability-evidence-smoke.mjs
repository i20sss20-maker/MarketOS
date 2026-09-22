import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const insightsWorkflow =
  readFileSync(
    ".github/workflows/application-insights-live-acceptance.yml",
    "utf8",
  );
const insightsVerifier =
  readFileSync(
    "infrastructure/azure/verify-application-insights.ps1",
    "utf8",
  );
const seedWorkflow =
  readFileSync(
    ".github/workflows/cosmos-recovery-marker.yml",
    "utf8",
  );
const restoreWorkflow =
  readFileSync(
    ".github/workflows/cosmos-restore-drill-acceptance.yml",
    "utf8",
  );
const recoveryScript =
  readFileSync(
    "scripts/cosmos-recovery-drill.mjs",
    "utf8",
  ) + readFileSync("scripts/cosmos-recovery-drill-lib.mjs", "utf8");
const releaseGate =
  readFileSync(
    "scripts/production-release-evidence-gate.mjs",
    "utf8",
  );

for (
  const workflow
  of [
    insightsWorkflow,
    seedWorkflow,
    restoreWorkflow,
  ]
) {
  assert.match(
    workflow,
    /workflow_dispatch:/,
  );
  assert.match(
    workflow,
    /github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(
    workflow,
    /environment: azure-production/,
  );
  assert.doesNotMatch(
    workflow,
    /\bpush:/,
  );
  assert.doesNotMatch(
    workflow,
    /\bschedule:/,
  );
}

assert.match(
  insightsWorkflow,
  /AZURE_CREDENTIALS/,
);
assert.match(
  insightsWorkflow,
  /verify-application-insights\.ps1/,
);
assert.match(
  insightsWorkflow,
  /az extension add --name application-insights/,
);
assert.match(
  insightsWorkflow,
  /application-insights-live-acceptance\.json/,
);
assert.doesNotMatch(
  insightsWorkflow,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING/,
);
assert.match(insightsWorkflow, /-ResourceGroup \$env:MARKETOS_RESOURCE_GROUP/);
assert.doesNotMatch(insightsWorkflow, /-ResourceGroup "\$\{\{|ApplicationInsightsApp "\$\{\{/);
for (const workflow of [seedWorkflow, restoreWorkflow]) {
  assert.match(workflow, /pnpm install --no-frozen-lockfile/);
}
assert.match(seedWorkflow, /MARKETOS_RECOVERY_MARKER_ID: recovery-\$\{\{ github.sha \}\}-\$\{\{ github.run_id \}\}/);

assert.match(
  insightsVerifier,
  /EvidencePath/,
);
assert.match(
  insightsVerifier,
  /telemetryFlowVerified/,
);
assert.match(
  insightsVerifier,
  /secretsIncluded = \$false/,
);
assert.match(insightsVerifier, /marketos_probe/);
assert.match(insightsVerifier, /releaseSha = \$releaseSha/);
assert.doesNotMatch(
  insightsVerifier,
  /Set-Content[^\n]*\$connectionString|Write-Host\s+\$connectionString|Write-Output\s+\$connectionString/,
);

assert.match(
  seedWorkflow,
  /COSMOS_CONNECTION_STRING/,
);
assert.match(
  seedWorkflow,
  /MARKETOS_RECOVERY_DRILL_MODE: seed/,
);
assert.match(
  seedWorkflow,
  /SEED MARKETOS RECOVERY MARKER/,
);

assert.match(
  restoreWorkflow,
  /COSMOS_RESTORE_CONNECTION_STRING/,
);
assert.match(
  restoreWorkflow,
  /MARKETOS_RECOVERY_DRILL_MODE: verify/,
);
assert.match(
  restoreWorkflow,
  /VERIFY MARKETOS RESTORE/,
);
assert.doesNotMatch(
  restoreWorkflow,
  /az cosmosdb restore|cosmosdb delete|az group delete/,
);

for (
  const marker
  of [
    "marketos-recovery-marker-v1",
    "sourceEndpointHash",
    "restoredEndpointHash",
    "assert.notEqual",
    "readOnlyVerification",
  ]
) {
  assert.ok(
    recoveryScript.includes(
      marker,
    ),
    `Recovery script missing ${marker}`,
  );
}

assert.doesNotMatch(
  recoveryScript,
  /\.delete\(|items\.upsert/,
);
// Check actual output with sentinel credentials instead of matching unrelated
// source text after Object.assign, which also matched the next branch's input.
await import("./cosmos-recovery-drill-runtime-smoke.mjs");

for (
  const workflow
  of [
    "application-insights-live-acceptance.yml",
    "cosmos-restore-drill-acceptance.yml",
  ]
) {
  assert.ok(
    releaseGate.includes(
      workflow,
    ),
    `Release gate must require ${workflow}`,
  );
}

console.log(
  "Recovery/observability evidence smoke passed: exact-main manual workflows, non-secret telemetry evidence, retained recovery markers, separate-account read-only restore verification, and release-gate coverage are enforced.",
);
