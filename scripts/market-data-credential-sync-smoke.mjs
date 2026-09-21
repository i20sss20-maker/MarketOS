import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "infrastructure/azure/sync-market-data-credential.ps1",
  "utf8",
);

for (const marker of [
  'Read-Host "Enter the Twelve Data API key (input is hidden)" -AsSecureString',
  "SecureStringToBSTR",
  "ZeroFreeBSTR",
  "listAppSettings?api-version=2025-05-01",
  "config/appsettings?api-version=2025-05-01",
  'properties["TWELVE_DATA_API_KEY"] = $apiKey',
  "Invoke-RestMethod -Method Put",
  "$apiKey | gh secret set TWELVE_DATA_API_KEY",
  "--env $GitHubEnvironment",
  "No provider key value was printed",
  "does NOT enable production market data",
]) {
  assert.ok(
    source.includes(marker),
    `Missing provider credential safety marker: ${marker}`,
  );
}

assert.doesNotMatch(
  source,
  /Write-Host\s+\$apiKey|echo\s+\$apiKey/i,
  "Provider key must never be printed.",
);

assert.doesNotMatch(
  source,
  /az\s+staticwebapp\s+appsettings\s+set[\s\S]{0,500}TWELVE_DATA_API_KEY/i,
  "Provider key must not be placed in Azure CLI process arguments.",
);

assert.doesNotMatch(
  source,
  /gh\s+secret\s+set[\s\S]{0,120}--body\s+\$apiKey/i,
  "Provider key must reach GitHub through stdin, not a command-line --body argument.",
);

assert.doesNotMatch(
  source,
  /Set-Content|Out-File|Add-Content/,
  "Provider credential helper must not persist secrets to local files.",
);

assert.doesNotMatch(
  source,
  /MARKETOS_REQUIRE_REAL_DATA=true|MARKET_DATA_PROVIDER=twelvedata/,
  "Credential sync must not activate production/provider mode.",
);

console.log(
  "Market-data credential sync smoke passed: hidden input, in-memory Azure REST update, stdin GitHub secret, no activation or secret files.",
);
