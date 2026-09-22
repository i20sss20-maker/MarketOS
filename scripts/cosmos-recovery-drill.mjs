import assert from "node:assert/strict";
import {
  createHash,
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

const mode =
  (
    process.env
      .MARKETOS_RECOVERY_DRILL_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

assert.ok(
  mode === "seed" ||
    mode === "verify",
  "MARKETOS_RECOVERY_DRILL_MODE must be seed or verify.",
);

const releaseSha =
  (
    process.env.GITHUB_SHA ??
    ""
  )
    .trim()
    .toLowerCase();

assert.match(
  releaseSha,
  /^[0-9a-f]{40}$/,
  "Recovery evidence must be bound to a full Git commit SHA.",
);

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
  "Recovery drill containers must be distinct.",
);

const partitionKey =
  "__marketos_recovery_drill__";

function endpointFromConnectionString(
  connectionString,
) {
  const match =
    /(?:^|;)AccountEndpoint=([^;]+)(?:;|$)/i.exec(
      connectionString,
    );

  assert.ok(
    match?.[1],
    "Cosmos connection string has no AccountEndpoint.",
  );

  const endpoint =
    new URL(match[1]);

  assert.equal(
    endpoint.protocol,
    "https:",
    "Cosmos recovery drill requires HTTPS.",
  );

  return endpoint.origin;
}

function endpointHash(
  endpoint,
) {
  return createHash(
    "sha256",
  )
    .update(endpoint)
    .digest("hex");
}

function code(error) {
  return error &&
    typeof error === "object" &&
    "code" in error
    ? Number(error.code)
    : undefined;
}

const evidence = {
  mode,
  releaseSha,
  checkedAt:
    new Date().toISOString(),
  database:
    databaseId,
  containers:
    containerIds,
  partitionKey:
    "/userId",
};

if (mode === "seed") {
  const connectionString =
    process.env.COSMOS_CONNECTION_STRING?.trim();

  if (!connectionString) {
    throw new Error(
      "COSMOS_CONNECTION_STRING is required to seed a recovery marker.",
    );
  }

  const endpoint =
    endpointFromConnectionString(
      connectionString,
    );

  const markerId =
    (
      process.env.MARKETOS_RECOVERY_MARKER_ID ??
      `recovery-${releaseSha.slice(0, 12)}-${Date.now()}`
    )
      .trim();

  assert.match(
    markerId,
    /^recovery-[A-Za-z0-9_-]{16,120}$/,
    "Recovery marker ID is invalid.",
  );

  const createdAt =
    Date.now();

  const client =
    new CosmosClient(
      connectionString,
    );

  for (
    const containerId
    of containerIds
  ) {
    const container =
      client
        .database(databaseId)
        .container(containerId);

    const {
      resource:
        containerResource,
    } =
      await container.read();

    assert.deepEqual(
      containerResource
        ?.partitionKey
        ?.paths,
      ["/userId"],
      `${containerId} must use /userId partitioning.`,
    );

    const record = {
      id: markerId,
      userId:
        partitionKey,
      kind:
        "marketos-recovery-marker-v1",
      releaseSha,
      createdAt,
    };

    try {
      await container
        .items
        .create(record);
    } catch (error) {
      if (
        code(error) !== 409
      ) {
        throw error;
      }

      const {
        resource,
      } =
        await container
          .item(
            markerId,
            partitionKey,
          )
          .read();

      assert.equal(
        resource?.kind,
        record.kind,
      );
      assert.equal(
        resource?.releaseSha,
        releaseSha,
      );
    }
  }

  Object.assign(
    evidence,
    {
      markerId,
      createdAt,
      sourceEndpointHash:
        endpointHash(endpoint),
      seeded:
        true,
      note:
        "The marker is intentionally retained so a later Azure backup restore can prove data recovery. It contains no user data or credentials.",
    },
  );

  mkdirSync(
    "artifacts",
    {
      recursive: true,
    },
  );
  writeFileSync(
    "artifacts/cosmos-recovery-marker.json",
    JSON.stringify(
      evidence,
      null,
      2,
    ),
  );

  console.log(
    `Recovery marker seeded in ${containerIds.length} containers. Marker ID: ${markerId}. No connection string or account endpoint was written to evidence.`,
  );
} else {
  const connectionString =
    process.env.COSMOS_RESTORE_CONNECTION_STRING?.trim();

  if (!connectionString) {
    throw new Error(
      "COSMOS_RESTORE_CONNECTION_STRING is required to verify a restored account.",
    );
  }

  const markerId =
    (
      process.env.MARKETOS_RECOVERY_MARKER_ID ??
      ""
    )
      .trim();

  assert.match(
    markerId,
    /^recovery-[A-Za-z0-9_-]{16,120}$/,
    "MARKETOS_RECOVERY_MARKER_ID is invalid.",
  );

  const sourceEndpointHash =
    (
      process.env.MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH ??
      ""
    )
      .trim()
      .toLowerCase();

  assert.match(
    sourceEndpointHash,
    /^[0-9a-f]{64}$/,
    "MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH must come from the seed evidence.",
  );

  const restoredEndpoint =
    endpointFromConnectionString(
      connectionString,
    );
  const restoredEndpointHash =
    endpointHash(
      restoredEndpoint,
    );

  assert.notEqual(
    restoredEndpointHash,
    sourceEndpointHash,
    "Restore verification must target a separate restored Cosmos account, not the production source account.",
  );

  const client =
    new CosmosClient(
      connectionString,
    );

  let createdAt = null;

  for (
    const containerId
    of containerIds
  ) {
    const container =
      client
        .database(databaseId)
        .container(containerId);

    const {
      resource:
        containerResource,
    } =
      await container.read();

    assert.deepEqual(
      containerResource
        ?.partitionKey
        ?.paths,
      ["/userId"],
      `${containerId} restored container must use /userId partitioning.`,
    );

    const {
      resource,
    } =
      await container
        .item(
          markerId,
          partitionKey,
        )
        .read();

    assert.equal(
      resource?.id,
      markerId,
    );
    assert.equal(
      resource?.userId,
      partitionKey,
    );
    assert.equal(
      resource?.kind,
      "marketos-recovery-marker-v1",
    );
    assert.equal(
      resource?.releaseSha,
      releaseSha,
      `${containerId} recovery marker belongs to a different release SHA.`,
    );
    assert.ok(
      Number.isFinite(
        resource?.createdAt,
      ) &&
        resource.createdAt > 0,
      `${containerId} recovery marker has no valid creation time.`,
    );

    if (
      createdAt === null
    ) {
      createdAt =
        resource.createdAt;
    } else {
      assert.equal(
        resource.createdAt,
        createdAt,
        "Recovery marker timestamps differ across restored containers.",
      );
    }
  }

  Object.assign(
    evidence,
    {
      markerId,
      createdAt,
      sourceEndpointHash,
      restoredEndpointHash,
      restoredAccountDistinct:
        true,
      markerRecoveredAcrossAllContainers:
        true,
      readOnlyVerification:
        true,
      note:
        "This verifies marker recovery in a separate restored account. It does not create or delete the restored account.",
    },
  );

  mkdirSync(
    "artifacts",
    {
      recursive: true,
    },
  );
  writeFileSync(
    "artifacts/cosmos-restore-drill-acceptance.json",
    JSON.stringify(
      evidence,
      null,
      2,
    ),
  );

  console.log(
    `Cosmos restore drill verification passed for ${containerIds.length} restored containers. No connection string or account endpoint was written to evidence.`,
  );
}
