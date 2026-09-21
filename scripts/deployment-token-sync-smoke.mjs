import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const source =
  readFileSync(
    "infrastructure/azure/sync-deployment-token.ps1",
    "utf8",
  );

for (
  const required
  of [
    "az staticwebapp secrets list",
    "properties.apiKey",
    "gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN",
    "--env $environment",
    "--repo $Repository",
    "azure-preview",
    "azure-production",
    "gh secret list",
    "The deployment token value was never printed",
  ]
) {
  assert.ok(
    source.includes(required),
    `Missing secure token-sync marker: ${required}`,
  );
}

assert.doesNotMatch(
  source,
  /Write-Host\s+\$token|Write-Output\s+\$token|echo\s+\$token/i,
);
assert.doesNotMatch(
  source,
  /--body\s+["']?\$token/i,
  "Deployment token must be piped on stdin instead of placed on the command line.",
);
assert.doesNotMatch(
  source,
  /gh api\s+--method\s+PUT|az staticwebapp create/,
  "Token sync must not create/modify GitHub environments or Azure resources.",
);
assert.match(
  source,
  /\$token \| gh secret set/,
);

console.log(
  "Deployment-token sync smoke passed: token is retrieved from Azure, piped to existing GitHub environments, verified by name, and never printed or placed in CLI arguments.",
);
