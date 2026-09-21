import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/azure-production.yml",
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
  /DEPLOY MARKETOS PRODUCTION/,
);
assert.match(
  workflow,
  /environment: azure-production/,
);
assert.match(
  workflow,
  /VITE_MARKETOS_REQUIRE_REAL_DATA: "true"/,
);
assert.match(
  workflow,
  /smoke:production-client/,
);
assert.match(
  workflow,
  /smoke:production-foundation/,
);
assert.match(
  workflow,
  /smoke:production-market-auth/,
);
assert.match(
  workflow,
  /smoke:market-data-provenance/,
);
assert.match(
  workflow,
  /smoke:operations-guardrails/,
);
assert.match(
  workflow,
  /smoke:account-data-erasure/,
);
assert.match(
  workflow,
  /hosted-boundary-acceptance\.mjs/,
);
assert.match(
  workflow,
  /AZURE_STATIC_WEB_APPS_API_TOKEN/,
);
assert.match(
  workflow,
  /skip_app_build: true/,
);
assert.match(
  workflow,
  /skip_api_build: true/,
);
assert.match(
  workflow,
  /npm install --package-lock-only --ignore-scripts --prefix artifacts\/azure-api/,
);
assert.match(
  workflow,
  /npm ci --omit=dev --ignore-scripts --prefix artifacts\/azure-api/,
);
assert.match(
  workflow,
  /actions\/download-artifact@v4/,
);
assert.match(
  workflow,
  /name: marketos-production-bundle/,
);
assert.match(
  workflow,
  /id: deploy_swa/,
);
assert.match(
  workflow,
  /steps\.deploy_swa\.outputs\.static_web_app_url/,
);
assert.match(
  workflow,
  /needs\.deploy\.outputs\.deployed_url/,
);
assert.match(
  workflow,
  /does not match Azure deployment/,
);
const deploySection =
  workflow.slice(
    workflow.indexOf("\n  deploy:"),
    workflow.indexOf("\n  acceptance:"),
  );
assert.doesNotMatch(
  deploySection,
  /pnpm build|pnpm prepare:azure-api|pnpm install/,
  "Deploy job must use the verified artifact instead of rebuilding application source.",
);
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING|MARKETOS_WORKER_SECRET/,
  "Deployment workflow must not receive provider, database or worker secrets.",
);

const preview =
  readFileSync(
    ".github/workflows/azure-preview.yml",
    "utf8",
  );
assert.doesNotMatch(
  preview,
  /VITE_MARKETOS_REQUIRE_REAL_DATA:\s*['"]?true/,
  "Preview deployment must remain separate from strict production.",
);

console.log(
  "Azure production deploy source smoke passed: manual exact confirmation, strict bundle, isolated deployment token and hosted acceptance are required.",
);
