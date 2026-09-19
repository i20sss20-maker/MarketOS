import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/objectTree.ts",
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
  normalizeObjectQuery,
  objectMatchesQuery,
  buildObjectTreeSummary,
} = await import(moduleUrl);

assert.equal(
  normalizeObjectQuery("  مُؤشِّر RSI  "),
  "مؤشر rsi",
);

assert.equal(
  objectMatchesQuery(
    "rsi مؤشر",
    "RSI 14",
    "Relative Strength Index",
    "مؤشر",
  ),
  true,
);

assert.equal(
  objectMatchesQuery(
    "fibo",
    "خط اتجاه",
    "trend",
  ),
  false,
);

const summary =
  buildObjectTreeSummary(
    {
      sma20: true,
      ema20: false,
      ema50: true,
      bollinger20: false,
      rsi14: false,
      macd: false,
      atr14: false,
      stochastic14: false,
    },
    [
      {
        id: "custom-1",
        name: "One",
        formula: "EMA(CLOSE, 20)",
        pane: "price",
        enabled: true,
        createdAt: 1,
      },
      {
        id: "custom-2",
        name: "Two",
        formula: "RSI(14)",
        pane: "separate",
        enabled: false,
        createdAt: 2,
      },
    ],
    [
      {
        id: "d1",
        type: "horizontal",
        price: 100,
        hidden: true,
        locked: false,
      },
      {
        id: "d2",
        type: "text",
        point: {
          time: 1,
          price: 2,
        },
        text: "note",
        locked: true,
      },
    ],
    {
      id: "TEST:BBB",
      ticker: "BBB",
      name: "BBB",
      exchange: "TEST",
      assetClass: "stock",
      currency: "USD",
    },
  );

assert.deepEqual(
  summary,
  {
    comparisonCount: 1,
    builtInEnabled: 2,
    customEnabled: 1,
    drawingCount: 2,
    hiddenDrawings: 1,
    lockedDrawings: 1,
    totalObjects: 6,
  },
);

console.log(
  "Object Tree smoke passed: Arabic/English search + object summary",
);
