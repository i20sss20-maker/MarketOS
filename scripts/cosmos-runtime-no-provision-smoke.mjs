import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );

const policyUrl =
  dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
`);

let helper =
  ts.transpileModule(
    readFileSync(
      "services/api/src/storage/existingCosmosContainer.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

helper =
  helper.replace(
    '"../production/policy.js"',
    JSON.stringify(
      policyUrl,
    ),
  );

const {
  existingUserPartitionContainer,
} = await import(
  dataUrl(helper),
);

let reads = 0;
let databaseCreates = 0;
let containerCreates = 0;

const goodContainer = {
  read: async () => {
    reads += 1;
    return {
      resource: {
        partitionKey: {
          paths: [
            "/userId",
          ],
        },
      },
    };
  },
};

const goodClient = {
  databases: {
    createIfNotExists() {
      databaseCreates += 1;
      throw new Error(
        "must never run",
      );
    },
  },
  database() {
    return {
      containers: {
        createIfNotExists() {
          containerCreates += 1;
          throw new Error(
            "must never run",
          );
        },
      },
      container() {
        return goodContainer;
      },
    };
  },
};

const getGood =
  existingUserPartitionContainer(
    goodClient,
    "marketos",
    "userState",
    "User state",
  );

assert.equal(
  await getGood(),
  goodContainer,
);
assert.equal(
  await getGood(),
  goodContainer,
);
assert.equal(
  reads,
  1,
  "Container definition should be verified once per process accessor.",
);
assert.equal(
  databaseCreates,
  0,
);
assert.equal(
  containerCreates,
  0,
);

const badPartition =
  existingUserPartitionContainer(
    {
      database() {
        return {
          container() {
            return {
              read:
                async () => ({
                  resource: {
                    partitionKey: {
                      paths: [
                        "/wrong",
                      ],
                    },
                  },
                }),
            };
          },
        };
      },
    },
    "marketos",
    "bad",
    "Bad container",
  );

await assert.rejects(
  () => badPartition(),
  (error) =>
    error.code ===
    "INVALID_COSMOS_PARTITION",
);

let missingReads = 0;
const missing =
  existingUserPartitionContainer(
    {
      database() {
        return {
          container() {
            return {
              read:
                async () => {
                  missingReads += 1;
                  throw {
                    code: 404,
                  };
                },
            };
          },
        };
      },
    },
    "marketos",
    "missing",
    "Missing container",
  );

await assert.rejects(
  () => missing(),
  (error) =>
    error.code ===
    "COSMOS_CONTAINER_MISSING",
);
await assert.rejects(
  () => missing(),
  (error) =>
    error.code ===
    "COSMOS_CONTAINER_MISSING",
);
assert.equal(
  missingReads,
  2,
  "A failed readiness check must be retryable after infrastructure is repaired.",
);

for (
  const path
  of [
    "services/api/src/storage/cosmosUserStore.ts",
    "services/api/src/entitlements/cosmosEntitlementStore.ts",
  ]
) {
  const source =
    readFileSync(
      path,
      "utf8",
    );

  assert.doesNotMatch(
    source,
    /createIfNotExists|databases\.create|containers\.create/,
    `${path} must not provision Cosmos infrastructure at request runtime.`,
  );

  assert.match(
    source,
    /existingUserPartitionContainer/,
  );
}

console.log(
  "Cosmos runtime no-provision smoke passed: existing containers are verified once, wrong/missing infrastructure fails closed, and request runtime cannot create databases or containers.",
);
