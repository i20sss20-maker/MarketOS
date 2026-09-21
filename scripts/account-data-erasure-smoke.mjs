import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";
import ts from "typescript";

const dataUrl = source =>
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

const policyUrl =
  dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function forecastLedgerConfig() {
  throw new Error("not used");
}
`);

const ledgerTypesUrl =
  dataUrl("export {};");

let ledgerCode =
  compile(
    readFileSync(
      "services/api/src/forecasts/cosmosLedger.ts",
      "utf8",
    ),
  )
    .replace(
      /from\s+["']@azure\/cosmos["']/g,
      `from ${JSON.stringify(dataUrl("export class CosmosClient {}"))}`,
    )
    .replace(
      /from\s+["']\.\.\/production\/policy\.js["']/g,
      `from ${JSON.stringify(policyUrl)}`,
    )
    .replace(
      /from\s+["']\.\/ledger\.js["']/g,
      `from ${JSON.stringify(ledgerTypesUrl)}`,
    );

const {
  CosmosForecastLedger,
} = await import(
  dataUrl(ledgerCode),
);

const partitions =
  new Map([
    [
      "owner-A",
      new Map([
        [
          "forecast-1",
          {
            id: "forecast-1",
            userId: "owner-A",
            kind:
              "marketos-forecast-v1",
          },
        ],
        [
          "usage-1",
          {
            id: "usage-1",
            userId: "owner-A",
            kind:
              "marketos-forecast-usage-v1",
          },
        ],
      ]),
    ],
    [
      "owner-B",
      new Map([
        [
          "forecast-B",
          {
            id: "forecast-B",
            userId: "owner-B",
            kind:
              "marketos-forecast-v1",
          },
        ],
      ]),
    ],
  ]);

const fakeContainer = {
  read: async () => ({
    resource: {
      partitionKey: {
        paths: [
          "/userId",
        ],
      },
    },
  }),
  items: {
    query: (
      _query,
      options,
    ) => ({
      fetchNext:
        async () => ({
          resources: [
            ...(
              partitions.get(
                options.partitionKey,
              )?.values() ??
              []
            ),
          ]
            .slice(0, 100)
            .map(item => ({
              id: item.id,
            })),
        }),
    }),
    batch: async (
      operations,
      owner,
    ) => {
      const partition =
        partitions.get(owner);

      for (
        const operation
        of operations
      ) {
        assert.equal(
          operation.operationType,
          "Delete",
        );
        partition?.delete(
          operation.id,
        );
      }

      return {
        result:
          operations.map(
            () => ({
              statusCode: 204,
            }),
          ),
      };
    },
  },
};

const ledger =
  new CosmosForecastLedger(
    fakeContainer,
  );

const erased =
  await ledger.deleteUserData(
    "owner-A",
  );

assert.equal(
  erased.deleted,
  2,
);
assert.equal(
  partitions.get("owner-A")
    ?.size,
  0,
);
assert.equal(
  partitions.get("owner-B")
    ?.size,
  1,
  "Another user's partition must not be touched.",
);

assert.rejects(
  () =>
    ledger.deleteUserData(""),
  error =>
    error.code ===
    "INVALID_ERASURE_OWNER",
);

const cosmosSource =
  readFileSync(
    "services/api/src/forecasts/cosmosLedger.ts",
    "utf8",
  );
assert.doesNotMatch(
  cosmosSource,
  /deleteAllItemsForPartitionKey/,
  "Account erasure must not depend on the Cosmos delete-by-partition preview feature.",
);
assert.match(
  cosmosSource,
  /partitionKey: userId/,
);
assert.match(
  cosmosSource,
  /items\.batch/,
);

const endpoint =
  readFileSync(
    "services/api/src/functions/accountDataErase.ts",
    "utf8",
  );

for (
  const marker
  of [
    "DELETE MARKETOS DATA",
    "getAuthenticatedUser",
    "assertRequestOrigin",
    "deps.userStore.delete",
    "deps.entitlementStore.delete",
    "ledger.deleteUserData",
    "Promise.allSettled",
    "ACCOUNT_ERASURE_INCOMPLETE",
    "retrySafe: true",
  ]
) {
  assert.ok(
    endpoint.includes(
      marker,
    ),
    `Missing erasure endpoint marker: ${marker}`,
  );
}

assert.doesNotMatch(
  endpoint,
  /userId\s*:\s*body|owner\s*:\s*body/,
  "The browser must not choose the account owner to erase.",
);

const client =
  readFileSync(
    "apps/web/src/lib/cloudState.ts",
    "utf8",
  );
assert.match(
  client,
  /\/api\/user\/account-data\/erase/,
);
assert.match(
  client,
  /credentials: "same-origin"/,
);

const panel =
  readFileSync(
    "apps/web/src/components/AccountPanel.tsx",
    "utf8",
  );
assert.match(
  panel,
  /حذف جميع بيانات MarketOS السحابية/,
);
assert.match(
  panel,
  /حساب Microsoft\/GitHub نفسه لا يُحذف/,
);

const app =
  readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );
assert.match(
  app,
  /window\.prompt/,
);
assert.match(
  app,
  /confirmation !== "DELETE MARKETOS DATA"/,
);
assert.match(
  app,
  /بيانات هذا الجهاز المحلية لم تُحذف/,
);

console.log(
  "Account data erasure smoke passed: user forecast/quota partition deletion is isolated and stable; endpoint/UI require authenticated exact confirmation.",
);
