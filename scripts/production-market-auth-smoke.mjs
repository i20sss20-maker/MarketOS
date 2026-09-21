import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}

function dataUrl(source) {
  return (
    "data:text/javascript;base64," +
    Buffer.from(source).toString(
      "base64",
    )
  );
}

const authUrl = dataUrl(`
export function getAuthenticatedUser(request) {
  return request.user ?? null;
}
`);

const ledgerUrl = dataUrl(`
export function ownerKey(user) {
  return `${user.identityProvider}:${user.userId}`;
}
`);

const quotaStoreUrl = dataUrl(`
export function getMarketDataQuotaStore() {
  return {
    async consume() {
      throw new Error("Quota store must not run in access-only smoke checks.");
    },
  };
}
`);

const marketQuotaUrl = dataUrl(`
export function configuredMarketDataHardCap() {
  return 100;
}
export function marketDataQuotaExceeded() {
  return new Error("quota exceeded");
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
  return globalThis.__marketosStrict === true;
}
export function assertRequestOrigin(origin) {
  if (origin !== null && origin !== "https://marketos.test") {
    throw new ProductionGateError(
      "ORIGIN_REJECTED",
      "origin rejected",
      403,
    );
  }
}
`);

let compiled = transpile(
  readFileSync(
    "services/api/src/production/marketAccess.ts",
    "utf8",
  ),
)
  .replaceAll(
    '"../auth/clientPrincipal.js"',
    JSON.stringify(authUrl),
  )
  .replaceAll(
    '"./policy.js"',
    JSON.stringify(policyUrl),
  )
  .replaceAll(
    '"../forecasts/ledger.js"',
    JSON.stringify(ledgerUrl),
  )
  .replaceAll(
    '"../usage/cosmosMarketDataQuota.js"',
    JSON.stringify(quotaStoreUrl),
  )
  .replaceAll(
    '"../usage/marketDataQuota.js"',
    JSON.stringify(marketQuotaUrl),
  );

const {
  assertProductionMarketAccess,
} = await import(
  dataUrl(compiled),
);

const request = (
  user = null,
  origin = "https://marketos.test",
) => ({
  user,
  headers: {
    get(name) {
      return name.toLowerCase() ===
        "origin"
        ? origin
        : null;
    },
  },
});

globalThis.__marketosStrict =
  false;
assert.equal(
  assertProductionMarketAccess(
    request(),
  ),
  null,
);

globalThis.__marketosStrict =
  true;

assert.throws(
  () =>
    assertProductionMarketAccess(
      request(),
    ),
  (error) =>
    error.code ===
      "AUTH_REQUIRED" &&
    error.status === 401,
);

assert.throws(
  () =>
    assertProductionMarketAccess(
      request(
        {
          userId: "owner",
        },
        "https://evil.test",
      ),
    ),
  (error) =>
    error.code ===
      "ORIGIN_REJECTED" &&
    error.status === 403,
);

const user = {
  userId: "owner",
  identityProvider: "aad",
};
assert.equal(
  assertProductionMarketAccess(
    request(user),
  ),
  user,
);

const protectedFiles = [
  "marketQuote.ts",
  "marketCandles.ts",
  "marketSearch.ts",
  "marketOverview.ts",
  "marketEvents.ts",
  "companyFeed.ts",
];

for (const name of protectedFiles) {
  const source =
    readFileSync(
      `services/api/src/functions/${name}`,
      "utf8",
    );

  assert.match(
    source,
    /assertProductionMarketAccess\(request\)/,
    `${name} must enforce strict authenticated market access`,
  );

  const guard =
    source.indexOf(
      "assertProductionMarketAccess(request)",
    );
  const providerCall =
    Math.min(
      ...[
        source.indexOf(
          "marketDataProvider.",
        ),
        source.indexOf(
          "marketEventsProvider.",
        ),
        source.indexOf(
          "companyFeedProvider.",
        ),
      ].filter(
        (index) => index >= 0,
      ),
    );

  assert.ok(
    guard >= 0 &&
      providerCall >= 0 &&
      guard < providerCall,
    `${name} must authenticate before provider work`,
  );
}

const snapshot =
  readFileSync(
    "services/api/src/functions/marketSnapshot.ts",
    "utf8",
  );
assert.match(
  snapshot,
  /DEMO_DISABLED/,
);
assert.match(
  snapshot,
  /realDataRequired\(\)/,
);

console.log(
  "Production market access smoke passed: preview preserved, strict anonymous/cross-origin access rejected, provider routes guarded.",
);
