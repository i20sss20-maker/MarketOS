import assert from "node:assert/strict";
import {
  PLAN_DEFINITIONS,
  cloudStateViolations,
  resolveEntitlement,
} from "../packages/entitlements-core/dist/index.js";

process.env.MARKETOS_WORKER_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef";

const {
  entitlementStore,
} = await import(
  "../services/api/dist/src/entitlements/index.js"
);
const {
  userEntitlements,
} = await import(
  "../services/api/dist/src/functions/userEntitlements.js"
);
const {
  internalEntitlementGrant,
} = await import(
  "../services/api/dist/src/functions/internalEntitlementGrant.js"
);
const {
  userState,
} = await import(
  "../services/api/dist/src/functions/userState.js"
);
const {
  userStateStore,
} = await import(
  "../services/api/dist/src/storage/index.js"
);

assert.equal(
  PLAN_DEFINITIONS.free.limits.watchlistItems,
  10,
);
assert.equal(
  PLAN_DEFINITIONS.pro.features.quadChart,
  true,
);
assert.equal(
  PLAN_DEFINITIONS.free.features.backgroundAlerts,
  false,
);
assert.equal(
  PLAN_DEFINITIONS.elite.limits.alerts,
  100,
);

const expired = resolveEntitlement({
  userId: "expired-user",
  plan: "elite",
  status: "active",
  source: "internal",
  updatedAt: 1,
  validUntil: Date.now() - 1,
});

assert.equal(expired.plan, "free");
assert.equal(expired.effective, false);

const free = resolveEntitlement({
  userId: "limit-user",
  plan: "free",
  status: "active",
  source: "default",
  updatedAt: Date.now(),
});

const violations = cloudStateViolations(
  {
    watchlistItems: 11,
    savedWorkspaces: 3,
    alerts: 4,
    customIndicators: 2,
  },
  free,
);

assert.equal(violations.length, 4);

const principal = {
  identityProvider: "aad",
  userId: "entitlement-smoke-user",
  userDetails: "plan@example.com",
  userRoles: ["anonymous", "authenticated"],
};

function principalHeader() {
  return Buffer
    .from(JSON.stringify(principal), "utf8")
    .toString("base64");
}

function userRequest(method, body) {
  return {
    method,
    headers: new Headers({
      "x-ms-client-principal": principalHeader(),
      "content-type": "application/json",
    }),
    json: async () => body,
  };
}

function internalRequest(secret, body) {
  return {
    method: "POST",
    headers: new Headers({
      "x-marketos-worker-secret": secret,
      "content-type": "application/json",
    }),
    json: async () => body,
  };
}

await entitlementStore.delete(principal.userId);
await userStateStore.delete(principal.userId);

const defaultPlan = await userEntitlements(
  userRequest("GET"),
);

assert.equal(defaultPlan.status, 200);
assert.equal(
  defaultPlan.jsonBody?.entitlement?.plan,
  "free",
);
assert.equal(
  defaultPlan.jsonBody?.entitlement
    ?.definition?.limits?.watchlistItems,
  10,
);

const overFreeState = {
  version: 1,
  updatedAt: Date.now(),
  watchlist: Array.from(
    { length: 11 },
    (_, index) => ({
      id: `SYMBOL-${index}`,
    }),
  ),
  workspaces: [],
  alerts: [],
  chartSettings: null,
  customIndicators: [],
  drawings: {},
  ui: {},
};

const rejected = await userState(
  userRequest("PUT", {
    state: overFreeState,
    expectedClientRevision: null,
    expectedServerRevision: null,
  }),
);

assert.equal(rejected.status, 403);
assert.equal(
  rejected.jsonBody?.code,
  "PLAN_LIMIT",
);
assert.equal(
  rejected.jsonBody?.plan,
  "free",
);
assert.ok(
  rejected.jsonBody?.violations
    ?.some(
      (item) =>
        item.key === "watchlistItems",
    ),
);

const unauthorized = await internalEntitlementGrant(
  internalRequest(
    "wrong-secret-that-is-long-enough-xxxxxxxx",
    {
      userId: principal.userId,
      plan: "pro",
    },
  ),
);

assert.equal(unauthorized.status, 401);

const granted = await internalEntitlementGrant(
  internalRequest(
    process.env.MARKETOS_WORKER_SECRET,
    {
      userId: principal.userId,
      plan: "pro",
      status: "active",
    },
  ),
);

assert.equal(granted.status, 200);
assert.equal(
  granted.jsonBody?.entitlement?.plan,
  "pro",
);
assert.equal(
  granted.jsonBody?.entitlement
    ?.source,
  "internal",
);

const proPlan = await userEntitlements(
  userRequest("GET"),
);

assert.equal(
  proPlan.jsonBody?.entitlement?.plan,
  "pro",
);
assert.equal(
  proPlan.jsonBody?.entitlement
    ?.definition?.limits?.watchlistItems,
  50,
);

const accepted = await userState(
  userRequest("PUT", {
    state: overFreeState,
    expectedClientRevision: null,
    expectedServerRevision: null,
  }),
);

assert.equal(accepted.status, 200);
assert.equal(
  accepted.jsonBody?.state?.watchlist?.length,
  11,
);

await userStateStore.delete(principal.userId);
await entitlementStore.delete(principal.userId);

console.log(
  "Entitlements smoke passed: default Free, server limits, protected Pro grant, upgraded cloud state",
);
