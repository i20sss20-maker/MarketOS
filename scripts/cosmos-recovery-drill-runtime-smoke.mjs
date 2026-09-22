import assert from "node:assert/strict";
import { createRecoveryEvidence } from "./cosmos-recovery-drill-lib.mjs";

const now = Date.parse("2026-09-22T12:00:00Z");
const releaseSha = "a".repeat(40);
const source = "AccountEndpoint=https://source.documents.azure.com/;AccountKey=SOURCE-SECRET-SENTINEL;";
const restore = "AccountEndpoint=https://restored.documents.azure.com/;AccountKey=RESTORE-SECRET-SENTINEL;";
const names = ["userState", "entitlements", "forecastJournal"];
const markerId = `recovery-${releaseSha}-${now}`;
const baseEnv = {
  MARKETOS_RECOVERY_DRILL_MODE: "seed", GITHUB_SHA: releaseSha,
  MARKETOS_RECOVERY_MARKER_ID: markerId, COSMOS_CONNECTION_STRING: source,
};

function store(records = new Map()) {
  const calls = [];
  const control = { failCreate: undefined, partition: "/userId", readError: undefined, conflict: undefined };
  const createClient = (credential) => {
    calls.push(["connect", credential]);
    return { database: () => ({ container: (name) => ({
      read: async () => {
        calls.push(["container-read", name]);
        return { resource: { partitionKey: { paths: [control.partition] } } };
      },
      item: (id, partition) => ({ read: async () => {
        calls.push(["item-read", name]);
        assert.equal(id, markerId);
        assert.equal(partition, "__marketos_recovery_drill__");
        if (control.readError) throw { code: control.readError };
        const record = records.get(name);
        if (!record) throw { code: 404 };
        return { resource: structuredClone(record) };
      } }),
      items: { create: async (record) => {
        calls.push(["create", name]);
        if (control.failCreate === name) throw { code: 503 };
        if (control.conflict === name) {
          records.set(name, structuredClone(record));
          throw { code: 409 };
        }
        assert.ok(!records.has(name), "Existing data must never be overwritten.");
        records.set(name, structuredClone(record));
      } },
    }) }) };
  };
  return { records, calls, control, createClient };
}

const seeded = store();
const seedEvidence = await createRecoveryEvidence({ env: baseEnv, createClient: seeded.createClient, now });
assert.equal(seeded.records.size, 3);
assert.equal(seedEvidence.seeded, true);
assert.equal(seedEvidence.createdAt, now);
for (const record of seeded.records.values()) {
  assert.equal(record.sourceEndpointHash, seedEvidence.sourceEndpointHash);
  assert.equal(record.ttl, -1);
}

function noSensitiveOutput(evidence) {
  const output = JSON.stringify(evidence);
  for (const forbidden of [source, restore, "SOURCE-SECRET-SENTINEL", "RESTORE-SECRET-SENTINEL",
    "source.documents.azure.com", "restored.documents.azure.com", "AccountKey", "connectionString"]) {
    assert.ok(!output.includes(forbidden), "Evidence contains a credential or account endpoint.");
  }
}
noSensitiveOutput(seedEvidence);
seeded.calls.length = 0;
const retry = await createRecoveryEvidence({ env: baseEnv, createClient: seeded.createClient, now: now + 5000 });
assert.equal(retry.createdAt, now, "Retries must report the persisted timestamp.");
assert.ok(!seeded.calls.some(([operation]) => operation === "create"));

const partial = store();
partial.control.failCreate = "entitlements";
await assert.rejects(createRecoveryEvidence({ env: baseEnv, createClient: partial.createClient, now }));
assert.equal(partial.records.size, 1);
partial.control.failCreate = undefined;
const resumed = await createRecoveryEvidence({ env: baseEnv, createClient: partial.createClient, now: now + 5000 });
assert.equal(resumed.createdAt, now);
assert.deepEqual([...partial.records.values()].map((r) => r.createdAt), [now, now, now]);

const verifyEnv = {
  ...baseEnv, MARKETOS_RECOVERY_DRILL_MODE: "verify", COSMOS_CONNECTION_STRING: undefined,
  COSMOS_RESTORE_CONNECTION_STRING: restore,
  MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH: seedEvidence.sourceEndpointHash,
};
const recovered = store(structuredClone(seeded.records));
const restoreEvidence = await createRecoveryEvidence({ env: verifyEnv, createClient: recovered.createClient, now: now + 10_000 });
assert.equal(restoreEvidence.readOnlyVerification, true);
assert.equal(restoreEvidence.markerRecoveredAcrossAllContainers, true);
assert.ok(!recovered.calls.some(([operation]) => operation === "create"));
noSensitiveOutput(restoreEvidence);

for (const [key, value] of [
  ["id", "wrong-id"], ["userId", "real-user"], ["kind", "wrong-kind"],
  ["releaseSha", "b".repeat(40)], ["sourceEndpointHash", "c".repeat(64)],
  ["createdAt", now - 1], ["createdAt", now + 100_000], ["createdAt", 0],
]) {
  const invalid = store(structuredClone(seeded.records));
  invalid.records.get("entitlements")[key] = value;
  await assert.rejects(createRecoveryEvidence({ env: verifyEnv, createClient: invalid.createClient, now: now + 10_000 }));
  assert.ok(!invalid.calls.some(([operation]) => operation === "create"));
}
const missing = store(structuredClone(seeded.records));
missing.records.delete("forecastJournal");
await assert.rejects(createRecoveryEvidence({ env: verifyEnv, createClient: missing.createClient, now }));

// A substituted source hash cannot turn the production account into a restore:
// the hash is checked against the retained marker, not only operator input.
await assert.rejects(createRecoveryEvidence({ env: { ...verifyEnv,
  COSMOS_RESTORE_CONNECTION_STRING: source, MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH: "f".repeat(64),
}, createClient: seeded.createClient, now }), /sourceEndpointHash/);
for (const changed of [
  { MARKETOS_RECOVERY_DRILL_MODE: "delete" }, { GITHUB_SHA: "short" },
  { COSMOS_CONTAINER: "entitlements" }, { MARKETOS_RECOVERY_MARKER_ID: "invalid" },
  { COSMOS_RESTORE_CONNECTION_STRING: source },
  { COSMOS_RESTORE_CONNECTION_STRING: undefined, COSMOS_CONNECTION_STRING: source },
  { COSMOS_RESTORE_CONNECTION_STRING: restore.replace("https:", "http:") },
  { MARKETOS_RECOVERY_SOURCE_ENDPOINT_HASH: "invalid" },
]) {
  let opened = false;
  await assert.rejects(createRecoveryEvidence({ env: { ...verifyEnv, ...changed }, now,
    createClient: () => { opened = true; return recovered.createClient(restore); },
  }));
  assert.equal(opened, false, "Invalid input must be rejected before opening a client.");
}

const badPartition = store();
badPartition.control.partition = "/wrong";
await assert.rejects(createRecoveryEvidence({ env: baseEnv, createClient: badPartition.createClient, now }));
assert.equal(badPartition.records.size, 0);
const unreadable = store();
unreadable.control.readError = 403;
await assert.rejects(createRecoveryEvidence({ env: baseEnv, createClient: unreadable.createClient, now }));
assert.equal(unreadable.records.size, 0);
const concurrent = store();
concurrent.control.conflict = "userState";
await createRecoveryEvidence({ env: baseEnv, createClient: concurrent.createClient, now });
assert.equal(concurrent.records.size, 3);

console.log("Recovery runtime checks passed: secret-free output, partial retries, immutable identity, independent account, read-only verification and fail-closed inputs.");
