import assert from "node:assert/strict";

process.env.MARKETOS_ENVIRONMENT =
  "local";

const {
  CosmosMarketApiQuotaStore,
} = await import(
  "../services/api/dist/src/usage/cosmosMarketApiQuota.js"
);

const {
  configuredMarketApiHardCap,
  marketApiUsageWindow,
} = await import(
  "../services/api/dist/src/usage/marketApiQuota.js"
);

assert.equal(
  configuredMarketApiHardCap({
    MARKET_API_DAILY_HARD_CAP:
      "1000",
  }),
  1000,
);

for (
  const value
  of [
    undefined,
    "99",
    "100001",
    "1.5",
    "abc",
  ]
) {
  assert.throws(
    () =>
      configuredMarketApiHardCap({
        ...(value ===
        undefined
          ? {}
          : {
              MARKET_API_DAILY_HARD_CAP:
                value,
            }),
      }),
    error =>
      error.code ===
      "MARKET_API_QUOTA_NOT_CONFIGURED",
  );
}

const window =
  marketApiUsageWindow(
    Date.UTC(
      2026,
      8,
      21,
      12,
    ),
  );

assert.equal(
  window.day,
  "2026-09-21",
);
assert.equal(
  window.id,
  "market-api-usage:2026-09-21",
);
assert.equal(
  window.resetAt,
  Date.UTC(
    2026,
    8,
    22,
  ),
);

let current = null;
let etagCounter = 0;

function clone(value) {
  return value
    ? structuredClone(
        value,
      )
    : value;
}

const container = {
  read: async () => ({
    resource: {
      partitionKey: {
        paths: [
          "/userId",
        ],
      },
    },
  }),
  item(id, userId) {
    return {
      async read() {
        if (
          !current ||
          current.id !== id ||
          current.userId !==
            userId
        ) {
          throw {
            code: 404,
          };
        }

        return {
          resource:
            clone(current),
        };
      },
      async replace(
        next,
        options,
      ) {
        if (
          !current ||
          options
            ?.accessCondition
            ?.condition !==
            current._etag
        ) {
          throw {
            code: 412,
          };
        }

        etagCounter += 1;
        current = {
          ...clone(next),
          _etag:
            `etag-${etagCounter}`,
        };

        return {
          resource:
            clone(current),
        };
      },
    };
  },
  items: {
    async create(record) {
      if (current) {
        throw {
          code: 409,
        };
      }

      etagCounter += 1;
      current = {
        ...clone(record),
        _etag:
          `etag-${etagCounter}`,
      };

      return {
        resource:
          clone(current),
      };
    },
  },
};

const store =
  new CosmosMarketApiQuotaStore(
    container,
  );

const owner =
  "hashed-owner";

const first =
  await store.consume(
    owner,
    100,
    2,
    Date.UTC(
      2026,
      8,
      21,
      12,
    ),
  );

assert.deepEqual(
  {
    allowed:
      first.allowed,
    used:
      first.used,
    remaining:
      first.remaining,
  },
  {
    allowed: true,
    used: 2,
    remaining: 98,
  },
);

const second =
  await store.consume(
    owner,
    100,
    23,
    Date.UTC(
      2026,
      8,
      21,
      12,
      1,
    ),
  );

assert.equal(
  second.used,
  25,
);

for (
  let i = 0;
  i < 3;
  i += 1
) {
  const decision =
    await store.consume(
      owner,
      100,
      25,
      Date.UTC(
        2026,
        8,
        21,
        12,
        2 + i,
      ),
    );

  assert.equal(
    decision.allowed,
    true,
  );
}

assert.equal(
  current.count,
  100,
);

const denied =
  await store.consume(
    owner,
    100,
    1,
    Date.UTC(
      2026,
      8,
      21,
      13,
    ),
  );

assert.equal(
  denied.allowed,
  false,
);
assert.equal(
  denied.used,
  100,
);
assert.equal(
  current.count,
  100,
  "Denied requests must not mutate usage.",
);

current = null;
etagCounter = 0;

const concurrent =
  await Promise.all(
    Array.from(
      {
        length: 5,
      },
      (_, index) =>
        store.consume(
          owner,
          100,
          1,
          Date.UTC(
            2026,
            8,
            21,
            14,
            index,
          ),
        ),
    ),
  );

assert.equal(
  concurrent.every(
    item =>
      item.allowed,
  ),
  true,
);
assert.equal(
  current.count,
  5,
  "Concurrent requests must not lose increments.",
);

const wrongPartition =
  new CosmosMarketApiQuotaStore({
    ...container,
    read: async () => ({
      resource: {
        partitionKey: {
          paths: [
            "/wrong",
          ],
        },
      },
    }),
  });

await assert.rejects(
  () =>
    wrongPartition.consume(
      owner,
      100,
      1,
    ),
  error =>
    error.code ===
    "INVALID_JOURNAL_PARTITION",
);

const {
  readFileSync,
} = await import(
  "node:fs",
);

for (
  const name
  of [
    "marketQuote.ts",
    "marketCandles.ts",
    "marketSearch.ts",
    "marketOverview.ts",
    "marketEvents.ts",
    "companyFeed.ts",
  ]
) {
  const source =
    readFileSync(
      `services/api/src/functions/${name}`,
      "utf8",
    );

  assert.match(
    source,
    /await authorizeProductionMarketRequest\(request/,
    `${name} must consume quota before provider work.`,
  );
}

const multi =
  readFileSync(
    "services/api/src/functions/multiTimeframeAnalyze.ts",
    "utf8",
  );

assert.match(
  multi,
  /authorizeProductionMarketRequest/,
);
assert.match(
  multi,
  /timeframes\.length \* 2/,
);

const readiness =
  readFileSync(
    "services/api/src/functions/productionReadiness.ts",
    "utf8",
  );

assert.match(
  readiness,
  /configuredMarketApiHardCap\(\)/,
);

const storage =
  readFileSync(
    "infrastructure/azure/bootstrap-production-storage.ps1",
    "utf8",
  );

assert.match(
  storage,
  /MARKET_API_DAILY_HARD_CAP=/,
);

console.log(
  "Market API quota smoke passed: weighted daily cap, ETag concurrency, exhaustion, partition safety and provider-route integration verified with no live provider calls.",
);
