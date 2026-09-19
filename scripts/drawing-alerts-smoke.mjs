import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/drawingAlerts.ts",
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
  buildHorizontalDrawingAlertSpec,
} = await import(moduleUrl);

assert.deepEqual(
  buildHorizontalDrawingAlertSpec(
    90,
    100,
  ),
  {
    operator: "above",
    value: 100,
  },
);

assert.deepEqual(
  buildHorizontalDrawingAlertSpec(
    110,
    100,
  ),
  {
    operator: "below",
    value: 100,
  },
);

assert.equal(
  buildHorizontalDrawingAlertSpec(
    100,
    100,
  ),
  null,
);

assert.equal(
  buildHorizontalDrawingAlertSpec(
    Number.NaN,
    100,
  ),
  null,
);

console.log(
  "Drawing Alerts smoke passed: above/below direction, equality guard, invalid values",
);
