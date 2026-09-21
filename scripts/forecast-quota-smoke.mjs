import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = "services/api/src/";
const cosmosUrl = url("export class CosmosClient { constructor(){ throw new Error('not used'); } }");
const overrides = new Map([["@azure/cosmos", cosmosUrl]]);
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  let compiled = compile(readFileSync(path, "utf8"));
  compiled = compiled.replace(/from\s+(["'])([^"']+)\1/g, (_, q, specifier) => {
    const target = overrides.get(specifier) ?? (specifier.startsWith(".") ? load(resolve(dirname(path), specifier.replace(/\.js$/, ".ts"))) : specifier);
    return `from ${JSON.stringify(target)}`;
  });
  const result = url(compiled);
  cache.set(path, result);
  return result;
}

const quotaModule = await import(load(api + "usage/forecastQuota.ts"));
const cosmosModule = await import(load(api + "usage/cosmosForecastQuota.ts"));
const { configuredForecastHardCap, effectiveForecastDailyLimit, utcUsageWindow } = quotaModule;
const { CosmosForecastQuotaStore } = cosmosModule;

const errorCode = code => error => error?.code === code;
assert.throws(() => configuredForecastHardCap({}), errorCode("FORECAST_QUOTA_NOT_CONFIGURED"));
assert.throws(() => configuredForecastHardCap({ FORECAST_DAILY_HARD_CAP: "0" }), errorCode("FORECAST_QUOTA_NOT_CONFIGURED"));
assert.throws(() => configuredForecastHardCap({ FORECAST_DAILY_HARD_CAP: "501" }), errorCode("FORECAST_QUOTA_NOT_CONFIGURED"));
assert.equal(configuredForecastHardCap({ FORECAST_DAILY_HARD_CAP: "25" }), 25);
assert.equal(effectiveForecastDailyLimit({ definition: { limits: { aiQueriesPerDay: 10 } } }, { FORECAST_DAILY_HARD_CAP: "25" }), 10);
assert.equal(effectiveForecastDailyLimit({ definition: { limits: { aiQueriesPerDay: 100 } } }, { FORECAST_DAILY_HARD_CAP: "25" }), 25);

const beforeMidnight = Date.UTC(2026, 8, 20, 23, 59, 59, 999);
const window = utcUsageWindow(beforeMidnight);
assert.equal(window.day, "2026-09-20");
assert.equal(window.id, "forecast-usage:2026-09-20");
assert.equal(window.resetAt, Date.UTC(2026, 8, 21));

function fakeContainer(partition = "/userId") {
  const records = new Map();
  let etag = 0;
  const key = (id, userId) => `${userId}:${id}`;
  return {
    records,
    read: async () => ({ resource: { partitionKey: { paths: [partition] } } }),
    item: (id, userId) => ({
      read: async () => {
        const value = records.get(key(id, userId));
        if (!value) throw { code: 404 };
        return { resource: structuredClone(value) };
      },
      replace: async (next, options) => {
        const current = records.get(key(id, userId));
        if (!current) throw { code: 404 };
        if (options?.accessCondition?.condition !== current._etag) throw { code: 412 };
        const stored = { ...structuredClone(next), _etag: `e${++etag}` };
        records.set(key(id, userId), stored);
        return { resource: structuredClone(stored) };
      },
    }),
    items: {
      create: async record => {
        const k = key(record.id, record.userId);
        if (records.has(k)) throw { code: 409 };
        const stored = { ...structuredClone(record), _etag: `e${++etag}` };
        records.set(k, stored);
        return { resource: structuredClone(stored) };
      },
    },
  };
}

const container = fakeContainer();
const store = new CosmosForecastQuotaStore(container);
const now = Date.UTC(2026, 8, 20, 12);
const first = await store.consume("owner-a", 2, now);
const second = await store.consume("owner-a", 2, now + 1000);
const denied = await store.consume("owner-a", 2, now + 2000);
assert.deepEqual([first.allowed, second.allowed, denied.allowed], [true, true, false]);
assert.deepEqual([first.used, second.used, denied.used], [1, 2, 2]);
assert.equal(denied.remaining, 0);
assert.equal(container.records.size, 1);

const nextDay = await store.consume("owner-a", 2, Date.UTC(2026, 8, 21, 1));
assert.equal(nextDay.allowed, true);
assert.equal(nextDay.used, 1);
assert.equal(container.records.size, 2);

const concurrentContainer = fakeContainer();
const concurrentStore = new CosmosForecastQuotaStore(concurrentContainer);
const decisions = await Promise.all(Array.from({ length: 12 }, (_, index) => concurrentStore.consume("owner-race", 5, now + index)));
assert.equal(decisions.filter(item => item.allowed).length, 5);
assert.equal(decisions.filter(item => !item.allowed).length, 7);
const raceRecord = [...concurrentContainer.records.values()][0];
assert.equal(raceRecord.count, 5);

const lowerLimitContainer = fakeContainer();
const lowerStore = new CosmosForecastQuotaStore(lowerLimitContainer);
await lowerStore.consume("owner-plan", 5, now);
await lowerStore.consume("owner-plan", 5, now + 1);
const lowered = await lowerStore.consume("owner-plan", 1, now + 2);
assert.equal(lowered.allowed, false);
assert.equal(lowered.used, 2);
assert.equal(lowered.limit, 1);

const wrongPartition = new CosmosForecastQuotaStore(fakeContainer("/wrong"));
await assert.rejects(() => wrongPartition.consume("owner", 1, now), errorCode("INVALID_JOURNAL_PARTITION"));

const malformedContainer = fakeContainer();
malformedContainer.records.set("owner-b:forecast-usage:2026-09-20", {
  id: "forecast-usage:2026-09-20", userId: "owner-b", kind: "marketos-forecast-usage-v1",
  day: "2026-09-20", count: -1, limit: 10, updatedAt: now, _etag: "bad",
});
const malformedStore = new CosmosForecastQuotaStore(malformedContainer);
await assert.rejects(() => malformedStore.consume("owner-b", 10, now), errorCode("INVALID_QUOTA_RECORD"));

console.log("Forecast quota smoke passed: hard cap, UTC reset, plan cap, atomic concurrency, fail-closed records.");
