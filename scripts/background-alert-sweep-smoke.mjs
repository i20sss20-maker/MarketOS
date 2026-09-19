import assert from "node:assert/strict";

process.env.MARKETOS_WORKER_SECRET =
  "abcdef0123456789abcdef0123456789abcdef0123456789";

const { internalAlertSweep } =
  await import("../services/api/dist/src/functions/internalAlertSweep.js");
const { userStateStore } =
  await import("../services/api/dist/src/storage/index.js");
const { entitlementStore } =
  await import("../services/api/dist/src/entitlements/index.js");

function triggerAlert(id, ticker) {
  return {
    id,
    symbol: {
      id: `NASDAQ:${ticker}`,
      ticker,
      name: ticker,
      exchange: "NASDAQ",
      micCode: "XNAS",
      assetClass: "stock",
      currency: "USD",
    },
    timeframe: "1h",
    logic: "all",
    conditions: [
      {
        id: `condition-${id}`,
        type: "numeric",
        metric: "price",
        operator: "below",
        value: 1_000_000_000,
      },
    ],
    enabled: true,
    createdAt: Date.now() - 1000,
  };
}

for (const [userId, ticker] of [
  ["worker-user-a", "AAPL"],
  ["worker-user-b", "NVDA"],
]) {
  await entitlementStore.set({
    userId,
    plan: "pro",
    status: "active",
    source: "internal",
    updatedAt: Date.now(),
  });

  await userStateStore.put(userId, {
    version: 1,
    updatedAt: Date.now(),
    watchlist: [],
    workspaces: [],
    alerts: [triggerAlert(`alert-${userId}`, ticker)],
    chartSettings: null,
    customIndicators: [],
    ui: {},
  });
}

const unauthorized = await internalAlertSweep({
  method: "POST",
  headers: new Headers({
    "x-marketos-worker-secret": "wrong-secret-that-is-long-enough-xxxxxxxx",
  }),
  json: async () => ({}),
});
assert.equal(unauthorized.status, 401);

const authorized = await internalAlertSweep({
  method: "POST",
  headers: new Headers({
    "x-marketos-worker-secret": process.env.MARKETOS_WORKER_SECRET,
  }),
  json: async () => ({}),
});
assert.equal(authorized.status, 200);

const body = authorized.jsonBody;
assert.equal(body.ok, true);
assert.equal(body.processedUsers, 2);
assert.equal(body.checkedGroups, 2);
assert.equal(body.triggeredCount, 2);
assert.equal(body.failureCount, 0);
assert.equal(body.pushAttempted, 0);
assert.equal(body.pushSent, 0);
assert.equal(body.pushStale, 0);
assert.equal(body.pushFailed, 0);

for (const userId of ["worker-user-a", "worker-user-b"]) {
  const stored = await userStateStore.get(userId);
  assert.ok(stored);
  assert.equal(stored.payload.alerts.length, 1);
  assert.ok(
    typeof stored.payload.alerts[0].triggeredAt === "number",
    "Background sweep must persist triggeredAt",
  );
  assert.equal(stored.payload.alertEvents?.length, 1);
  assert.equal(stored.payload.alertEvents?.[0].source, "background");
  assert.equal(
    stored.payload.alertEvents?.[0].alertId,
    `alert-${userId}`,
  );
  await userStateStore.delete(userId);
  await entitlementStore.delete(userId);
}

console.log(
  `Internal alert sweep smoke passed: users=${body.processedUsers}, checked=${body.checkedGroups}, triggered=${body.triggeredCount}`,
);
