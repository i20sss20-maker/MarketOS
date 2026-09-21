import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Runtime tests use explicit test doubles. No provider key, paid request, or Azure write.
const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
} }).outputText;
const api = "services/api/src/";
const azureUrl = url(`export const app = { http() {} };
export class HttpRequest {
 constructor(input) { this.method=input.method; this.url=input.url; this.headers=new Headers(input.headers); this.query=new URL(input.url).searchParams; this.body=input.body?.string ?? ""; }
 async text() { return this.body; }
 async json() { return JSON.parse(this.body); }
}
export default { app, HttpRequest };`);
const source = readFileSync(api + "functions/analystForecast.ts", "utf8");
const symbolParser = source.slice(source.indexOf("const assetClasses"), source.indexOf("function forecastTimeframes"));
const overrides = new Map([
  ["@azure/functions", azureUrl],
  ["@azure/cosmos", url("export class CosmosClient { constructor() { throw new Error('Actual Cosmos must not run in smoke tests'); } }")],
  [resolve(api + "functions/analystForecast.ts"), url(compile(symbolParser) + "\nexport async function analystForecast() { throw new Error('Inject a test generator'); }\nexport const generateJournalForecast = analystForecast;")],
  [resolve(api + "providers/index.ts"), url("export const marketDataProvider={id:'demo',getStatus(){return {provider:'demo',mode:'demo',configured:false}}};")],
  [resolve(api + "entitlements/index.ts"), url("export const entitlementStore={mode:'memory'}; export async function getResolvedUserEntitlement(){return {definition:{limits:{aiQueriesPerDay:10}}};}")],
  [resolve(api + "usage/cosmosForecastQuota.ts"), url("export function getForecastQuotaStore(){throw new Error('Inject a quota test double');}")],
]);
const moduleUrls = new Map();
function load(path) {
  path = resolve(path);
  if (overrides.has(path)) return overrides.get(path);
  if (moduleUrls.has(path)) return moduleUrls.get(path);
  let compiled = compile(readFileSync(path, "utf8"));
  compiled = compiled.replace(/from\s+(["'])([^"']+)\1/g, (_, quote, specifier) => {
    const target = overrides.get(specifier) ?? (specifier.startsWith(".") ? load(resolve(dirname(path), specifier.replace(/\.js$/, ".ts"))) : specifier);
    return `from ${JSON.stringify(target)}`;
  });
  const result = url(compiled);
  moduleUrls.set(path, result);
  return result;
}

const { ProductionGateError, realDataRequired, assertRealProvider, assertRequestOrigin, forecastLedgerConfig } = await import(load(api + "production/policy.ts"));
const { guardMarketDataProvider, guardEventsProvider, guardFeedProvider, validateProviderQuote, validateProviderCandles } = await import(load(api + "production/providerGuard.ts"));
const { ownerKey, createForecastRecord, publicForecastRecord } = await import(load(api + "forecasts/ledger.ts"));
const { CosmosForecastLedger } = await import(load(api + "forecasts/cosmosLedger.ts"));
const { createUserForecastsHandler } = await import(load(api + "functions/userForecasts.ts"));
const { HttpRequest } = await import(azureUrl);
const outcomes = [];
async function test(name, action) { await action(); outcomes.push(name); console.log("PASS " + name); }
const originalEnv = { ...process.env };
const symbol = { id: "XNAS:TEST", ticker: "TEST", name: "Test instrument", exchange: "NASDAQ", assetClass: "stock", currency: "USD" };
const user = { userId: "test-owner", identityProvider: "aad", userDetails: "test", roles: ["authenticated"] };
const quote = { symbol: "TEST", price: 100, timestamp: Math.floor(Date.now()/1000)-5, source: "twelvedata" };
const candles = [1000,2000].map(time => ({ time, open: 99, high: 102, low: 98, close: 100, volume: 10 }));
const provider = { id: "twelvedata", getStatus: () => ({ provider: "twelvedata", mode: "provider", configured: true, supportsQuotes: true, supportsCandles: true, supportsSearch: true }),
  getQuote: async () => quote, getCandles: async () => candles, getQuotes: async () => [{symbol,quote}], searchSymbols: async () => [symbol] };
const forecast = () => ({ engine: "marketos-forecast-test", generatedAt: Math.floor(Date.now()/1000), symbol: structuredClone(symbol),
  dataProvider: "twelvedata", dataMode: "provider", referencePrice: 100, confidence: 60, timeframes: ["1d", "1w"],
  scenarios: [ {id:"bull",probability:60}, {id:"base",probability:25}, {id:"bear",probability:15} ],
  summary: "Synthetic test fixture, not market evidence", evidence: [], catalysts: [] });
const errorCode = code => error => error instanceof ProductionGateError && error.code === code;

try {
await test("production modes cannot disable the real-data requirement", () => {
  assert.equal(realDataRequired({MARKETOS_ENVIRONMENT:"production",MARKETOS_REQUIRE_REAL_DATA:"false"}),true);
  assert.equal(realDataRequired({MARKETOS_ENVIRONMENT:"azure-production"}),true);
  assert.equal(realDataRequired({MARKETOS_REQUIRE_REAL_DATA:"true"}),true);
  assert.equal(realDataRequired({MARKETOS_ENVIRONMENT:"local"}),false);
});
await test("a Demo provider cannot pass the real-data gate", () => {
  assert.throws(() => assertRealProvider({...provider,getStatus:()=>({...provider.getStatus(),mode:"demo"})}),errorCode("REAL_DATA_REQUIRED"));
  assert.throws(() => assertRealProvider({...provider,getStatus:()=>({...provider.getStatus(),configured:false})}),errorCode("REAL_DATA_REQUIRED"));
});
await test("inconsistent provider identity is rejected", () => {
  assert.throws(() => assertRealProvider({...provider,getStatus:()=>({...provider.getStatus(),provider:"other"})}),errorCode("REAL_DATA_REQUIRED"));
});
await test("persistent journal has no memory fallback or shared user-state container", () => {
  assert.throws(()=>forecastLedgerConfig({}), errorCode("FORECAST_STORAGE_NOT_CONFIGURED"));
  const env={FORECAST_JOURNAL_ENABLED:"true",USER_DATA_PROVIDER:"cosmos",COSMOS_CONNECTION_STRING:"secret-test",FORECAST_JOURNAL_CONTAINER:"userState"};
  assert.throws(()=>forecastLedgerConfig(env),errorCode("FORECAST_STORAGE_NOT_CONFIGURED"));
  assert.equal(forecastLedgerConfig({...env,FORECAST_JOURNAL_CONTAINER:"forecastJournal"}).containerId,"forecastJournal");
});
await test("configured HTTPS origin rejects foreign and null browser origins", () => {
  const env={MARKETOS_WEB_ORIGIN:"https://marketos.test"};
  assertRequestOrigin("https://marketos.test",env);
  assert.throws(()=>assertRequestOrigin("https://evil.test",env),errorCode("ORIGIN_REJECTED"));
  assert.throws(()=>assertRequestOrigin("null",env),errorCode("ORIGIN_REJECTED"));
  assert.throws(()=>assertRequestOrigin(null,{MARKETOS_WEB_ORIGIN:"http://marketos.test"}),errorCode("WEB_ORIGIN_NOT_CONFIGURED"));
});
await test("unknown, future and fabricated quote timestamps fail closed", () => {
  validateProviderQuote(quote,"twelvedata");
  for(const bad of [{timestamp:0},{timestamp:Infinity},{timestamp:quote.timestamp*1000},{timestamp:Date.now()/1000+600},{source:"browser-demo"},{price:NaN},{price:0}])
    assert.throws(()=>validateProviderQuote({...quote,...bad},"twelvedata"),errorCode("INVALID_PROVIDER_DATA"));
});
await test("realtime and delayed policy require a recent last-quote timestamp while market is open", () => {
  const previous = {
    environment: process.env.MARKETOS_ENVIRONMENT,
    strict: process.env.MARKETOS_REQUIRE_REAL_DATA,
    timing: process.env.MARKET_DATA_TIMING,
    delay: process.env.MARKET_DATA_DELAY_MINUTES,
  };
  try {
    process.env.MARKETOS_ENVIRONMENT="production";
    process.env.MARKETOS_REQUIRE_REAL_DATA="true";
    process.env.MARKET_DATA_TIMING="realtime";
    const now=Math.floor(Date.now()/1000);
    validateProviderQuote({...quote,timestamp:now-30,timestampKind:"last-quote",isMarketOpen:true},"twelvedata",now);
    assert.throws(()=>validateProviderQuote({...quote,timestamp:now-30,timestampKind:"interval-open",isMarketOpen:true},"twelvedata",now),errorCode("INVALID_PROVIDER_DATA"));
    assert.throws(()=>validateProviderQuote({...quote,timestamp:now-16*60,timestampKind:"last-quote",isMarketOpen:true},"twelvedata",now),errorCode("INVALID_PROVIDER_DATA"));
    process.env.MARKET_DATA_TIMING="delayed";
    process.env.MARKET_DATA_DELAY_MINUTES="20";
    validateProviderQuote({...quote,timestamp:now-30*60,timestampKind:"last-quote",isMarketOpen:true},"twelvedata",now);
    assert.throws(()=>validateProviderQuote({...quote,timestamp:now-36*60,timestampKind:"last-quote",isMarketOpen:true},"twelvedata",now),errorCode("INVALID_PROVIDER_DATA"));
    validateProviderQuote({...quote,timestamp:now-24*60*60,timestampKind:"interval-open",isMarketOpen:false},"twelvedata",now);
  } finally {
    for(const [key,value] of Object.entries({
      MARKETOS_ENVIRONMENT:previous.environment,
      MARKETOS_REQUIRE_REAL_DATA:previous.strict,
      MARKET_DATA_TIMING:previous.timing,
      MARKET_DATA_DELAY_MINUTES:previous.delay,
    })) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
await test("OHLC validation rejects duplicates, disorder, impossible prices and future bars", () => {
  validateProviderCandles(candles);
  for(const bad of [[],[candles[0],candles[0]],[candles[1],candles[0]],[{...candles[0],high:90}],[{...candles[0],volume:-1}],[{...candles[0],time:Math.ceil(Date.now()/1000)+900}]])
    assert.throws(()=>validateProviderCandles(bad),errorCode("INVALID_PROVIDER_DATA"));
});
await test("preview behavior is preserved, strict mode rejects before calling Demo", async () => {
  let calls=0;
  const demo={...provider,id:"demo",getStatus:()=>({...provider.getStatus(),provider:"demo",mode:"demo"}),getQuote:async()=>{calls++;return quote;}};
  const guarded=guardMarketDataProvider(demo);
  process.env.MARKETOS_REQUIRE_REAL_DATA="false";process.env.MARKETOS_ENVIRONMENT="local";
  await guarded.getQuote(symbol);assert.equal(calls,1);
  process.env.MARKETOS_REQUIRE_REAL_DATA="true";
  await assert.rejects(()=>guarded.getQuote(symbol),errorCode("REAL_DATA_REQUIRED"));assert.equal(calls,1);
});
await test("strict market gateway validates quotes and batches", async () => {
  await guardMarketDataProvider(provider).getQuote(symbol);
  await assert.rejects(()=>guardMarketDataProvider({...provider,getQuotes:async()=>[{symbol,quote:{...quote,source:"demo"}}]}).getQuotes([symbol]),errorCode("INVALID_PROVIDER_DATA"));
});
await test("Demo news and events cannot influence a production forecast", async () => {
  await assert.rejects(()=>guardEventsProvider({id:"demo-events",getEvents:async()=>[]}).getEvents({}),errorCode("REAL_CONTEXT_REQUIRED"));
  await assert.rejects(()=>guardFeedProvider({id:"twelvedata",getFeed:async()=>[{source:"browser-demo"}]}).getFeed({}),errorCode("REAL_CONTEXT_REQUIRED"));
});
await test("owner IDs include the identity provider", () => {
  assert.notEqual(ownerKey(user),ownerKey({...user,identityProvider:"github"}));
  assert.notEqual(ownerKey(user),ownerKey({...user,userId:"other"}));
});
await test("record is a deep snapshot and never accepts Demo or invalid probabilities", () => {
  const f=forecast();const record=createForecastRecord(ownerKey(user),"id",f);f.scenarios[0].probability=1;
  assert.equal(record.forecast.scenarios[0].probability,60);
  assert.throws(()=>createForecastRecord("owner","id",{...forecast(),dataMode:"demo"}),errorCode("INVALID_FORECAST"));
  const bad=forecast();bad.scenarios[0].probability=99;
  assert.throws(()=>createForecastRecord("owner","id",bad),errorCode("INVALID_FORECAST"));
});
await test("public record omits owner data and labels outcome pending", () => {
  const result=publicForecastRecord(createForecastRecord("private-owner","id",forecast()));
  assert.equal(result.evaluationStatus,"pending");assert.equal("userId" in result,false);assert.equal(result.forecastHash.length,64);
});

const database=new Map();let lastQuery;
const fakeContainer={
  read:async()=>({resource:{partitionKey:{paths:["/userId"]}}}),
  item:(id,owner)=>({read:async()=>{const resource=database.get(owner+":"+id);if(!resource)throw {code:404};return {resource:structuredClone(resource)};}}),
  items:{create:async record=>{const key=record.userId+":"+record.id;if(database.has(key))throw {code:409};database.set(key,structuredClone(record));return {resource:record};},
    query:(query,options)=>({fetchNext:async()=>{lastQuery={query,options};return {resources:[...database.values()].filter(r=>r.userId===options.partitionKey).slice(0,options.maxItemCount),continuationToken:undefined};}})},
};
const cosmos=new CosmosForecastLedger(fakeContainer);
await test("Cosmos adapter uses atomic create; a duplicate never overwrites a forecast", async()=>{
  const a=createForecastRecord("owner-A","same-request",forecast());const b=createForecastRecord("owner-A","same-request",{...forecast(),referencePrice:999});
  await cosmos.create(a);const saved=await cosmos.create(b);assert.equal(saved.forecast.referencePrice,100);
});
await test("Cosmos reads and listing are isolated by owner and bounded", async()=>{
  await cosmos.create(createForecastRecord("owner-B","same-request",forecast()));
  assert.equal(await cosmos.find("owner-C","same-request"),null);
  const page=await cosmos.list("owner-A",1000);assert.equal(page.records.length,1);
  assert.equal(lastQuery.options.partitionKey,"owner-A");assert.equal(lastQuery.options.maxItemCount,50);
  assert.equal(lastQuery.query.parameters[0].value,"owner-A");
});
await test("wrong or unavailable container fails before journal I/O",async()=>{
  const wrong=new CosmosForecastLedger({...fakeContainer,read:async()=>({resource:{partitionKey:{paths:["/wrong"]}}})});
  await assert.rejects(()=>wrong.find("x","x"),errorCode("INVALID_JOURNAL_PARTITION"));
  const missing=new CosmosForecastLedger({...fakeContainer,read:async()=>{throw {code:404};}});
  await assert.rejects(()=>missing.find("x","x"));
});

process.env.MARKETOS_WEB_ORIGIN="https://marketos.test";
const principal=id=>Buffer.from(JSON.stringify({userId:id,identityProvider:"aad",userRoles:["authenticated"]})).toString("base64");
const request=(body,options={})=>new HttpRequest({method:options.method??"POST",url:"https://marketos.test/api/user/forecasts"+(options.query??""),
  headers:{"content-type":"application/json","origin":"https://marketos.test",...(options.auth===false?{}:{"x-ms-client-principal":principal(options.owner??user.userId)}),...options.headers},
  body:{string:typeof body==="string"?body:JSON.stringify(body??{})}});
const requestId="request-000000000001";
let quotaCalls=0;
const quotaDeps={
  quota:()=>({consume:async()=>{quotaCalls++;return {allowed:true,day:"2026-09-20",used:quotaCalls,limit:10,remaining:10-quotaCalls,resetAt:Date.UTC(2026,8,21)};}}),
  entitlement:async()=>({definition:{limits:{aiQueriesPerDay:10}}}),
  entitlementMode:()=>"cosmos",
};
process.env.FORECAST_DAILY_HARD_CAP="10";
let generated=0;
const handler=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider,generate:async req=>{generated++;const body=await req.json();return {status:200,jsonBody:{ok:true,forecast:{...forecast(),symbol:body.symbol}}};}});
await test("anonymous journal request is rejected before storage or market access",async()=>{
  const response=await handler(request({symbol},{auth:false}));assert.equal(response.status,401);assert.equal(generated,0);
});
await test("cross-origin authenticated writes are rejected",async()=>{
  const response=await handler(request({symbol},{headers:{origin:"https://evil.test"}}));assert.equal(response.status,403);assert.equal(generated,0);
});
await test("client cannot inject owner, forecast, accuracy or outcome",async()=>{
  for(const bad of [{symbol,userId:"victim"},{symbol,forecast:forecast()},{symbol,accuracy:100},{symbol,outcome:"bull"}]) {
    const response=await handler(request(bad));assert.equal(response.status,400);
  }assert.equal(generated,0);
});
await test("invalid JSON, symbol, request ID and oversize bodies are rejected",async()=>{
  for(const bad of ["{bad",{symbol:{}},{symbol,requestId:"x"}]) assert.equal((await handler(request(bad))).status,400);
  assert.equal((await handler(request(" ".repeat(17000)))).status,413);assert.equal(generated,0);
});
await test("production generation is saved on server before success is returned",async()=>{
  const response=await handler(request({symbol,requestId}));assert.equal(response.status,200);
  assert.equal(response.jsonBody.forecast.referencePrice,100);assert.equal(response.jsonBody.journal.evaluationStatus,"pending");assert.equal(generated,1);
  assert.equal(quotaCalls,1);assert.equal(response.jsonBody.usage.remaining,9);
});
await test("retry returns original saved forecast without another generation",async()=>{
  const response=await handler(request({symbol,requestId}));assert.equal(response.status,200);assert.equal(response.jsonBody.replayed,true);assert.equal(generated,1);assert.equal(quotaCalls,1);
});
await test("quota denial stops provider generation and returns bounded usage",async()=>{
  const denied=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider,quota:()=>({consume:async()=>({allowed:false,day:"2026-09-20",used:2,limit:2,remaining:0,resetAt:Date.UTC(2026,8,21)})}),generate:async()=>{throw new Error("must not run");}});
  const response=await denied(request({symbol,requestId:"request-quota-000001"}));
  assert.equal(response.status,429);assert.equal(response.jsonBody.code,"DAILY_FORECAST_LIMIT");assert.equal(response.jsonBody.usage.remaining,0);assert.equal(generated,1);
});
await test("non-persistent entitlements fail before quota or generation",async()=>{
  let touched=0;
  const guarded=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider,entitlementMode:()=>"memory",quota:()=>({consume:async()=>{touched++;throw new Error("must not run");}}),generate:async()=>{touched++;throw new Error("must not run");}});
  const response=await guarded(request({symbol,requestId:"request-entitlement-001"}));
  assert.equal(response.status,503);assert.equal(response.jsonBody.code,"ENTITLEMENTS_NOT_PERSISTENT");assert.equal(touched,0);
});
await test("quota storage failure fails closed before provider generation",async()=>{
  let touched=0;
  const guarded=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider,quota:()=>({consume:async()=>{throw new Error("cosmos secret");}}),generate:async()=>{touched++;throw new Error("must not run");}});
  const response=await guarded(request({symbol,requestId:"request-quota-store01"}));
  assert.equal(response.status,503);assert.equal(response.jsonBody.code,"FORECAST_QUOTA_UNAVAILABLE");assert.equal(touched,0);assert.doesNotMatch(JSON.stringify(response),/cosmos secret/);
});
await test("a request ID cannot be reused for a different instrument",async()=>{
  const response=await handler(request({symbol:{...symbol,ticker:"DIFFERENT"},requestId}));assert.equal(response.status,409);assert.equal(generated,1);
});
await test("one user's history cannot include another user's forecasts",async()=>{
  const response=await handler(request(null,{method:"GET",owner:"another-owner"}));assert.equal(response.status,200);assert.deepEqual(response.jsonBody.records,[]);
});
await test("authenticated owner can retrieve the saved report with a new handler instance",async()=>{
  const restarted=createUserForecastsHandler({...quotaDeps,ledger:()=>new CosmosForecastLedger(fakeContainer),provider,generate:async()=>{throw new Error("must not run");}});
  const response=await restarted(request(null,{method:"GET"}));assert.equal(response.status,200);assert.equal(response.jsonBody.records.length,1);
  assert.equal(response.jsonBody.records[0].forecast.referencePrice,100);
});
await test("journal pages reject oversized limits and cursors",async()=>{
  for(const query of ["?limit=999","?limit=-1","?limit=abc","?cursor="+"a".repeat(8200)]) assert.equal((await handler(request(null,{method:"GET",query}))).status,400);
});
await test("storage failure returns no forecast and leaks no connection string",async()=>{
  const broken=createUserForecastsHandler({...quotaDeps,ledger:()=>({...cosmos,find:async()=>null,create:async()=>{throw new Error("AccountKey=VERY-SECRET");}}),provider,generate:async()=>({status:200,jsonBody:{ok:true,forecast:forecast()}})});
  const response=await broken(request({symbol,requestId:"request-storage-0001"}));assert.equal(response.status,503);
  assert.equal(response.jsonBody.forecast,undefined);assert.doesNotMatch(JSON.stringify(response),/VERY-SECRET/);
});
await test("Demo provider or Demo generator output never becomes a saved real forecast",async()=>{
  const demo=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider:{...provider,getStatus:()=>({...provider.getStatus(),mode:"demo"})},generate:async()=>{throw new Error("must not run");}});
  assert.equal((await demo(request({symbol,requestId:"request-demo-000001"}))).status,503);
  const bad=createUserForecastsHandler({...quotaDeps,ledger:()=>cosmos,provider,generate:async()=>({status:200,jsonBody:{ok:true,forecast:{...forecast(),dataMode:"demo"}}})});
  assert.equal((await bad(request({symbol,requestId:"request-demo-000002"}))).status,502);
});
await test("PUT cannot rewrite saved reports",async()=>{
  assert.equal((await handler(request({symbol},{method:"PUT"}))).status,405);
});
await test("server journal refuses non-strict preview configuration",async()=>{
  process.env.MARKETOS_REQUIRE_REAL_DATA="false";
  assert.equal((await handler(request({symbol}))).status,503);
  process.env.MARKETOS_REQUIRE_REAL_DATA="true";
});
await test("readiness clearly distinguishes configuration from production acceptance",async()=>{
  const { productionReadiness } = await import(load(api+"functions/productionReadiness.ts"));
  const response=await productionReadiness(request(null,{method:"GET"}));
  assert.equal(response.jsonBody.productionReady,false);assert.equal(response.jsonBody.scope,"configuration-only");
  assert.ok(response.jsonBody.requiredAcceptanceChecks.includes("SERVER_OUTCOME_EVALUATION"));
});

mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/production-foundation-tests.json",JSON.stringify({suite:"production-foundation",passed:outcomes.length,tests:outcomes,network:"mocked; no live Azure or market-data verification"},null,2));
console.log(`Production foundation: ${outcomes.length} runtime scenarios passed (test doubles; not a live deployment).`);
} finally {
  for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env,originalEnv);
}
