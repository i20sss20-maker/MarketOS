import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/replay.ts",
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
  replayIntervalMs,
  defaultReplayStartIndex,
  replayPresetIndex,
  buildReplaySessionStats,
} = await import(moduleUrl);

assert.equal(
  replayIntervalMs("1x"),
  650,
);
assert.ok(
  replayIntervalMs("8x") <
    replayIntervalMs("2x"),
);

assert.equal(
  defaultReplayStartIndex(300),
  240,
);
assert.equal(
  replayPresetIndex(
    300,
    "50%",
  ),
  149,
);

const candles = Array.from(
  { length: 100 },
  (_, index) => ({
    time: 1_700_000_000 +
      index * 3600,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1000 + index,
  }),
);

const stats =
  buildReplaySessionStats(
    candles,
    40,
    50,
  );

assert.ok(stats);
assert.equal(
  stats.startIndex,
  40,
);
assert.equal(
  stats.currentIndex,
  50,
);
assert.equal(
  stats.revealedBars,
  10,
);
assert.equal(
  stats.remainingBars,
  49,
);
assert.equal(
  stats.sessionHigh,
  152,
);
assert.equal(
  stats.sessionLow,
  139,
);
assert.ok(
  stats.movePercent > 0,
);
assert.ok(
  stats.progressPercent > 0 &&
    stats.progressPercent < 100,
);

console.log(
  "Replay V2 smoke passed: speeds, presets, bounds, session stats",
);
