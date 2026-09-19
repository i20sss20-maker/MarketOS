import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(
  "apps/web/src/lib/workspace.ts",
  "utf8",
);
const app = readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);
const visual = readFileSync(
  "apps/web/src/lib/paneVisualState.ts",
  "utf8",
);

assert.match(
  workspace,
  /version\?: 2 \| 3/,
);
assert.match(
  workspace,
  /visual\?: PaneVisualState/,
);
assert.match(
  app,
  /secondaryVisual\.chartView/,
);
assert.match(
  app,
  /thirdVisual\.indicators/,
);
assert.match(
  app,
  /fourthVisual\.chartSettings/,
);
assert.match(
  visual,
  /marketos:pane-\$\{pane\}-visual/,
);

console.log(
  "Pane Independence smoke passed: Workspace V3 + independent auxiliary view/indicators/settings",
);
