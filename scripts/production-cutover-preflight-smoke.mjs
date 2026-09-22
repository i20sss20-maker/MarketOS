import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "infrastructure/azure/production-cutover-preflight.ps1",
  "utf8",
);

for (const marker of [
  "MARKETOS_ENVIRONMENT",
  "MARKETOS_REQUIRE_REAL_DATA",
  "MARKETOS_WEB_ORIGIN",
  "MARKET_DATA_PROVIDER",
  "TWELVE_DATA_API_KEY",
  "MARKET_DATA_TIMING",
  "MARKET_DATA_USAGE_SCOPE",
  "MARKET_DATA_RIGHTS_CONFIRMED",
  "USER_DATA_PROVIDER",
  "ENTITLEMENT_DATA_PROVIDER",
  "COSMOS_CONNECTION_STRING",
  "FORECAST_JOURNAL_ENABLED",
  "FORECAST_DAILY_HARD_CAP",
  "MARKET_DATA_DAILY_REQUEST_HARD_CAP",
  "MARKETOS_METRIC_ALERTS_CONFIGURED",
  "MARKETOS_COST_BUDGET_CONFIGURED",
  "APPLICATIONINSIGHTS_CONNECTION_STRING",
  "FORECAST_EVALUATION_ENABLED",
  "MARKETOS_WORKER_SECRET",
  "azure-production",
  "AZURE_STATIC_WEB_APPS_API_TOKEN",
  "COSMOS_CONNECTION_STRING",
  "MARKETOS_WORKER_SECRET",
  "AZURE_CREDENTIALS",
  "market-data-acceptance",
  "No secret values were printed",
]) {
  assert.ok(
    source.includes(marker),
    `Missing preflight marker: ${marker}`,
  );
}

assert.match(
  source,
  /az staticwebapp appsettings list/,
);
assert.match(
  source,
  /gh api \$endpoint/,
);
assert.match(
  source,
  /exit 2/,
);
assert.match(
  source,
  /COSMOS_RESTORE_CONNECTION_STRING is intentionally not required here/,
);

assert.doesNotMatch(
  source,
  /Write-Host\s+\$settings|Write-Output\s+\$settings|ConvertTo-Json\s+\$settings/i,
  "Preflight must never print the app-settings object.",
);
assert.doesNotMatch(
  source,
  /Write-Host\s+\$settings\.|Write-Output\s+\$settings\./i,
  "Preflight must never print individual setting values.",
);
assert.doesNotMatch(
  source,
  /az\s+(group|staticwebapp|cosmosdb)\s+(create|delete)|appsettings\s+(set|delete)|gh\s+secret\s+set/i,
  "Preflight must be read-only.",
);
assert.doesNotMatch(
  source,
  /Invoke-RestMethod\s+-Method\s+(Put|Patch|Delete|Post)/i,
  "Preflight must not mutate Azure through REST.",
);

console.log(
  "Production cutover preflight smoke passed: required gates covered, read-only, secret values never printed.",
);
