import assert from "node:assert/strict";
import { getAuthenticatedUser } from "../services/api/dist/src/auth/clientPrincipal.js";
import { userState } from "../services/api/dist/src/functions/userState.js";
import { MemoryUserStateStore } from "../services/api/dist/src/storage/memoryUserStore.js";
import { sanitizeUserCloudState } from "../services/api/dist/src/storage/stateValidation.js";

function principalHeader(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

const principalPayload = {
  identityProvider: "aad",
  userId: "user-123",
  userDetails: "user@example.com",
  userRoles: ["anonymous", "authenticated"],
};

function requestWithPrincipal(payload) {
  const encoded = principalHeader(payload);
  return {
    headers: new Headers({
      "x-ms-client-principal": encoded,
    }),
  };
}

function apiRequest(method, body, principal = principalPayload) {
  return {
    method,
    headers: new Headers({
      "x-ms-client-principal": principalHeader(principal),
      "content-type": "application/json",
    }),
    json: async () => body,
  };
}

const authenticated = getAuthenticatedUser(
  requestWithPrincipal(principalPayload),
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

const drawings = Object.fromEntries(
  Array.from({ length: 100 }, (_, symbolIndex) => [
    `SYMBOL-${symbolIndex}`,
    Array.from({ length: 180 }, (_, drawingIndex) => ({
      id: `drawing-${symbolIndex}-${drawingIndex}`,
      type: "horizontal",
      price: 100 + drawingIndex,
    })),
  ]),
);

const sanitized = sanitizeUserCloudState({
  version: 99,
  updatedAt: 123,
  watchlist: Array.from({ length: 100 }, (_, index) => ({ id: index })),
  workspaces: Array.from({ length: 30 }, (_, index) => ({ id: index })),
  alerts: Array.from({ length: 200 }, (_, index) => ({ id: index })),
  chartSettings: { showGrid: true },
  customIndicators: Array.from({ length: 40 }, (_, index) => ({ id: index })),
  drawings,
  ui: Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [`key-${index}`, String(index)]),
  ),
});

assert.equal(sanitized.version, 1);
assert.equal(sanitized.watchlist.length, 80);
assert.equal(sanitized.workspaces.length, 20);
assert.equal(sanitized.alerts.length, 150);
assert.equal(sanitized.customIndicators.length, 30);
assert.equal(Object.keys(sanitized.drawings).length, 80);
assert.equal(sanitized.drawings["SYMBOL-0"].length, 150);
assert.equal(Object.keys(sanitized.ui).length, 50);

assert.throws(
  () =>
    sanitizeUserCloudState({
      watchlist: [],
      workspaces: [],
      alerts: [],
      chartSettings: null,
      customIndicators: [],
      drawings: {},
      ui: {
        huge: "x".repeat(300 * 1024),
      },
    }),
  /too large/,
);

const store = new MemoryUserStateStore();
assert.equal(await store.get("standalone-user"), null);

const stored = await store.put("standalone-user", sanitized);
assert.equal(stored.userId, "standalone-user");
assert.equal(stored.id, "state");
assert.equal(store.mode, "memory");

const loaded = await store.get("standalone-user");
assert.equal(loaded?.payload.watchlist.length, 80);
assert.equal(Object.keys(loaded?.payload.drawings ?? {}).length, 80);

await store.delete("standalone-user");
assert.equal(await store.get("standalone-user"), null);

// Endpoint integration: the default USER_DATA_PROVIDER in CI is memory.
const firstPut = await userState(
  apiRequest("PUT", {
    state: sanitized,
    expectedUpdatedAt: null,
  }),
);
assert.equal(firstPut.status, 200);
const firstBody = firstPut.jsonBody;
assert.equal(firstBody?.ok, true);
assert.equal(firstBody?.storageMode, "memory");
assert.ok(typeof firstBody?.updatedAt === "number");
const firstVersion = firstBody.updatedAt;

const getResponse = await userState(
  apiRequest("GET"),
);
assert.equal(getResponse.status, 200);
assert.equal(getResponse.jsonBody?.state?.watchlist?.length, 80);
assert.equal(
  Object.keys(getResponse.jsonBody?.state?.drawings ?? {}).length,
  80,
);

await new Promise((resolve) => setTimeout(resolve, 3));

const secondPut = await userState(
  apiRequest("PUT", {
    state: {
      ...sanitized,
      updatedAt: Date.now(),
      ui: { refreshed: "yes" },
    },
    expectedUpdatedAt: firstVersion,
  }),
);
assert.equal(secondPut.status, 200);
const secondVersion = secondPut.jsonBody?.updatedAt;
assert.ok(typeof secondVersion === "number");
assert.ok(secondVersion >= firstVersion);

const stalePut = await userState(
  apiRequest("PUT", {
    state: sanitized,
    expectedUpdatedAt: firstVersion,
  }),
);
assert.equal(stalePut.status, 409);
assert.equal(stalePut.jsonBody?.conflict, true);
assert.equal(stalePut.jsonBody?.currentUpdatedAt, secondVersion);

const anonymousApi = await userState({
  method: "GET",
  headers: new Headers(),
  json: async () => null,
});
assert.equal(anonymousApi.status, 401);

const deleted = await userState(
  apiRequest("DELETE"),
);
assert.equal(deleted.status, 200);
assert.equal(deleted.jsonBody?.deleted, true);

const afterDelete = await userState(
  apiRequest("GET"),
);
assert.equal(afterDelete.status, 200);
assert.equal(afterDelete.jsonBody?.state, null);

console.log(
  "Cloud state smoke passed: auth, bounds, drawings, version conflicts, persistence, deletion",
);
