import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/dashboard.ts",
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleUrl =
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;

const { buildDashboardModel } = await import(moduleUrl);

const symbol = (ticker) => ({
  id: `TEST:${ticker}`,
  ticker,
  name: ticker,
  exchange: "TEST",
  assetClass: "stock",
  currency: "USD",
});

const overview = [
  { symbol: symbol("AAA"), quote: { symbol: "AAA", price: 10, percentChange: 1, timestamp: 1, source: "test" } },
  { symbol: symbol("BBB"), quote: { symbol: "BBB", price: 20, percentChange: -4, timestamp: 1, source: "test" } },
  { symbol: symbol("CCC"), quote: { symbol: "CCC", price: 30, percentChange: 2.5, timestamp: 1, source: "test" } },
  { symbol: symbol("DDD"), quote: { symbol: "DDD", price: 40, percentChange: 0, timestamp: 1, source: "test" } },
];

const events = [
  { id: "later", type: "earnings", date: "2026-09-22", time: "18:00", title: "Later", source: "test" },
  { id: "soon", type: "earnings", date: "2026-09-20", time: "09:00", title: "Soon", source: "test" },
];

const alerts = [
  { id: "a1", alertId: "a1", symbol: symbol("AAA"), timeframe: "1h", triggeredAt: 100, source: "background" },
  { id: "a2", alertId: "a2", symbol: symbol("BBB"), timeframe: "1h", triggeredAt: 200, source: "background", readAt: 210 },
  { id: "a3", alertId: "a3", symbol: symbol("CCC"), timeframe: "4h", triggeredAt: 300, source: "manual-cloud" },
];

const workspaces = [
  { id: "old", name: "Old", symbol: symbol("AAA"), timeframe: "1h", chartView: "candles", indicators: {}, drawings: [], savedAt: 100 },
  { id: "new", name: "New", symbol: symbol("BBB"), timeframe: "4h", chartView: "candles", indicators: {}, drawings: [], savedAt: 300 },
];

const model = buildDashboardModel(
  overview,
  events,
  alerts,
  workspaces,
);

assert.equal(model.advancers, 2);
assert.equal(model.decliners, 1);
assert.equal(model.unchanged, 1);
assert.equal(model.averageMove, -0.125);
assert.equal(model.movers[0]?.symbol.ticker, "BBB");
assert.equal(model.movers[1]?.symbol.ticker, "CCC");
assert.equal(model.nextEvents[0]?.id, "soon");
assert.deepEqual(
  model.unreadAlerts.map((item) => item.id),
  ["a3", "a1"],
);
assert.deepEqual(
  model.recentWorkspaces.map((item) => item.id),
  ["new", "old"],
);

console.log(
  "Home Dashboard smoke passed: breadth, movers, events, alerts, workspaces",
);
