import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const kind = "marketos-recovery-marker-v1";
const userId = "__marketos_recovery_drill__";

function endpointHash(connectionString) {
  const match = /(?:^|;)AccountEndpoint=([^;]+)(?:;|$)/i.exec(connectionString);
  assert.ok(match?.[1], "Cosmos connection string has no AccountEndpoint.");
  const endpoint = new URL(match[1].trim());
  assert.equal(endpoint.protocol, "https:", "Cosmos recovery drill requires HTTPS.");
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
    "Cosmos account endpoint must not contain credentials, query or fragment.");
  assert.equal(endpoint.pathname, "/", "Cosmos account endpoint must be an account origin.");
  return createHash("sha256").update(endpoint.origin).digest("hex");
}

function validateMarker(record, expected, now) {
  for (const key of ["id", "userId", "kind", "releaseSha", "sourceEndpointHash"]) {
    assert.equal(record?.[key], expected[key], `Recovery marker has an unexpected ${key}.`);
  }
  assert.ok(Number.isSafeInteger(record?.createdAt) && record.createdAt > 0 && record.createdAt <= now,
    "Recovery marker has no valid creation time.");
}

async function readMarker(container, markerId) {
  try {
    return (await container.item(markerId, userId).read()).resource;
  } catch (error) {
    if (Number(error?.code) === 404) return undefined;
    throw error;
  }
}

// External effects are supplied by the CLI. Verification only reads; seeding
// only creates missing non-user markers and never replaces existing data.
export async function createRecoveryEvidence({ env, createClient, now = Date.now() }) {
  const mode = (env.MARKETOS_RECOVERY_DRILL_MODE ?? "").trim().toLowerCase();
  assert.ok(mode === "seed" || mode === "verify", "Recovery mode must be seed or verify.");
  const releaseSha = (env.GITHUB_SHA ?? "").trim().toLowerCase();
  assert.match(releaseSha, /^[0-9a-f]{40}$/, "Recovery evidence needs a full release SHA.");
  const database = env.COSMOS_DATABASE?.trim() || "marketos";
  const containers = [
    env.COSMOS_CONTAINER?.trim() || "userState",
    env.COSMOS_ENTITLEMENTS_CONTAINER?.trim() || "entitlements",
    env.FORECAST_JOURNAL_CONTAINER?.trim() || "forecastJournal",
  ];
  assert.equal(new Set(containers).size, containers.length, "Recovery containers must be distinct.");
  const markerId = (env.MARKETOS_RECOVERY_MARKER_ID ??
    (mode === "seed" ? `recovery-${releaseSha.slice(0, 12)}-${now}` : "")).trim();
  assert.match(markerId, /^recovery-[A-Za-z0-9_-]{16,120}$/, "Recovery marker ID is invalid.");
  const connectionString = (mode === "seed"
    ? env.COSMOS_CONNECTION_STRING
    : env.COSMOS_RESTORE_CONNECTION_STRING)?.trim();
  assert.ok(connectionString, "The selected recovery mode needs its own Cosmos credential.");
  const accountHash = endpointHash(connectionString);
  const sourceEndpointHash = mode === "seed" ? accountHash
    : (env.MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH ?? "").trim().toLowerCase();
  assert.match(sourceEndpointHash, /^[0-9a-f]{64}$/, "Use the source hash from seed evidence.");
  if (mode === "verify") {
    assert.notEqual(accountHash, sourceEndpointHash, "Restore verification needs a separate account.");
  }

  const client = createClient(connectionString);
  const expected = { id: markerId, userId, kind, releaseSha, sourceEndpointHash };
  const resolved = [];
  let createdAt;
  // Preflight all containers and existing markers before writing. Reusing the
  // persisted timestamp lets a retry finish a partial seed unchanged.
  for (const containerId of containers) {
    const container = client.database(database).container(containerId);
    const { resource } = await container.read();
    assert.deepEqual(resource?.partitionKey?.paths, ["/userId"], "Recovery requires /userId partitioning.");
    const record = await readMarker(container, markerId);
    if (record) {
      validateMarker(record, expected, now);
      if (createdAt === undefined) createdAt = record.createdAt;
      assert.equal(record.createdAt, createdAt, "Recovery timestamps differ across containers.");
    } else {
      assert.equal(mode, "seed", "A restored container is missing its recovery marker.");
    }
    resolved.push({ container, record });
  }
  createdAt ??= now;
  if (mode === "seed") {
    for (const { container, record } of resolved) {
      if (record) continue;
      try {
        await container.items.create({ ...expected, createdAt, ttl: -1 });
      } catch (error) {
        if (Number(error?.code) !== 409) throw error;
        const concurrent = await readMarker(container, markerId);
        validateMarker(concurrent, expected, now);
        assert.equal(concurrent.createdAt, createdAt, "Concurrent recovery seed has a different timestamp.");
      }
    }
  }

  // Explicit allowlist: SDK objects, credentials and raw account endpoints
  // never enter the evidence payload.
  const evidence = {
    mode, releaseSha, checkedAt: new Date(now).toISOString(), database, containers,
    partitionKey: "/userId", markerId, createdAt, sourceEndpointHash,
  };
  return mode === "seed"
    ? { ...evidence, seeded: true,
        note: "The non-user marker is retained for a later backup restore; existing markers are never overwritten." }
    : { ...evidence, restoredEndpointHash: accountHash, restoredAccountDistinct: true,
        markerRecoveredAcrossAllContainers: true, readOnlyVerification: true,
        note: "Marker recovery verified in a separate account. This does not create, delete or prove the Azure restore operation itself." };
}
