import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";
import ts from "typescript";

const url = source =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );
const compile = source =>
  ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
const api =
  "services/api/src/";
const cosmosUrl =
  url(
    "export class CosmosClient { constructor(){ throw new Error('not used'); } }",
  );
const overrides =
  new Map([
    [
      "@azure/cosmos",
      cosmosUrl,
    ],
  ]);
const cache =
  new Map();

function load(path) {
  path = resolve(path);
  if (cache.has(path)) {
    return cache.get(path);
  }

  let compiled =
    compile(
      readFileSync(
        path,
        "utf8",
      ),
    );

  compiled =
    compiled.replace(
      /from\s+(["'])([^"']+)\1/g,
      (
        _,
        _quote,
        specifier,
      ) => {
        const target =
          overrides.get(
            specifier,
          ) ??
          (
            specifier.startsWith(
              ".",
            )
              ? load(
                  resolve(
                    dirname(path),
                    specifier.replace(
                      /\.js$/,
                      ".ts",
                    ),
                  ),
                )
              : specifier
          );

        return `from ${JSON.stringify(target)}`;
      },
    );

  const result =
    url(compiled);
  cache.set(
    path,
    result,
  );
  return result;
}

const quota =
  await import(
    load(
      api +
        "usage/marketDataQuota.ts",
    ),
  );
const cosmos =
  await import(
    load(
      api +
        "usage/cosmosMarketDataQuota.ts",
    ),
  );

const {
  configuredMarketDataHardCap,
  marketDataUsageWindow,
} = quota;
const {
  CosmosMarketDataQuotaStore,
} = cosmos;

const errorCode =
  code =>
    error =>
      error?.code ===
      code;

assert.throws(
  () =>
    configuredMarketDataHardCap(
      {},
    ),
  errorCode(
    "MARKET_DATA_QUOTA_NOT_CONFIGURED",
  ),
);
for (const value of [
  "0",
  "100001",
  "1.5",
  "abc",
]) {
  assert.throws(
    () =>
      configuredMarketDataHardCap({
        MARKET_DATA_DAILY_REQUEST_HARD_CAP:
          value,
      }),
    errorCode(
      "MARKET_DATA_QUOTA_NOT_CONFIGURED",
    ),
  );
}
assert.equal(
  configuredMarketDataHardCap({
    MARKET_DATA_DAILY_REQUEST_HARD_CAP:
      "2500",
  }),
  2500,
);

const now =
  Date.UTC(
    2026,
    8,
    21,
    8,
  );
const window =
  marketDataUsageWindow(
    now,
  );
assert.equal(
  window.id,
  "market-data-usage:2026-09-21",
);
assert.equal(
  window.resetAt,
  Date.UTC(
    2026,
    8,
    22,
  ),
);

function fakeContainer(
  partition =
    "/userId",
) {
  const records =
    new Map();
  let etag = 0;
  const key = (
    id,
    userId,
  ) =>
    `${userId}:${id}`;

  return {
    records,
    read: async () => ({
      resource: {
        partitionKey: {
          paths: [
            partition,
          ],
        },
      },
    }),
    item: (
      id,
      userId,
    ) => ({
      read: async () => {
        const value =
          records.get(
            key(
              id,
              userId,
            ),
          );
        if (!value) {
          throw {
            code: 404,
          };
        }
        return {
          resource:
            structuredClone(
              value,
            ),
        };
      },
      replace: async (
        next,
        options,
      ) => {
        const current =
          records.get(
            key(
              id,
              userId,
            ),
          );
        if (!current) {
          throw {
            code: 404,
          };
        }
        if (
          options
            ?.accessCondition
            ?.condition !==
          current._etag
        ) {
          throw {
            code: 412,
          };
        }

        const stored = {
          ...structuredClone(
            next,
          ),
          _etag:
            `e${++etag}`,
        };
        records.set(
          key(
            id,
            userId,
          ),
          stored,
        );
        return {
          resource:
            structuredClone(
              stored,
            ),
        };
      },
    }),
    items: {
      create:
        async record => {
          const k =
            key(
              record.id,
              record.userId,
            );
          if (
            records.has(k)
          ) {
            throw {
              code: 409,
            };
          }
          const stored = {
            ...structuredClone(
              record,
            ),
            _etag:
              `e${++etag}`,
          };
          records.set(
            k,
            stored,
          );
          return {
            resource:
              structuredClone(
                stored,
              ),
          };
        },
    },
  };
}

const container =
  fakeContainer();
const store =
  new CosmosMarketDataQuotaStore(
    container,
  );

const first =
  await store.consume(
    "owner-a",
    5,
    2,
    now,
  );
const second =
  await store.consume(
    "owner-a",
    5,
    3,
    now + 1,
  );
const denied =
  await store.consume(
    "owner-a",
    5,
    1,
    now + 2,
  );

assert.deepEqual(
  [
    first.allowed,
    second.allowed,
    denied.allowed,
  ],
  [
    true,
    true,
    false,
  ],
);
assert.deepEqual(
  [
    first.used,
    second.used,
    denied.used,
  ],
  [
    2,
    5,
    5,
  ],
);
assert.equal(
  denied.remaining,
  0,
);

const raceContainer =
  fakeContainer();
const raceStore =
  new CosmosMarketDataQuotaStore(
    raceContainer,
  );
const decisions =
  await Promise.all(
    Array.from(
      {
        length: 12,
      },
      (_, index) =>
        raceStore.consume(
          "owner-race",
          5,
          1,
          now + index,
        ),
    ),
  );
assert.equal(
  decisions.filter(
    item =>
      item.allowed,
  ).length,
  5,
);
assert.equal(
  decisions.filter(
    item =>
      !item.allowed,
  ).length,
  7,
);
assert.equal(
  [
    ...raceContainer
      .records
      .values(),
  ][0].count,
  5,
);

const oversized =
  await new CosmosMarketDataQuotaStore(
    fakeContainer(),
  ).consume(
    "owner-large",
    3,
    4,
    now,
  );
assert.equal(
  oversized.allowed,
  false,
);
assert.equal(
  oversized.used,
  0,
);

await assert.rejects(
  () =>
    new CosmosMarketDataQuotaStore(
      fakeContainer(
        "/wrong",
      ),
    ).consume(
      "owner",
      1,
      1,
      now,
    ),
  errorCode(
    "INVALID_MARKET_DATA_QUOTA_PARTITION",
  ),
);

const protectedRoutes = [
  "marketQuote.ts",
  "marketCandles.ts",
  "marketSearch.ts",
  "marketOverview.ts",
  "marketEvents.ts",
  "companyFeed.ts",
];

for (
  const name
  of protectedRoutes
) {
  const source =
    readFileSync(
      `services/api/src/functions/${name}`,
      "utf8",
    );
  const quotaIndex =
    source.indexOf(
      "await authorizeProductionMarketRequest(request)",
    );
  const providerIndex =
    Math.min(
      ...[
        source.indexOf(
          "marketDataProvider.",
        ),
        source.indexOf(
          "marketEventsProvider.",
        ),
        source.indexOf(
          "companyFeedProvider.",
        ),
      ].filter(
        value =>
          value >= 0,
      ),
    );

  assert.ok(
    quotaIndex >= 0 &&
      providerIndex >= 0 &&
      quotaIndex <
        providerIndex,
    `${name} must reserve quota before provider work`,
  );
}

const multi =
  readFileSync(
    "services/api/src/functions/multiTimeframeAnalyze.ts",
    "utf8",
  );
assert.match(
  multi,
  /consumeProductionMarketQuota\([\s\S]*1 \+ timeframes\.length/,
);
assert.ok(
  multi.indexOf(
    "consumeProductionMarketQuota",
  ) <
    multi.indexOf(
      "marketDataProvider.getQuote",
    ),
);

const bootstrap =
  readFileSync(
    "infrastructure/azure/bootstrap-production-storage.ps1",
    "utf8",
  );
assert.match(
  bootstrap,
  /Parameter\(Mandatory = \$true\)[\s\S]*MarketDataDailyRequestHardCap/,
);
assert.match(
  bootstrap,
  /MARKET_DATA_DAILY_REQUEST_HARD_CAP=/,
);

const hosted =
  readFileSync(
    "scripts/hosted-boundary-acceptance.mjs",
    "utf8",
  );
assert.match(
  hosted,
  /spoofAttempt/,
);
assert.match(
  hosted,
  /401, 403/,
);

console.log(
  "Market-data request quota smoke passed: no default cap, atomic multi-unit concurrency, provider routes reserve before work, Multi-Timeframe reserves planned calls.",
);
