import assert from "node:assert/strict";
import {
  createRequire,
} from "node:module";

process.env.MARKETOS_ENVIRONMENT =
  "production";
process.env.MARKETOS_REQUIRE_REAL_DATA =
  "true";
process.env.MARKET_DATA_PROVIDER =
  "demo";

const require =
  createRequire(
    new URL(
      "../services/api/package.json",
      import.meta.url,
    ),
  );

const {
  HttpRequest,
} = require(
  "@azure/functions",
);

const {
  analystForecast,
  generateJournalForecast,
} = await import(
  "../services/api/dist/src/functions/analystForecast.js"
);

const principal =
  Buffer.from(
    JSON.stringify({
      userId:
        "boundary-owner",
      identityProvider:
        "aad",
      userRoles: [
        "authenticated",
      ],
    }),
  ).toString("base64");

const symbol = {
  id: "XNAS:TEST",
  ticker: "TEST",
  name: "Boundary fixture",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

function request(
  authenticated = true,
) {
  return new HttpRequest({
    method: "POST",
    url:
      "https://marketos.test/api/analyst/forecast",
    headers: {
      "content-type":
        "application/json",
      ...(authenticated
        ? {
            "x-ms-client-principal":
              principal,
          }
        : {}),
    },
    body: {
      string:
        JSON.stringify({
          symbol,
        }),
    },
  });
}

const direct =
  await analystForecast(
    request(true),
  );

assert.equal(
  direct.status,
  410,
);
assert.equal(
  direct.jsonBody?.code,
  "DIRECT_FORECAST_DISABLED",
);

const internalWithoutAuth =
  await generateJournalForecast(
    request(false),
  );

assert.equal(
  internalWithoutAuth.status,
  401,
);
assert.equal(
  internalWithoutAuth
    .jsonBody?.code,
  "AUTH_REQUIRED",
);

const internalWithAuth =
  await generateJournalForecast(
    request(true),
  );

assert.equal(
  internalWithAuth.status,
  503,
);
assert.equal(
  internalWithAuth
    .jsonBody?.code,
  "REAL_DATA_REQUIRED",
  "Trusted journal generation must pass the direct-route boundary and then fail closed on the deliberately configured Demo provider.",
);

console.log(
  "Direct forecast boundary smoke passed: public strict route disabled; only in-process journal generation crosses the boundary and still requires auth/provider validation.",
);
