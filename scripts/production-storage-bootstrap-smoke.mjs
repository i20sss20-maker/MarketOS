import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const source =
  readFileSync(
    "infrastructure/azure/bootstrap-production-storage.ps1",
    "utf8",
  );

assert.match(
  source,
  /--enable-free-tier true/,
);
assert.match(
  source,
  /SharedThroughput = 1000/,
);
assert.match(
  source,
  /ForecastJournalContainer = "forecastJournal"/,
);
assert.match(
  source,
  /FORECAST_JOURNAL_ENABLED=true/,
);
assert.match(
  source,
  /FORECAST_DAILY_HARD_CAP=/,
);
assert.match(
  source,
  /partition key \/userId|partition-key-path "\/userId"/i,
);
assert.match(
  source,
  /does not use shared throughput/,
);
assert.match(
  source,
  /not Free Tier/,
);
assert.match(
  source,
  /above the 1000 RU\/s Cosmos Free Tier allowance/,
);
assert.match(
  source,
  /has dedicated throughput/,
);
assert.match(
  source,
  /No paid fallback was created/,
);
assert.doesNotMatch(
  source,
  /Write-Host \$connectionString/,
);
assert.doesNotMatch(
  source,
  /MARKETOS_REQUIRE_REAL_DATA=true/,
);
assert.doesNotMatch(
  source,
  /TWELVE_DATA_API_KEY=/,
);

const containerCreateLines =
  source
    .split("\n")
    .filter(
      (line) =>
        line.includes(
          "cosmosdb sql container create",
        ),
    );

assert.equal(
  containerCreateLines.length,
  1,
);
assert.doesNotMatch(
  containerCreateLines[0],
  /--throughput/,
  "Containers must inherit shared database throughput instead of provisioning dedicated RU/s.",
);

console.log(
  "Production storage bootstrap smoke passed: Free Tier required, shared throughput capped at 1000 RU/s, no paid fallback or provider activation.",
);
