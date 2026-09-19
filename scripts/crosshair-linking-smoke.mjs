import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/crosshairLink.ts",
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
  nearestCandleByTime,
} = await import(moduleUrl);

const candles = [
  { time: 100, open: 1, high: 2, low: 0, close: 1.5 },
  { time: 200, open: 2, high: 3, low: 1, close: 2.5 },
  { time: 300, open: 3, high: 4, low: 2, close: 3.5 },
];

assert.equal(
  nearestCandleByTime(candles, 200)?.time,
  200,
);
assert.equal(
  nearestCandleByTime(candles, 240)?.time,
  200,
);
assert.equal(
  nearestCandleByTime(candles, 260)?.time,
  300,
);
assert.equal(
  nearestCandleByTime(candles, 10)?.time,
  100,
);
assert.equal(
  nearestCandleByTime(candles, 999)?.time,
  300,
);
assert.equal(
  nearestCandleByTime([], 200),
  null,
);

const chart = readFileSync(
  "apps/web/src/components/MarketChart.tsx",
  "utf8",
);
const app = readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);
const workspace = readFileSync(
  "apps/web/src/lib/workspace.ts",
  "utf8",
);

assert.match(
  chart,
  /setCrosshairPosition/,
);
assert.match(
  chart,
  /clearCrosshairPosition/,
);
assert.match(
  chart,
  /applyingSyncedCrosshairRef/,
);
assert.match(
  app,
  /paneCrosshairLinkEnabled/,
);
assert.match(
  app,
  /linkedCrosshair/,
);
assert.match(
  workspace,
  /version\?: 2 \| 3 \| 4 \| 5/,
);

console.log(
  "Crosshair Linking smoke passed: nearest-time mapping, API bridge, loop guard, Workspace V5",
);
