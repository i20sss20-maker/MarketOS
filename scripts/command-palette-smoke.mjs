import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  "apps/web/src/lib/commandPalette.ts",
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleUrl =
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;

const {
  normalizeCommandText,
  rankCommandEntries,
} = await import(moduleUrl);

const entries = [
  {
    id: "symbol-nvda",
    group: "رموز",
    label: "NVDA",
    description: "NVIDIA Corp.",
    keywords: ["nasdaq", "nvidia"],
    priority: 80,
  },
  {
    id: "alerts",
    group: "أدوات",
    label: "سجل التنبيهات",
    keywords: ["alerts", "inbox", "تنبيه"],
    priority: 60,
  },
  {
    id: "tf-4h",
    group: "فريمات",
    label: "4H",
    description: "أربع ساعات",
    keywords: ["4h", "timeframe"],
    priority: 50,
  },
  {
    id: "export",
    group: "أدوات",
    label: "تصدير ومشاركة",
    keywords: ["export", "png", "csv"],
    priority: 40,
  },
];

assert.equal(
  normalizeCommandText("  تَنْبِيهات  "),
  "تنبيهات",
);

assert.equal(
  rankCommandEntries(entries, "nvda")[0]?.id,
  "symbol-nvda",
);
assert.equal(
  rankCommandEntries(entries, "nvidia")[0]?.id,
  "symbol-nvda",
);
assert.equal(
  rankCommandEntries(entries, "تنبيه")[0]?.id,
  "alerts",
);
assert.equal(
  rankCommandEntries(entries, "4h")[0]?.id,
  "tf-4h",
);
assert.equal(
  rankCommandEntries(entries, "csv")[0]?.id,
  "export",
);

const defaultResults = rankCommandEntries(entries, "", 2);
assert.deepEqual(
  defaultResults.map((item) => item.id),
  ["symbol-nvda", "alerts"],
);

console.log("Command Palette smoke passed: Arabic/English ranking, symbols, timeframe, default priority");
