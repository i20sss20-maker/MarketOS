import assert from "node:assert/strict";
import { getAuthenticatedUser } from "../services/api/dist/src/auth/clientPrincipal.js";
import { MemoryUserStateStore } from "../services/api/dist/src/storage/memoryUserStore.js";
import { sanitizeUserCloudState } from "../services/api/dist/src/storage/stateValidation.js";

function requestWithPrincipal(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return {
    headers: new Headers({
      "x-ms-client-principal": encoded,
    }),
  };
}

const authenticated = getAuthenticatedUser(
  requestWithPrincipal({
    identityProvider: "aad",
    userId: "user-123",
    userDetails: "user@example.com",
    userRoles: ["anonymous", "authenticated"],
  }),
);

assert.equal(authenticated?.userId, "user-123");
assert.equal(authenticated?.identityProvider, "aad");
assert.ok(authenticated?.roles.includes("authenticated"));

const anonymous = getAuthenticatedUser(
  requestWithPrincipal({
    identityProvider: "aad",
    userId: "anonymous-user",
    userDetails: "anon@example.com",
    userRoles: ["anonymous"],
  }),
);
assert.equal(anonymous, null);

const invalid = getAuthenticatedUser({
  headers: new Headers({
    "x-ms-client-principal": "not-base64-json",
  }),
});
assert.equal(invalid, null);

const sanitized = sanitizeUserCloudState({
  version: 99,
  updatedAt: 123,
  watchlist: Array.from({ length: 100 }, (_, index) => ({ id: index })),
  workspaces: Array.from({ length: 30 }, (_, index) => ({ id: index })),
  alerts: Array.from({ length: 200 }, (_, index) => ({ id: index })),
  chartSettings: { showGrid: true },
  customIndicators: Array.from({ length: 40 }, (_, index) => ({ id: index })),
  ui: Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [`key-${index}`, String(index)]),
  ),
});

assert.equal(sanitized.version, 1);
assert.equal(sanitized.watchlist.length, 80);
assert.equal(sanitized.workspaces.length, 20);
assert.equal(sanitized.alerts.length, 150);
assert.equal(sanitized.customIndicators.length, 30);
assert.equal(Object.keys(sanitized.ui).length, 50);

assert.throws(
  () =>
    sanitizeUserCloudState({
      watchlist: [],
      workspaces: [],
      alerts: [],
      chartSettings: null,
      customIndicators: [],
      ui: {
        huge: "x".repeat(300 * 1024),
      },
    }),
  /too large/,
);

const store = new MemoryUserStateStore();
assert.equal(await store.get("user-123"), null);

const stored = await store.put("user-123", sanitized);
assert.equal(stored.userId, "user-123");
assert.equal(stored.id, "state");
assert.equal(store.mode, "memory");

const loaded = await store.get("user-123");
assert.equal(loaded?.payload.watchlist.length, 80);

await store.delete("user-123");
assert.equal(await store.get("user-123"), null);

for (const userId of ["batch-a", "batch-b", "batch-c"]) {
  await store.put(userId, {
    ...sanitized,
    updatedAt: Date.now(),
  });
}

const firstBatch = await store.listBatch(2);
assert.equal(firstBatch.items.length, 2);
assert.ok(firstBatch.continuationToken);

const secondBatch = await store.listBatch(
  2,
  firstBatch.continuationToken,
);
assert.equal(secondBatch.items.length, 1);
assert.equal(secondBatch.continuationToken, undefined);

for (const userId of ["batch-a", "batch-b", "batch-c"]) {
  await store.delete(userId);
}

console.log("Cloud state smoke passed: auth, bounds, persistence, deletion, pagination");
