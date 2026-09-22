import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "infrastructure/azure/sync-live-acceptance-secrets.ps1",
  "utf8",
);

for (const marker of [
  "az staticwebapp appsettings list",
  'Require-SecretValue $settings "COSMOS_CONNECTION_STRING" 20',
  'Require-SecretValue $settings "MARKETOS_WORKER_SECRET" 32',
  "$cosmosConnectionString | gh secret set COSMOS_CONNECTION_STRING",
  "$workerSecret | gh secret set MARKETOS_WORKER_SECRET",
  "--env $GitHubEnvironment",
  "--repo $GitHubRepo",
  "gh secret list",
  "same credential values configured on the app",
  "No secret value was printed",
  "AZURE_CREDENTIALS and COSMOS_RESTORE_CONNECTION_STRING are intentionally not managed",
]) {
  assert.ok(
    source.includes(marker),
    `Missing live-acceptance secret sync safety marker: ${marker}`,
  );
}

for (const secretVariable of [
  "cosmosConnectionString",
  "workerSecret",
]) {
  assert.doesNotMatch(
    source,
    new RegExp(
      `Write-(?:Host|Output)\\s+\\$${secretVariable}|echo\\s+\\$${secretVariable}`,
      "i",
    ),
    `${secretVariable} must never be printed.`,
  );
  assert.doesNotMatch(
    source,
    new RegExp(
      `gh\\s+secret\\s+set[\\s\\S]{0,160}--body\\s+\\$${secretVariable}`,
      "i",
    ),
    `${secretVariable} must reach GitHub through stdin, not --body.`,
  );
}

assert.doesNotMatch(
  source,
  /Set-Content|Out-File|Add-Content/,
  "Live acceptance secrets must not be persisted to local files.",
);

assert.doesNotMatch(
  source,
  /az\s+(group|staticwebapp|cosmosdb)\s+(create|delete)|gh\s+api\s+--method\s+(PUT|POST|PATCH|DELETE)/i,
  "Credential sync must not create/delete Azure resources or GitHub environments.",
);

assert.match(
  source,
  /finally\s*{/,
);
assert.match(
  source,
  /\$cosmosConnectionString = \$null/,
);
assert.match(
  source,
  /\$workerSecret = \$null/,
);

console.log(
  "Live-acceptance secret sync smoke passed: Cosmos and evaluator credentials are copied from Azure app settings to the existing GitHub production environment through stdin without printing or persisting values.",
);
