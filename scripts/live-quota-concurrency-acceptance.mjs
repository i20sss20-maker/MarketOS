import assert from "node:assert/strict";
import {
  randomUUID,
} from "node:crypto";
import {
  createRequire,
} from "node:module";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";

const connectionString =
  process.env.COSMOS_CONNECTION_STRING?.trim();

if (!connectionString) {
  throw new Error(
    "COSMOS_CONNECTION_STRING is required for live quota concurrency acceptance.",
  );
}

const databaseId =
  process.env.COSMOS_DATABASE?.trim() ||
  "marketos";
const containerId =
  process.env.FORECAST_JOURNAL_CONTAINER?.trim() ||
  "forecastJournal";

const require =
  createRequire(
    new URL(
      "../services/api/package.json",
      import.meta.url,
    ),
  );
const {
  CosmosClient,
} = require(
  "@azure/cosmos",
);

const {
  CosmosForecastQuotaStore,
} = await import(
  "../services/api/dist/src/usage/cosmosForecastQuota.js"
);
const {
  CosmosMarketDataQuotaStore,
} = await import(
  "../services/api/dist/src/usage/cosmosMarketDataQuota.js"
);
const {
  utcUsageWindow,
} = await import(
  "../services/api/dist/src/usage/forecastQuota.js"
);
const {
  marketDataUsageWindow,
} = await import(
  "../services/api/dist/src/usage/marketDataQuota.js"
);

const client =
  new CosmosClient(
    connectionString,
  );
const container =
  client
    .database(databaseId)
    .container(containerId);

const {
  resource: containerResource,
} = await container.read();

assert.deepEqual(
  containerResource?.partitionKey?.paths,
  ["/userId"],
  "Forecast journal must use /userId partitioning.",
);

const now =
  Date.now();
const forecastOwner =
  `quota-forecast-${randomUUID()}`;
const marketOwner =
  `quota-market-${randomUUID()}`;
const forecastWindow =
  utcUsageWindow(now);
const marketWindow =
  marketDataUsageWindow(now);

const cleanup = [
  {
    owner:
      forecastOwner,
    id:
      forecastWindow.id,
  },
  {
    owner:
      marketOwner,
    id:
      marketWindow.id,
  },
];

const evidence = {
  checkedAt:
    new Date(now).toISOString(),
  database:
    databaseId,
  container:
    containerId,
  partitionKey:
    "/userId",
  forecast: {
    limit: 4,
    initialAllowed:
      false,
    concurrentAllowed: 0,
    concurrentDenied: 0,
    finalCount: null,
  },
  marketData: {
    limit: 5,
    unitsPerConcurrentRequest: 2,
    initialAllowed:
      false,
    concurrentAllowed: 0,
    concurrentDenied: 0,
    finalCount: null,
  },
  cleanupVerified:
    false,
};

function statusCode(error) {
  return error &&
    typeof error ===
      "object" &&
    "code" in error
    ? Number(error.code)
    : undefined;
}

async function readRecord(
  owner,
  id,
) {
  const {
    resource,
  } =
    await container
      .item(
        id,
        owner,
      )
      .read();

  assert.ok(
    resource,
    "Expected persisted quota record.",
  );
  return resource;
}

async function expectMissing(
  owner,
  id,
) {
  try {
    await container
      .item(
        id,
        owner,
      )
      .read();
  } catch (error) {
    assert.equal(
      statusCode(error),
      404,
    );
    return;
  }

  assert.fail(
    "Temporary quota record still exists after cleanup.",
  );
}

try {
  const forecastStore =
    new CosmosForecastQuotaStore(
      container,
    );

  const initialForecast =
    await forecastStore.consume(
      forecastOwner,
      4,
      now,
    );

  assert.equal(
    initialForecast.allowed,
    true,
  );
  assert.equal(
    initialForecast.used,
    1,
  );
  evidence.forecast.initialAllowed =
    true;

  const forecastBurst =
    await Promise.all(
      Array.from(
        { length: 6 },
        () =>
          forecastStore.consume(
            forecastOwner,
            4,
            now,
          ),
      ),
    );

  evidence.forecast.concurrentAllowed =
    forecastBurst.filter(
      (item) =>
        item.allowed,
    ).length;
  evidence.forecast.concurrentDenied =
    forecastBurst.filter(
      (item) =>
        !item.allowed,
    ).length;

  assert.equal(
    evidence.forecast.concurrentAllowed,
    3,
    "Exactly three concurrent forecast requests may consume the remaining quota.",
  );
  assert.equal(
    evidence.forecast.concurrentDenied,
    3,
    "Excess concurrent forecast requests must be denied without overshoot.",
  );

  const forecastRecord =
    await readRecord(
      forecastOwner,
      forecastWindow.id,
    );

  evidence.forecast.finalCount =
    forecastRecord.count;

  assert.equal(
    forecastRecord.count,
    4,
    "Forecast quota persisted count must stop exactly at the limit.",
  );
  assert.equal(
    forecastRecord.kind,
    "marketos-forecast-usage-v1",
  );

  const marketStore =
    new CosmosMarketDataQuotaStore(
      container,
    );

  const initialMarket =
    await marketStore.consume(
      marketOwner,
      5,
      1,
      now,
    );

  assert.equal(
    initialMarket.allowed,
    true,
  );
  assert.equal(
    initialMarket.used,
    1,
  );
  evidence.marketData.initialAllowed =
    true;

  const marketBurst =
    await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          marketStore.consume(
            marketOwner,
            5,
            2,
            now,
          ),
      ),
    );

  evidence.marketData.concurrentAllowed =
    marketBurst.filter(
      (item) =>
        item.allowed,
    ).length;
  evidence.marketData.concurrentDenied =
    marketBurst.filter(
      (item) =>
        !item.allowed,
    ).length;

  assert.equal(
    evidence.marketData.concurrentAllowed,
    2,
    "Exactly two two-unit provider requests may consume the four remaining units.",
  );
  assert.equal(
    evidence.marketData.concurrentDenied,
    2,
    "Concurrent provider requests beyond the hard cap must be denied.",
  );

  const marketRecord =
    await readRecord(
      marketOwner,
      marketWindow.id,
    );

  evidence.marketData.finalCount =
    marketRecord.count;

  assert.equal(
    marketRecord.count,
    5,
    "Market-data quota persisted count must stop exactly at the limit.",
  );
  assert.equal(
    marketRecord.kind,
    "marketos-market-data-usage-v1",
  );
} finally {
  for (
    const item
    of cleanup
  ) {
    try {
      await container
        .item(
          item.id,
          item.owner,
        )
        .delete();
    } catch (error) {
      if (
        statusCode(error) !==
        404
      ) {
        throw error;
      }
    }
  }
}

for (
  const item
  of cleanup
) {
  await expectMissing(
    item.owner,
    item.id,
  );
}

evidence.cleanupVerified =
  true;

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/live-quota-concurrency-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  "Live quota concurrency acceptance passed: Cosmos forecast and market-data counters stopped exactly at their hard caps under bounded concurrent requests, and temporary records were removed.",
);
