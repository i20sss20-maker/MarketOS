import assert from "node:assert/strict";
import { getAuthenticatedUser } from "../services/api/dist/src/auth/clientPrincipal.js";
import { userState } from "../services/api/dist/src/functions/userState.js";
import { userStateStore } from "../services/api/dist/src/storage/index.js";
import { MemoryUserStateStore } from "../services/api/dist/src/storage/memoryUserStore.js";
import { sanitizeUserCloudState } from "../services/api/dist/src/storage/stateValidation.js";
import { UserStateConflictError } from "../services/api/dist/src/storage/types.js";

function principalHeader(payload) {
  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64");
}

const principal = {
  identityProvider: "aad",
  userId: "cloud-v2-smoke-user",
  userDetails: "user@example.com",
  userRoles: ["anonymous", "authenticated"],
};

function requestWithPrincipal(payload) {
  return {
    headers: new Headers({
      "x-ms-client-principal":
        principalHeader(payload),
    }),
  };
}

function apiRequest(method, body) {
  return {
    method,
    headers: new Headers({
      "x-ms-client-principal":
        principalHeader(principal),
      "content-type": "application/json",
    }),
    json: async () => body,
  };
}

const authenticated = getAuthenticatedUser(
  requestWithPrincipal(principal),
);

assert.equal(
  authenticated?.userId,
  principal.userId,
);
assert.equal(
  authenticated?.identityProvider,
  "aad",
);
assert.ok(
  authenticated?.roles.includes("authenticated"),
);

const anonymous = getAuthenticatedUser(
  requestWithPrincipal({
    identityProvider: "aad",
    userId: "anonymous-user",
    userDetails: "anon@example.com",
    userRoles: ["anonymous"],
  }),
);
assert.equal(anonymous, null);

const drawings = Object.fromEntries(
  Array.from(
    { length: 100 },
    (_, symbolIndex) => [
      `SYMBOL-${symbolIndex}`,
      Array.from(
        { length: 180 },
        (_, drawingIndex) => ({
          id:
            `drawing-${symbolIndex}-${drawingIndex}`,
          type: "horizontal",
          price: 100 + drawingIndex,
        }),
      ),
    ],
  ),
);

const sanitized = sanitizeUserCloudState({
  version: 99,
  updatedAt: 123,
  watchlist: Array.from(
    { length: 100 },
    (_, index) => ({ id: index }),
  ),
  workspaces: Array.from(
    { length: 30 },
    (_, index) => ({ id: index }),
  ),
  alerts: Array.from(
    { length: 200 },
    (_, index) => ({ id: index }),
  ),

  // Browser must never be able to forge inbox history.
  alertEvents: [{
    id: "forged-event",
    alertId: "forged-alert",
  }],

  chartSettings: {
    showGrid: true,
  },

  customIndicators: Array.from(
    { length: 40 },
    (_, index) => ({ id: index }),
  ),

  drawings,

  ui: Object.fromEntries(
    Array.from(
      { length: 70 },
      (_, index) => [
        `key-${index}`,
        String(index),
      ],
    ),
  ),
});

assert.equal(sanitized.version, 1);
assert.equal(sanitized.watchlist.length, 80);
assert.equal(sanitized.workspaces.length, 20);
assert.equal(sanitized.alerts.length, 150);
assert.deepEqual(
  sanitized.alertEvents,
  [],
);
assert.equal(
  sanitized.customIndicators.length,
  30,
);
assert.equal(
  Object.keys(sanitized.drawings).length,
  80,
);
assert.equal(
  sanitized.drawings["SYMBOL-0"].length,
  150,
);
assert.equal(
  Object.keys(sanitized.ui).length,
  50,
);

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
        huge: "x".repeat(
          300 * 1024,
        ),
      },
    }),
  /too large/,
);

// Store-level revision behavior.
const store =
  new MemoryUserStateStore();

const first = await store.put(
  "revision-user",
  sanitized,
  {
    expectedClientRevision: null,
    expectedServerRevision: null,
  },
);

assert.equal(
  first.clientRevision,
  1,
);
assert.equal(
  first.serverRevision,
  1,
);
const firstClientUpdatedAt =
  first.clientUpdatedAt;

const inboxEvent = {
  id: "event-1",
  alertId: "alert-1",
  symbol: {
    id: "XNAS:AAPL",
    ticker: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    assetClass: "stock",
    currency: "USD",
  },
  timeframe: "1h",
  triggeredAt: Date.now(),
  source: "background",
};

await new Promise(
  (resolve) =>
    setTimeout(resolve, 3),
);

const alertOnly =
  await store.updateAlerts(
    "revision-user",
    [{
      id: "alert-1",
      checked: true,
    }],
    [inboxEvent],
  );

assert.equal(
  alertOnly?.clientRevision,
  1,
);
assert.equal(
  alertOnly?.serverRevision,
  2,
);
assert.equal(
  alertOnly?.clientUpdatedAt,
  firstClientUpdatedAt,
);
assert.deepEqual(
  alertOnly?.payload.alertEvents,
  [inboxEvent],
);

const second = await store.put(
  "revision-user",
  {
    ...sanitized,
    alerts:
      alertOnly?.payload.alerts ?? [],
    alertEvents:
      alertOnly?.payload.alertEvents ??
      [],
  },
  {
    expectedClientRevision: 1,
    expectedServerRevision: 2,
  },
);

assert.equal(
  second.clientRevision,
  2,
);
assert.equal(
  second.serverRevision,
  3,
);

// Direct store writes are trusted server operations,
// so the inbox passed here is retained.
assert.deepEqual(
  second.payload.alertEvents,
  [inboxEvent],
);

await assert.rejects(
  () =>
    store.put(
      "revision-user",
      sanitized,
      {
        expectedClientRevision: 1,
        expectedServerRevision: 2,
      },
    ),
  (error) =>
    error instanceof
      UserStateConflictError &&
    error.currentClientRevision === 2 &&
    error.currentServerRevision === 3,
);

await store.delete(
  "revision-user",
);

// Pagination is preserved.
for (
  const userId
  of ["batch-a", "batch-b", "batch-c"]
) {
  await store.put(
    userId,
    {
      ...sanitized,
      updatedAt: Date.now(),
    },
  );
}

const firstBatch =
  await store.listBatch(2);
assert.equal(
  firstBatch.items.length,
  2,
);
assert.ok(
  firstBatch.continuationToken,
);

const secondBatch =
  await store.listBatch(
    2,
    firstBatch.continuationToken,
  );
assert.equal(
  secondBatch.items.length,
  1,
);

for (
  const userId
  of ["batch-a", "batch-b", "batch-c"]
) {
  await store.delete(userId);
}

// API-level behavior.
await userStateStore.delete(
  principal.userId,
);

const apiFirst = await userState(
  apiRequest("PUT", {
    state: {
      ...sanitized,
      // Browser tries to forge an inbox event.
      alertEvents: [inboxEvent],
    },
    expectedClientRevision: null,
    expectedServerRevision: null,
  }),
);

assert.equal(apiFirst.status, 200);
assert.equal(
  apiFirst.jsonBody?.clientRevision,
  1,
);
assert.equal(
  apiFirst.jsonBody?.serverRevision,
  1,
);

// userState sanitizer + server ownership prevents forgery.
assert.deepEqual(
  apiFirst.jsonBody?.state
    ?.alertEvents,
  [],
);

const serverInbox = [{
  ...inboxEvent,
  id: "server-owned-event",
}];

const workerUpdate =
  await userStateStore.updateAlerts(
    principal.userId,
    [{
      id: "worker-alert",
      lastCheckedAt: Date.now(),
    }],
    serverInbox,
  );

assert.equal(
  workerUpdate?.clientRevision,
  1,
);
assert.equal(
  workerUpdate?.serverRevision,
  2,
);
assert.deepEqual(
  workerUpdate?.payload.alertEvents,
  serverInbox,
);

const afterWorker = await userState(
  apiRequest("GET"),
);

assert.equal(
  afterWorker.status,
  200,
);
assert.equal(
  afterWorker.jsonBody
    ?.clientRevision,
  1,
);
assert.equal(
  afterWorker.jsonBody
    ?.serverRevision,
  2,
);
assert.deepEqual(
  afterWorker.jsonBody
    ?.state?.alertEvents,
  serverInbox,
);

const staleServerPut =
  await userState(
    apiRequest("PUT", {
      state: sanitized,
      expectedClientRevision: 1,
      expectedServerRevision: 1,
    }),
  );

assert.equal(
  staleServerPut.status,
  409,
);
assert.equal(
  staleServerPut.jsonBody
    ?.conflict,
  true,
);
assert.equal(
  staleServerPut.jsonBody
    ?.currentClientRevision,
  1,
);
assert.equal(
  staleServerPut.jsonBody
    ?.currentServerRevision,
  2,
);

const safeMergedPut =
  await userState(
    apiRequest("PUT", {
      state: {
        ...sanitized,
        alerts:
          afterWorker.jsonBody
            ?.state?.alerts ?? [],
      },
      expectedClientRevision: 1,
      expectedServerRevision: 2,
    }),
  );

assert.equal(
  safeMergedPut.status,
  200,
);
assert.equal(
  safeMergedPut.jsonBody
    ?.clientRevision,
  2,
);
assert.equal(
  safeMergedPut.jsonBody
    ?.serverRevision,
  3,
);

// Browser PUT must preserve server-owned inbox.
assert.deepEqual(
  safeMergedPut.jsonBody
    ?.state?.alertEvents,
  serverInbox,
);

const anonymousApi =
  await userState({
    method: "GET",
    headers: new Headers(),
    json: async () => null,
  });

assert.equal(
  anonymousApi.status,
  401,
);

const deleted =
  await userState(
    apiRequest("DELETE"),
  );

assert.equal(
  deleted.status,
  200,
);

console.log(
  "Cloud Sync V2 smoke passed: auth, drawings, inbox ownership, dual revisions, worker-safe updates, conflicts, pagination",
);
