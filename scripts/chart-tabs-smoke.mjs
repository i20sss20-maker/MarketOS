import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/chartTabs.ts",
  "utf8",
);

const compiled = ts.transpileModule(
  source,
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText.replace(
  /^import[^;]+;\s*/m,
  "",
);

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(compiled).toString("base64");

const {
  createChartTab,
  updateChartTab,
  closeChartTab,
  recordRecentSymbol,
  MAX_CHART_TABS,
  MAX_RECENT_SYMBOLS,
} = await import(moduleUrl);

const aapl = {
  id: "NASDAQ:AAPL",
  ticker: "AAPL",
  name: "Apple",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const nvda = {
  id: "NASDAQ:NVDA",
  ticker: "NVDA",
  name: "NVIDIA",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const first = createChartTab(
  aapl,
  "1h",
  "candles",
);
const second = createChartTab(
  nvda,
  "1d",
  "line",
);

assert.equal(MAX_CHART_TABS, 8);
assert.equal(MAX_RECENT_SYMBOLS, 12);

const updated = updateChartTab(
  [first, second],
  first.id,
  {
    timeframe: "4h",
    chartView: "area",
  },
);

assert.equal(
  updated[0].timeframe,
  "4h",
);
assert.equal(
  updated[0].chartView,
  "area",
);
assert.equal(
  updated[1].symbol.id,
  nvda.id,
);

const closed = closeChartTab(
  updated,
  first.id,
);

assert.equal(closed.tabs.length, 1);
assert.equal(
  closed.nextActiveId,
  second.id,
);

const cannotCloseLast =
  closeChartTab(
    [second],
    second.id,
  );

assert.equal(
  cannotCloseLast.tabs.length,
  1,
);

let recent = recordRecentSymbol(
  [],
  aapl,
);
recent = recordRecentSymbol(
  recent,
  nvda,
);
recent = recordRecentSymbol(
  recent,
  aapl,
);

assert.deepEqual(
  recent.map(
    (item) => item.symbol.id,
  ),
  [
    aapl.id,
    nvda.id,
  ],
);

const app = readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

assert.match(
  app,
  /activeChartTabId/,
);
assert.match(
  app,
  /switchChartTab/,
);
assert.match(
  app,
  /ChartTabsBar/,
);

console.log(
  "Chart Tabs smoke passed: tab session updates, close fallback, recents and app integration",
);
