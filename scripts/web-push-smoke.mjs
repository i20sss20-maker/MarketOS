import assert from "node:assert/strict";
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
process.env.WEB_PUSH_ENABLED = "true";
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "https://marketos.test";

const { pushConfig } =
  await import("../services/api/dist/src/functions/pushConfig.js");
const { userPushSubscription } =
  await import("../services/api/dist/src/functions/userPushSubscription.js");
const { userState } =
  await import("../services/api/dist/src/functions/userState.js");
const {
  sanitizePushSubscriptions,
  upsertPushSubscription,
  sendBackgroundAlertPushes,
} = await import("../services/api/dist/src/push/webPush.js");
const { userStateStore } =
  await import("../services/api/dist/src/storage/index.js");

const userId = "web-push-smoke-user";
const principal = Buffer.from(
  JSON.stringify({
    identityProvider: "aad",
    userId,
    userDetails: "push@example.com",
    userRoles: ["anonymous", "authenticated"],
  }),
  "utf8",
).toString("base64");

const headers = new Headers({
  "x-ms-client-principal": principal,
  "user-agent": "MarketOS Smoke Browser",
});

const configResponse = await pushConfig({
  method: "GET",
  headers: new Headers(),
});
assert.equal(configResponse.status, 200);
assert.equal(configResponse.jsonBody.enabled, true);
assert.equal(configResponse.jsonBody.publicKey, vapid.publicKey);
assert.equal(
  configResponse.jsonBody.privateKey,
  undefined,
  "Public push config must never expose the VAPID private key",
);

await userStateStore.delete(userId);

const initial = await userStateStore.put(
  userId,
  {
    version: 1,
    updatedAt: Date.now(),
    watchlist: [],
    workspaces: [],
    alerts: [],
    alertEvents: [],
    pushSubscriptions: [],
    chartSettings: null,
    customIndicators: [],
    drawings: {},
    ui: {},
  },
  {
    expectedClientRevision: null,
    expectedServerRevision: null,
  },
);

assert.equal(initial.clientRevision, 1);
assert.equal(initial.serverRevision, 1);
const clientUpdatedAt = initial.clientUpdatedAt;

const subscription = {
  endpoint: "https://push.example.test/subscription/device-a",
  expirationTime: null,
  keys: {
    p256dh: "p256dh-test-key",
    auth: "auth-test-key",
  },
};

const postResponse = await userPushSubscription({
  method: "POST",
  headers,
  json: async () => ({ subscription }),
});
assert.equal(postResponse.status, 200);
assert.equal(postResponse.jsonBody.subscriptionCount, 1);
assert.equal(postResponse.jsonBody.serverRevision, 2);

const registered = await userStateStore.get(userId);
assert.ok(registered);
assert.equal(registered.clientRevision, 1);
assert.equal(registered.serverRevision, 2);
assert.equal(registered.clientUpdatedAt, clientUpdatedAt);
assert.equal(registered.payload.pushSubscriptions?.length, 1);
assert.equal(
  registered.payload.pushSubscriptions?.[0].userAgent,
  "MarketOS Smoke Browser",
);

const getResponse = await userPushSubscription({
  method: "GET",
  headers,
});
assert.equal(getResponse.status, 200);
assert.equal(getResponse.jsonBody.subscriptionCount, 1);

const safeStateResponse = await userState({
  method: "GET",
  headers,
});
assert.equal(safeStateResponse.status, 200);
assert.equal(
  "pushSubscriptions" in safeStateResponse.jsonBody.state,
  false,
  "Normal cloud-state reads must not expose server-owned push registrations",
);
assert.equal(safeStateResponse.jsonBody.clientRevision, 1);
assert.equal(safeStateResponse.jsonBody.serverRevision, 2);

const duplicate = upsertPushSubscription(
  registered.payload.pushSubscriptions,
  subscription,
  "Updated Browser",
);
assert.equal(duplicate.length, 1);
assert.equal(duplicate[0].userAgent, "Updated Browser");
assert.equal(sanitizePushSubscriptions(duplicate).length, 1);

const noTriggerDelivery = await sendBackgroundAlertPushes(
  {
    ...registered.payload,
    pushSubscriptions: duplicate,
  },
  [],
);
assert.equal(noTriggerDelivery.attempted, 0);
assert.equal(noTriggerDelivery.sent, 0);
assert.deepEqual(noTriggerDelivery.staleEndpoints, []);

const deleteResponse = await userPushSubscription({
  method: "DELETE",
  headers,
  json: async () => ({ endpoint: subscription.endpoint }),
});
assert.equal(deleteResponse.status, 200);
assert.equal(deleteResponse.jsonBody.subscriptionCount, 0);
assert.equal(deleteResponse.jsonBody.serverRevision, 3);

const afterDelete = await userStateStore.get(userId);
assert.equal(afterDelete?.clientRevision, 1);
assert.equal(afterDelete?.serverRevision, 3);
assert.equal(afterDelete?.clientUpdatedAt, clientUpdatedAt);
assert.equal(afterDelete?.payload.pushSubscriptions?.length, 0);

const unauthorized = await userPushSubscription({
  method: "GET",
  headers: new Headers(),
});
assert.equal(unauthorized.status, 401);

await userStateStore.delete(userId);

console.log(
  "Web Push smoke passed: VAPID config, auth, revision-safe register/unregister, hidden server state",
);
