import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/exportTools.ts",
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
).outputText;

const moduleUrl =
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;

const {
  buildMarketShareUrl,
  candlesToCsv,
  exportFilename,
  parseMarketShareState,
} = await import(moduleUrl);

const symbol = {
  id: "XSAU:2222",
  ticker: "2222",
  name: "Saudi Aramco",
  exchange: "Saudi Exchange",
  micCode: "XSAU",
  country: "Saudi Arabia",
  assetClass: "stock",
  currency: "SAR",
};

const url = buildMarketShareUrl(
  "https://marketos.example/app?inbox=alerts#old",
  {
    symbol,
    timeframe: "4h",
    chartView: "candles",
  },
);

const parsedUrl = new URL(url);
assert.equal(parsedUrl.origin, "https://marketos.example");
assert.equal(parsedUrl.pathname, "/app");
assert.equal(parsedUrl.hash, "");
assert.equal(parsedUrl.searchParams.get("marketos-share"), "1");
assert.equal(parsedUrl.searchParams.get("tf"), "4h");
assert.equal(parsedUrl.searchParams.get("view"), "candles");
assert.equal(parsedUrl.searchParams.has("inbox"), false);

const shared = parseMarketShareState(parsedUrl.search);
assert.deepEqual(shared, {
  symbol,
  timeframe: "4h",
  chartView: "candles",
});

assert.equal(
  parseMarketShareState("?marketos-share=1&tf=evil&view=candles&symbol=%7B%7D"),
  null,
);
assert.equal(
  parseMarketShareState("?marketos-share=1&tf=1h&view=script&symbol=%7B%7D"),
  null,
);
assert.equal(
  parseMarketShareState("?marketos-share=1&tf=1h&view=line&symbol=not-json"),
  null,
);

const candles = [
  {
    time: 1_700_000_000,
    open: 100,
    high: 103,
    low: 99,
    close: 102,
    volume: 1000,
  },
  {
    time: 1_700_003_600,
    open: 102,
    high: 104,
    low: 101,
    close: 103,
  },
];

const csv = candlesToCsv(candles);
const rows = csv.split("\n");
assert.equal(rows.length, 3);
assert.equal(rows[0], "time,open,high,low,close,volume");
assert.ok(rows[1].includes(",100,103,99,102,1000"));
assert.ok(rows[2].endsWith(",102,104,101,103,"));

assert.match(
  exportFilename("BTC/USD", "1h", "png"),
  /^MarketOS-BTC-USD-1h-\d{4}-\d{2}-\d{2}\.png$/,
);
assert.match(
  exportFilename("2222", "4h", "csv"),
  /^MarketOS-2222-4h-\d{4}-\d{2}-\d{2}\.csv$/,
);

console.log(
  "Export/share smoke passed: safe deep link, invalid-state rejection, CSV rows, filenames",
);
