import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/chartTemplates.ts",
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
  .replace(
    /from "\.\/chartSettings";/g,
    'from "../chartSettings.js";',
  )
  .replace(
    /from "\.\/indicators";/g,
    'from "../indicators.js";',
  );

assert.ok(
  source.includes(
    "chartTemplatePresets",
  ),
);
assert.ok(
  source.includes(
    "mergeTemplateCustomIndicators",
  ),
);

console.log(
  "Chart Templates source smoke passed: presets + merge engine present",
);
