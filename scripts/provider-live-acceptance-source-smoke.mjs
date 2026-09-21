import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const workflow =
  readFileSync(
    ".github/workflows/provider-integration.yml",
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
  /I CONFIRM MARKET DATA RIGHTS/,
);
assert.match(
  workflow,
  /MARKET_DATA_TIMING/,
);
assert.match(
  workflow,
  /MARKET_DATA_USAGE_SCOPE/,
);
assert.match(
  workflow,
  /MARKET_DATA_RIGHTS_CONFIRMED_AT/,
);
assert.match(
  workflow,
  /environment: market-data-acceptance/,
);
assert.match(
  workflow,
  /TWELVE_DATA_API_KEY: \$\{\{ secrets\.TWELVE_DATA_API_KEY \}\}/,
);
assert.match(
  workflow,
  /provider-live-acceptance\.json/,
);

const live =
  readFileSync(
    "scripts/provider-live-smoke.mjs",
    "utf8",
  );

for (
  const marker
  of [
    "assertMarketDataPolicy",
    "timestampKind",
    "last-quote",
    "XNAS",
    "XSAU",
    "7203",
    "2222",
    "provider-live-acceptance.json",
    "no API key or price is written",
  ]
) {
  assert.ok(
    live.includes(marker),
    `Missing provider acceptance marker: ${marker}`,
  );
}

assert.doesNotMatch(
  live,
  /apiKey\s*[,}]/,
  "Evidence must never serialize the API key.",
);
assert.doesNotMatch(
  live,
  /quote\.price\s*[,}]/,
  "Evidence must not serialize a live price.",
);

const provider =
  readFileSync(
    "services/api/src/providers/twelveDataProvider.ts",
    "utf8",
  );
assert.match(
  provider,
  /last_quote_at/,
);
assert.match(
  provider,
  /timestampKind/,
);

const guard =
  readFileSync(
    "services/api/src/production/providerGuard.ts",
    "utf8",
  );
assert.match(
  guard,
  /quote\.timestampKind !== "last-quote"/,
);
assert.match(
  guard,
  /allowedDelayMinutes/,
);

console.log(
  "Provider live acceptance source smoke passed: manual rights declaration, secret isolation, last_quote_at semantics and non-secret evidence are enforced.",
);
