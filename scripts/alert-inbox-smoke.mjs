import assert from "node:assert/strict";

const { userAlertInbox } =
  await import("../services/api/dist/src/functions/userAlertInbox.js");
const { userStateStore } =
  await import("../services/api/dist/src/storage/index.js");

const userId = "alert-inbox-smoke-user";
const principal = Buffer.from(
  JSON.stringify({
    identityProvider: "aad",
    userId,
    userDetails: "inbox@example.com",
    userRoles: ["anonymous", "authenticated"],
  }),
  "utf8",
).toString("base64");

const headers = new Headers({
  "x-ms-client-principal": principal,
});

const event = {
  id: "alert-1:1000",
  alertId: "alert-1",
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
  triggeredAt: 1000,
  snapshot: { price: 123.45 },
  conditions: [],
  source: "background",
};

await userStateStore.put(userId, {
  version: 1,
  updatedAt: Date.now(),
  watchlist: [],
  workspaces: [],
  alerts: [],
  alertEvents: [event],
  chartSettings: null,
  customIndicators: [],
  ui: {},
});

const getResponse = await userAlertInbox({
  method: "GET",
  headers,
});
assert.equal(getResponse.status, 200);
assert.equal(getResponse.jsonBody.events.length, 1);
assert.equal(getResponse.jsonBody.unreadCount, 1);

const markResponse = await userAlertInbox({
  method: "POST",
  headers,
  json: async () => ({ action: "mark-all-read" }),
});
assert.equal(markResponse.status, 200);
assert.equal(markResponse.jsonBody.unreadCount, 0);
assert.ok(markResponse.jsonBody.events[0].readAt);

const clearResponse = await userAlertInbox({
  method: "POST",
  headers,
  json: async () => ({ action: "clear-read" }),
});
assert.equal(clearResponse.status, 200);
assert.equal(clearResponse.jsonBody.events.length, 0);

const unauthorized = await userAlertInbox({
  method: "GET",
  headers: new Headers(),
});
assert.equal(unauthorized.status, 401);

await userStateStore.delete(userId);

console.log("Alert inbox smoke passed: get, unread, mark-read, clear-read, auth");
