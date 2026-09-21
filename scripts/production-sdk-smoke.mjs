import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

// Exercise the installed Azure SDK request class and compiled route, not a fake HttpRequest.
// Cosmos and forecast generation remain test doubles: this does not contact a live service.
process.env.MARKETOS_ENVIRONMENT = "local";
process.env.MARKETOS_REQUIRE_REAL_DATA = "true";
process.env.MARKETOS_WEB_ORIGIN = "https://marketos.test";
const require = createRequire(new URL("../services/api/package.json", import.meta.url));
const { HttpRequest } = require("@azure/functions");
const { createUserForecastsHandler } = await import("../services/api/dist/src/functions/userForecasts.js");
const records = new Map();
let generated = 0;
const principal = Buffer.from(JSON.stringify({ userId: "owner-sdk-test", identityProvider: "aad", userRoles: ["authenticated"] })).toString("base64");
const symbol = { id: "TEST:SDK", ticker: "SDK", name: "SDK fixture", exchange: "TEST", assetClass: "stock", currency: "USD" };
const makeRequest = (method, body, auth = true) => new HttpRequest({ method,
  url: "https://marketos.test/api/user/forecasts",
  headers: { "origin": "https://marketos.test", "content-type": "application/json", ...(auth ? { "x-ms-client-principal": principal } : {}) },
  ...(body ? { body: { string: JSON.stringify(body) } } : {}),
});
process.env.FORECAST_DAILY_HARD_CAP = "10";
const quotaDeps = {
  quota: () => ({ consume: async () => ({ allowed:true, day:"2026-09-20", used:1, limit:10, remaining:9, resetAt:Date.UTC(2026,8,21) }) }),
  entitlement: async () => ({ definition:{ limits:{ aiQueriesPerDay:10 } } }),
  entitlementMode: () => "cosmos",
};
const handler = createUserForecastsHandler({
  ...quotaDeps,
  provider: { id: "twelvedata", getStatus: () => ({provider:"twelvedata",mode:"provider",configured:true,supportsCandles:true,supportsQuotes:true}) },
  ledger: () => ({
    find: async (owner, id) => records.get(owner+":"+id) ?? null,
    create: async record => { const key=record.userId+":"+record.id; if(!records.has(key)) records.set(key,record); return records.get(key); },
    list: async owner => ({ records: [...records.values()].filter(record=>record.userId===owner) }),
  }),
  generate: async request => {
    assert.ok(request instanceof HttpRequest);
    assert.equal(request.headers.get("x-ms-client-principal"),principal);
    const body=await request.json();
    assert.deepEqual(body,{symbol});
    generated++;
    return { status:200, jsonBody:{ok:true, forecast:{
      engine:"sdk-test",symbol,generatedAt:Math.floor(Date.now()/1000),dataProvider:"twelvedata",dataMode:"provider",referencePrice:100,
      scenarios:[{id:"bull",probability:60},{id:"base",probability:25},{id:"bear",probability:15}],
    }} };
  },
});
assert.equal((await handler(makeRequest("POST",{symbol},false))).status,401);
assert.equal(generated,0);
const body={symbol,requestId:"sdk-request-000000001"};
const first=await handler(makeRequest("POST",body));
assert.equal(first.status,200);
assert.equal(first.jsonBody.journal.evaluationStatus,"pending");
assert.equal(generated,1);
const second=await handler(makeRequest("POST",body));
assert.equal(second.status,200);
assert.equal(second.jsonBody.replayed,true);
assert.equal(generated,1);
assert.equal((await handler(makeRequest("GET"))).jsonBody.records.length,1);
assert.equal((await handler(makeRequest("POST",{symbol,forecast:{referencePrice:999}}))).status,400);
assert.equal((await handler(makeRequest("POST",{...body,symbol:{...symbol,ticker:"OTHER"}}))).status,409);
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/production-sdk-tests.json",JSON.stringify({passed:true,checks:6,azureRequest:"installed SDK",storage:"test double",marketData:"test fixture",deployed:false},null,2));
console.log("Production SDK smoke: 6 route checks passed using installed Azure HttpRequest. No live services used.");
