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

const connectionString =
  process.env.COSMOS_CONNECTION_STRING?.trim();

if (!connectionString) {
  throw new Error(
    "COSMOS_CONNECTION_STRING is required for the live storage acceptance check.",
  );
}

const databaseId =
  process.env.COSMOS_DATABASE?.trim() ||
  "marketos";

const containerIds = [
  process.env.COSMOS_CONTAINER?.trim() ||
    "userState",
  process.env.COSMOS_ENTITLEMENTS_CONTAINER?.trim() ||
    "entitlements",
  process.env.FORECAST_JOURNAL_CONTAINER?.trim() ||
    "forecastJournal",
];

assert.equal(
  new Set(containerIds).size,
  containerIds.length,
  "Production storage containers must be distinct.",
);

const owner =
  `acceptance-${randomUUID()}`;

const evidence = {
  checkedAt:
    new Date().toISOString(),
  database:
    databaseId,
  containers:
    containerIds,
  partitionKey:
    "/userId",
  independentClientRead:
    false,
  crossPartitionPointReadBlocked:
    false,
  cleanupVerified:
    false,
};

const created = [];

function code(error) {
  return error &&
    typeof error === "object" &&
    "code" in error
    ? Number(error.code)
    : undefined;
}

async function expect404(
  action,
  label,
) {
  try {
    await action();
  } catch (error) {
    assert.equal(
      code(error),
      404,
      label,
    );
    return;
  }

  assert.fail(label);
}

const writer =
  new CosmosClient(
    connectionString,
  );

const database =
  writer.database(
    databaseId,
  );

try {
  for (
    const containerId
    of containerIds
  ) {
    const container =
      database.container(
        containerId,
      );

    const {
      resource,
    } =
      await container.read();

    assert.deepEqual(
      resource?.partitionKey?.paths,
      ["/userId"],
      `${containerId} must use /userId partitioning.`,
    );

    const id =
      `storage-acceptance-${randomUUID()}`;

    const record = {
      id,
      userId: owner,
      kind:
        "marketos-storage-acceptance-v1",
      createdAt:
        Date.now(),
      nonce:
        randomUUID(),
    };

    await container.items.create(
      record,
    );

    created.push({
      containerId,
      id,
    });
  }

  // A fresh client proves the records are persisted outside the process
  // that created them. This is not a service restart, but it catches
  // accidental in-memory acceptance.
  const reader =
    new CosmosClient(
      connectionString,
    );

  for (
    const {
      containerId,
      id,
    }
    of created
  ) {
    const container =
      reader
        .database(
          databaseId,
        )
        .container(
          containerId,
        );

    const {
      resource,
    } =
      await container
        .item(
          id,
          owner,
        )
        .read();

    assert.equal(
      resource?.id,
      id,
    );
    assert.equal(
      resource?.userId,
      owner,
    );
    assert.equal(
      resource?.kind,
      "marketos-storage-acceptance-v1",
    );

    await expect404(
      () =>
        container
          .item(
            id,
            `${owner}-other`,
          )
          .read(),
      `${containerId} point read with a different partition key must not return the acceptance record.`,
    );
  }

  evidence.independentClientRead =
    true;
  evidence.crossPartitionPointReadBlocked =
    true;
} finally {
  for (
    const {
      containerId,
      id,
    }
    of created
  ) {
    const container =
      writer
        .database(
          databaseId,
        )
        .container(
          containerId,
        );

    try {
      await container
        .item(
          id,
          owner,
        )
        .delete();
    } catch (error) {
      if (code(error) !== 404) {
        throw error;
      }
    }
  }
}

const verifier =
  new CosmosClient(
    connectionString,
  );

for (
  const {
    containerId,
    id,
  }
  of created
) {
  await expect404(
    () =>
      verifier
        .database(
          databaseId,
        )
        .container(
          containerId,
        )
        .item(
          id,
          owner,
        )
        .read(),
    `${containerId} acceptance record must be deleted after the check.`,
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
  "artifacts/cosmos-live-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  "Cosmos live acceptance passed: three distinct /userId containers persisted across independent clients, cross-partition point reads were blocked, and temporary records were removed. No connection string or record payload was written to evidence.",
);
