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
    "COSMOS_CONNECTION_STRING is required for live account-erasure storage acceptance.",
  );
}

const databaseId =
  process.env.COSMOS_DATABASE?.trim() ||
  "marketos";
const userContainerId =
  process.env.COSMOS_CONTAINER?.trim() ||
  "userState";
const entitlementContainerId =
  process.env.COSMOS_ENTITLEMENTS_CONTAINER?.trim() ||
  "entitlements";
const forecastContainerId =
  process.env.FORECAST_JOURNAL_CONTAINER?.trim() ||
  "forecastJournal";

process.env.MARKETOS_WEB_ORIGIN =
  "https://marketos.acceptance.invalid";

const require =
  createRequire(
    new URL(
      "../services/api/package.json",
      import.meta.url,
    ),
  );
const azureFunctions =
  require(
    "@azure/functions",
  );
const {
  CosmosClient,
} = require(
  "@azure/cosmos",
);
const {
  HttpRequest,
} = azureFunctions;

const {
  CosmosUserStateStore,
} = await import(
  "../services/api/dist/src/storage/cosmosUserStore.js"
);
const {
  CosmosEntitlementStore,
} = await import(
  "../services/api/dist/src/entitlements/cosmosEntitlementStore.js"
);
const {
  CosmosForecastLedger,
} = await import(
  "../services/api/dist/src/forecasts/cosmosLedger.js"
);
const {
  ownerKey,
} = await import(
  "../services/api/dist/src/forecasts/ledger.js"
);
const {
  createAccountDataEraseHandler,
} = await import(
  "../services/api/dist/src/functions/accountDataErase.js"
);

const userId =
  `erasure-${randomUUID()}`;
const otherUserId =
  `erasure-other-${randomUUID()}`;

const principal = {
  userId,
  identityProvider:
    "aad",
  userRoles: [
    "authenticated",
  ],
  userDetails:
    "acceptance@example.invalid",
};
const otherPrincipal = {
  userId:
    otherUserId,
  identityProvider:
    "aad",
  userRoles: [
    "authenticated",
  ],
  userDetails:
    "other@example.invalid",
};

const forecastOwner =
  ownerKey({
    userId,
    identityProvider:
      "aad",
    userDetails:
      principal.userDetails,
    roles: [
      "authenticated",
    ],
  });
const otherForecastOwner =
  ownerKey({
    userId:
      otherUserId,
    identityProvider:
      "aad",
    userDetails:
      otherPrincipal.userDetails,
    roles: [
      "authenticated",
    ],
  });

const userStore =
  new CosmosUserStateStore(
    connectionString,
    databaseId,
    userContainerId,
  );
const entitlementStore =
  new CosmosEntitlementStore(
    connectionString,
    databaseId,
    entitlementContainerId,
  );

const client =
  new CosmosClient(
    connectionString,
  );
const forecastContainer =
  client
    .database(databaseId)
    .container(
      forecastContainerId,
    );
const ledger =
  new CosmosForecastLedger(
    forecastContainer,
  );

const handler =
  createAccountDataEraseHandler({
    userStore,
    entitlementStore,
    forecastLedger:
      () => ledger,
  });

const cloudState = {
  version: 1,
  updatedAt:
    Date.now(),
  watchlist: [],
  watchlistCollections: [],
  workspaces: [],
  alerts: [],
  alertEvents: [],
  pushSubscriptions: [],
  chartSettings: null,
  customIndicators: [],
  chartTemplates: [],
  drawings: {},
  ui: {},
};

const entitlement = (
  owner,
) => ({
  userId: owner,
  plan: "free",
  status: "active",
  source: "internal",
  updatedAt:
    Date.now(),
});

const targetForecastIds =
  Array.from(
    { length: 3 },
    () =>
      `erasure-record-${randomUUID()}`,
  );
const sentinelForecastId =
  `erasure-sentinel-${randomUUID()}`;

const evidence = {
  checkedAt:
    new Date().toISOString(),
  database:
    databaseId,
  containers: {
    userState:
      userContainerId,
    entitlements:
      entitlementContainerId,
    forecastJournal:
      forecastContainerId,
  },
  targetForecastItems:
    targetForecastIds.length,
  handlerStatus: null,
  reportedForecastItemsDeleted:
    null,
  targetUserStateDeleted:
    false,
  targetEntitlementDeleted:
    false,
  targetForecastPartitionEmpty:
    false,
  otherOwnerPreserved:
    false,
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

async function deleteForecastPartition(
  owner,
) {
  for (
    let round = 0;
    round < 10;
    round += 1
  ) {
    const page =
      await forecastContainer
        .items
        .query(
          {
            query:
              "SELECT TOP 100 c.id FROM c WHERE c.userId = @userId",
            parameters: [
              {
                name:
                  "@userId",
                value:
                  owner,
              },
            ],
          },
          {
            partitionKey:
              owner,
            maxItemCount:
              100,
          },
        )
        .fetchNext();

    const ids =
      (page.resources ?? [])
        .map(
          (item) =>
            item?.id,
        )
        .filter(
          (id) =>
            typeof id ===
              "string" &&
            id.length > 0,
        );

    if (
      ids.length === 0
    ) {
      return;
    }

    for (
      const id
      of ids
    ) {
      try {
        await forecastContainer
          .item(
            id,
            owner,
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

  throw new Error(
    "Could not clean the temporary forecast partition within the bounded cleanup loop.",
  );
}

async function countForecastPartition(
  owner,
) {
  const page =
    await forecastContainer
      .items
      .query(
        {
          query:
            "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId",
          parameters: [
            {
              name:
                "@userId",
              value:
                owner,
            },
          ],
        },
        {
          partitionKey:
            owner,
        },
      )
      .fetchNext();

  return Number(
    page.resources?.[0] ??
      0,
  );
}

try {
  await userStore.put(
    userId,
    cloudState,
  );
  await userStore.put(
    otherUserId,
    cloudState,
  );

  await entitlementStore.set(
    entitlement(userId),
  );
  await entitlementStore.set(
    entitlement(
      otherUserId,
    ),
  );

  for (
    const id
    of targetForecastIds
  ) {
    await forecastContainer
      .items
      .create({
        id,
        userId:
          forecastOwner,
        kind:
          "marketos-erasure-acceptance-v1",
        createdAt:
          Date.now(),
      });
  }

  await forecastContainer
    .items
    .create({
      id:
        sentinelForecastId,
      userId:
        otherForecastOwner,
      kind:
        "marketos-erasure-acceptance-v1",
      createdAt:
        Date.now(),
    });

  assert.ok(
    await userStore.get(
      userId,
    ),
  );
  assert.ok(
    await entitlementStore.get(
      userId,
    ),
  );
  assert.equal(
    await countForecastPartition(
      forecastOwner,
    ),
    3,
  );

  const encodedPrincipal =
    Buffer.from(
      JSON.stringify(
        principal,
      ),
    ).toString(
      "base64",
    );

  const request =
    new HttpRequest({
      method: "POST",
      url:
        "https://marketos.acceptance.invalid/api/user/account-data/erase",
      headers: {
        origin:
          "https://marketos.acceptance.invalid",
        "content-type":
          "application/json",
        "x-ms-client-principal":
          encodedPrincipal,
      },
      body: {
        string:
          JSON.stringify({
            confirmation:
              "DELETE MARKETOS DATA",
          }),
      },
    });

  const response =
    await handler(
      request,
    );

  evidence.handlerStatus =
    response.status ?? 200;
  evidence.reportedForecastItemsDeleted =
    response.jsonBody
      ?.forecastItemsDeleted ??
    null;

  assert.equal(
    evidence.handlerStatus,
    200,
  );
  assert.equal(
    response.jsonBody?.ok,
    true,
  );
  assert.equal(
    response.jsonBody?.erased,
    true,
  );
  assert.equal(
    response.jsonBody
      ?.forecastItemsDeleted,
    3,
  );

  evidence.targetUserStateDeleted =
    (await userStore.get(
      userId,
    )) === null;
  evidence.targetEntitlementDeleted =
    (await entitlementStore.get(
      userId,
    )) === null;
  evidence.targetForecastPartitionEmpty =
    (await countForecastPartition(
      forecastOwner,
    )) === 0;

  assert.equal(
    evidence.targetUserStateDeleted,
    true,
  );
  assert.equal(
    evidence.targetEntitlementDeleted,
    true,
  );
  assert.equal(
    evidence.targetForecastPartitionEmpty,
    true,
  );

  const otherState =
    await userStore.get(
      otherUserId,
    );
  const otherEntitlement =
    await entitlementStore.get(
      otherUserId,
    );
  const otherForecastCount =
    await countForecastPartition(
      otherForecastOwner,
    );

  assert.ok(
    otherState,
  );
  assert.ok(
    otherEntitlement,
  );
  assert.equal(
    otherForecastCount,
    1,
  );

  evidence.otherOwnerPreserved =
    true;
} finally {
  await userStore.delete(
    userId,
  );
  await userStore.delete(
    otherUserId,
  );
  await entitlementStore.delete(
    userId,
  );
  await entitlementStore.delete(
    otherUserId,
  );
  await deleteForecastPartition(
    forecastOwner,
  );
  await deleteForecastPartition(
    otherForecastOwner,
  );
}

assert.equal(
  await userStore.get(
    userId,
  ),
  null,
);
assert.equal(
  await userStore.get(
    otherUserId,
  ),
  null,
);
assert.equal(
  await entitlementStore.get(
    userId,
  ),
  null,
);
assert.equal(
  await entitlementStore.get(
    otherUserId,
  ),
  null,
);
assert.equal(
  await countForecastPartition(
    forecastOwner,
  ),
  0,
);
assert.equal(
  await countForecastPartition(
    otherForecastOwner,
  ),
  0,
);

evidence.cleanupVerified =
  true;

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/live-account-erasure-storage-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  "Live account-erasure storage acceptance passed: the real handler removed target user state, entitlement and forecast-partition data in Cosmos while preserving another owner, then temporary acceptance data was fully cleaned.",
);
