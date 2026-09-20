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

const marketApiUrl =
  dataUrl(
    `
      export async function getMarketCandles() {
        throw new Error("not used");
      }
      export async function getMarketQuote() {
        throw new Error("not used");
      }
      export async function getMarketStatus() {
        return {
          provider: "test",
          mode: "provider",
          configured: true,
          supportsSearch: true,
          supportsQuotes: true,
          supportsCandles: true,
        };
      }
    `,
  );

const journalUrl =
  dataUrl(
    `
      export function maturedForecastGroups() {
        return [];
      }
      export function maturedForecastSymbols() {
        return [];
      }
      export function resolveForecastJournalWithCandles(records) {
        return records;
      }
      export function resolveForecastJournalWithPrice(records) {
        return records;
      }
    `,
  );

let compiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/forecastMonitor.ts",
      "utf8",
    ),
  )
    .replaceAll(
      '"./marketApi"',
      JSON.stringify(
        marketApiUrl,
      ),
    )
    .replaceAll(
      '"./forecastJournal"',
      JSON.stringify(
        journalUrl,
      ),
    );

const moduleUrl =
  dataUrl(compiled);

const {
  FORECAST_MONITOR_AUTO_CHECK_INTERVAL_MS,
  FORECAST_MONITOR_AUTO_CHECK_KEY,
  hasMaturedForecastRecords,
  shouldAutoRefreshForecastMonitor,
} = await import(moduleUrl);

assert.equal(
  FORECAST_MONITOR_AUTO_CHECK_KEY,
  "marketos:forecast-performance-last-check",
);
assert.equal(
  FORECAST_MONITOR_AUTO_CHECK_INTERVAL_MS,
  10 * 60 * 1000,
);

const symbol = {
  id: "TEST:A",
  ticker: "A",
  name: "A",
  exchange: "TEST",
  assetClass: "stock",
  currency: "USD",
};

const pending = {
  id: "p1",
  symbolId: symbol.id,
  ticker: symbol.ticker,
  symbol,
  generatedAt: 100,
  dueAt: 200,
  referencePrice: 100,
  confidence: 70,
  dataMode: "provider",
  expectedOutcome: "bull",
  expectedProbability: 60,
  probabilities: {
    bull: 60,
    base: 25,
    bear: 15,
  },
  thresholdPercent: 1,
  status: "pending",
};

assert.equal(
  hasMaturedForecastRecords(
    [pending],
    199,
  ),
  false,
);

assert.equal(
  hasMaturedForecastRecords(
    [pending],
    200,
  ),
  true,
);

assert.equal(
  hasMaturedForecastRecords(
    [
      {
        ...pending,
        symbol: undefined,
      },
    ],
    500,
  ),
  false,
);

assert.equal(
  hasMaturedForecastRecords(
    [
      {
        ...pending,
        status: "resolved",
      },
    ],
    500,
  ),
  false,
);

const nowMs =
  1_000_000;

assert.equal(
  shouldAutoRefreshForecastMonitor(
    [pending],
    nowMs -
      FORECAST_MONITOR_AUTO_CHECK_INTERVAL_MS +
      1,
    nowMs,
  ),
  false,
);

assert.equal(
  shouldAutoRefreshForecastMonitor(
    [pending],
    nowMs -
      FORECAST_MONITOR_AUTO_CHECK_INTERVAL_MS,
    nowMs,
  ),
  true,
);

assert.equal(
  shouldAutoRefreshForecastMonitor(
    [
      {
        ...pending,
        dueAt: 2_000,
      },
    ],
    0,
    nowMs,
  ),
  false,
);

const home =
  readFileSync(
    "apps/web/src/components/HomeDashboard.tsx",
    "utf8",
  );
const performance =
  readFileSync(
    "apps/web/src/components/AnalystPerformanceView.tsx",
    "utf8",
  );

assert.match(
  home,
  /FORECAST_MONITOR_AUTO_CHECK_KEY/,
);
assert.match(
  home,
  /shouldAutoRefreshForecastMonitor/,
);
assert.match(
  home,
  /refreshMaturedForecasts/,
);
assert.match(
  performance,
  /FORECAST_MONITOR_AUTO_CHECK_KEY/,
);
assert.match(
  performance,
  /shouldAutoRefreshForecastMonitor/,
);

console.log(
  "Forecast Monitor policy smoke passed:",
  JSON.stringify({
    intervalMinutes:
      FORECAST_MONITOR_AUTO_CHECK_INTERVAL_MS /
      60_000,
    key:
      FORECAST_MONITOR_AUTO_CHECK_KEY,
  }),
);
