import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );

const state = {
  strict: true,
  user: null,
  entitlementMode: "cosmos",
  consumed: 0,
  allowed: true,
};

const authUrl = dataUrl(`
export function getAuthenticatedUser(request) {
  return globalThis.__aiQuotaState.user;
}
`);
const entitlementUrl = dataUrl(`
export const entitlementStore = {
  get mode() { return globalThis.__aiQuotaState.entitlementMode; }
};
export async function getResolvedUserEntitlement(userId) {
  return { userId, definition: { limits: { aiQueriesPerDay: 10 } } };
}
`);
const ledgerUrl = dataUrl(`
export function ownerKey(user) {
  return "owner:" + user.identityProvider + ":" + user.userId;
}
`);
const policyUrl = dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function realDataRequired() {
  return globalThis.__aiQuotaState.strict;
}
export function assertRequestOrigin(origin) {
  if (origin !== null && origin !== "https://marketos.test") {
    throw new ProductionGateError("ORIGIN_REJECTED", "origin rejected", 403);
  }
}
`);
const cosmosUrl = dataUrl(`
export function getForecastQuotaStore() {
  return {
    async consume(owner, limit) {
      globalThis.__aiQuotaState.consumed += 1;
      return {
        allowed: globalThis.__aiQuotaState.allowed,
        day: "2026-09-22",
        used: globalThis.__aiQuotaState.allowed ? 1 : limit,
        limit,
        remaining: globalThis.__aiQuotaState.allowed ? limit - 1 : 0,
        resetAt: Date.UTC(2026, 8, 23),
      };
    }
  };
}
`);
const quotaUrl = dataUrl(`
export function effectiveForecastDailyLimit(entitlement) {
  return entitlement.definition.limits.aiQueriesPerDay;
}
export function quotaExceeded(decision) {
  return { code: "DAILY_FORECAST_LIMIT", message: "Daily forecast generation limit reached.", status: 429 };
}
`);

globalThis.__aiQuotaState = state;

let compiled =
  ts.transpileModule(
    readFileSync(
      "services/api/src/usage/aiQueryQuota.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

for (
  const [from, to]
  of [
    ["../auth/clientPrincipal.js", authUrl],
    ["../entitlements/index.js", entitlementUrl],
    ["../forecasts/ledger.js", ledgerUrl],
    ["../production/policy.js", policyUrl],
    ["./cosmosForecastQuota.js", cosmosUrl],
    ["./forecastQuota.js", quotaUrl],
  ]
) {
  compiled =
    compiled.replaceAll(
      JSON.stringify(from),
      JSON.stringify(to),
    );
}

const {
  consumeProductionAiQuery,
} = await import(
  dataUrl(compiled),
);

const request = (
  origin =
    "https://marketos.test",
) => ({
  headers: {
    get(name) {
      return name === "origin"
        ? origin
        : null;
    },
  },
});

state.strict = false;
state.consumed = 0;
assert.equal(
  await consumeProductionAiQuery(
    request(),
  ),
  null,
);
assert.equal(
  state.consumed,
  0,
);

state.strict = true;
await assert.rejects(
  () =>
    consumeProductionAiQuery(
      request(),
    ),
  (error) =>
    error.code ===
      "AUTH_REQUIRED" &&
    error.status === 401,
);
assert.equal(
  state.consumed,
  0,
);

state.user = {
  userId: "user-1",
  identityProvider: "aad",
};
await assert.rejects(
  () =>
    consumeProductionAiQuery(
      request(
        "https://evil.test",
      ),
    ),
  (error) =>
    error.code ===
      "ORIGIN_REJECTED" &&
    error.status === 403,
);
assert.equal(
  state.consumed,
  0,
);

state.entitlementMode =
  "memory";
await assert.rejects(
  () =>
    consumeProductionAiQuery(
      request(),
    ),
  (error) =>
    error.code ===
    "ENTITLEMENTS_NOT_PERSISTENT",
);
assert.equal(
  state.consumed,
  0,
);

state.entitlementMode =
  "cosmos";
state.allowed = true;
const usage =
  await consumeProductionAiQuery(
    request(),
  );
assert.deepEqual(
  usage,
  {
    used: 1,
    limit: 10,
    remaining: 9,
    resetAt:
      Date.UTC(
        2026,
        8,
        23,
      ),
  },
);
assert.equal(
  state.consumed,
  1,
);

state.allowed = false;
await assert.rejects(
  () =>
    consumeProductionAiQuery(
      request(),
    ),
  (error) =>
    error.code ===
      "DAILY_AI_QUERY_LIMIT" &&
    error.status === 429,
);
assert.equal(
  state.consumed,
  2,
);

const handler =
  readFileSync(
    "services/api/src/functions/chartAnalyze.ts",
    "utf8",
  );

for (
  const marker
  of [
    "MAX_CHART_ANALYSIS_BODY_BYTES",
    "256 * 1024",
    "consumeProductionAiQuery",
    "REQUEST_TOO_LARGE",
    "INVALID_JSON",
  ]
) {
  assert.ok(
    handler.includes(marker),
    `Missing chart AI protection: ${marker}`,
  );
}

const sanitizeIndex =
  handler.indexOf(
    "sanitizeChartContext",
    handler.indexOf(
      "export async function chartAnalyze",
    ),
  );
const quotaIndex =
  handler.indexOf(
    "consumeProductionAiQuery",
    handler.indexOf(
      "export async function chartAnalyze",
    ),
  );
const analyzeIndex =
  handler.indexOf(
    "analyzeChartContext",
    handler.indexOf(
      "export async function chartAnalyze",
    ),
  );

assert.ok(
  sanitizeIndex >= 0 &&
    quotaIndex >
      sanitizeIndex &&
    analyzeIndex >
      quotaIndex,
  "Valid input must be sanitized before quota consumption, and quota must be reserved before analysis.",
);

const client =
  readFileSync(
    "apps/web/src/lib/aiApi.ts",
    "utf8",
  );
assert.match(
  client,
  /recordForecastUsage\(payload\.usage\)/,
);

console.log(
  "Strict chart AI quota smoke passed: preview is unchanged, production requires trusted auth/persistent entitlements, invalid input is bounded before quota, and successful chart AI shares the atomic daily AI budget.",
);
