import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/paneLinks.ts",
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
  "data:text/javascript;base64," +
  Buffer.from(compiled).toString("base64");

const {
  normalizePaneLinkSettings,
  defaultPaneLinkSettings,
} = await import(moduleUrl);

assert.deepEqual(
  defaultPaneLinkSettings,
  {
    range: true,
    symbol: false,
    timeframe: false,
    crosshair: false,
  },
);

assert.deepEqual(
  normalizePaneLinkSettings({
    range: false,
    symbol: true,
    timeframe: true,
    crosshair: true,
  }),
  {
    range: false,
    symbol: true,
    timeframe: true,
    crosshair: true,
  },
);

assert.deepEqual(
  normalizePaneLinkSettings(
    {
      range: "bad",
      symbol: 1,
    },
    {
      range: false,
      symbol: true,
      timeframe: true,
      crosshair: true,
    },
  ),
  {
    range: false,
    symbol: true,
    timeframe: true,
    crosshair: true,
  },
);

const workspace = readFileSync(
  "apps/web/src/lib/workspace.ts",
  "utf8",
);
const app = readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

assert.match(
  workspace,
  /version\\?: 2 \\| 3 \\| 4 \\| 5/,
);
assert.match(
  workspace,
  /paneLinks\?: PaneLinkSettings/,
);
assert.match(
  app,
  /paneSymbolLinkEnabled/,
);
assert.match(
  app,
  /paneTimeframeLinkEnabled/,
);

console.log(
  "Pane Linking smoke passed: independent range/symbol/timeframe/crosshair links + Workspace V5",
);
