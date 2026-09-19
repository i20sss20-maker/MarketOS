import assert from "node:assert/strict";
import { userAlertCheck } from "../services/api/dist/src/functions/userAlertCheck.js";
import { userStateStore } from "../services/api/dist/src/storage/index.js";

const userId = "server-alert-smoke-user";
const now = Date.now();

const alert = {
  id: "smoke-alert-1",
  symbol: {
    id: "NASDAQ:AAPL",
    ticker: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  },
  timeframe: "1h",
  logic: "all",
  conditions: [
    {
      id: "condition-price-below",
      type: "numeric",
      metric: "price",
      operator: "below",
      value: 1_000_000_000,
    },
  ],
  enabled: true,
  createdAt: now - 1000,
};

await userStateStore.put(userId, {
  version: 1,
  updatedAt: now,
  watchlist: [alert.symbol],
  workspaces: [],
  alerts: [alert],
  chartSettings: null,
  customIndicators: [],
  ui: {},
});

const principal = Buffer.from(
  JSON.stringify({
    identityProvider: "aad",
    userId,
    userDetails: "smoke@example.com",
    userRoles: ["anonymous", "authenticated"],
  }),
  "utf8",
).toString("base64");

const request = {
  method: "POST",
  headers: new Headers({
    "x-ms-client-principal": principal,
  }),
};

const response = await userAlertCheck(request);
assert.equal(response.status, 200);

const body = response.jsonBody;
assert.equal(body.ok, true);
assert.equal(body.checkedGroups, 1);
assert.equal(body.triggered.length, 1);
assert.equal(body.triggered[0].alertId, alert.id);
assert.equal(body.failures.length, 0);
assert.equal(body.storageMode, "memory");

const stored = await userStateStore.get(userId);
assert.ok(stored, "Cloud state should remain stored after server check");
assert.equal(stored.payload.alerts.length, 1);

const storedAlert = stored.payload.alerts[0];
assert.ok(
  typeof storedAlert.triggeredAt === "number",
  "Server check must persist triggeredAt",
);
assert.ok(
  typeof storedAlert.lastCheckedAt === "number",
  "Server check must persist lastCheckedAt",
);

const anonymousResponse = await userAlertCheck({
  method: "POST",
  headers: new Headers(),
});
assert.equal(anonymousResponse.status, 401);

await userStateStore.delete(userId);

console.log(
  `Server alerts smoke passed: checked=${body.checkedGroups}, triggered=${body.triggered.length}, storage=${body.storageMode}`,
);
