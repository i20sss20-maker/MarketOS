import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const target = "artifacts/alert-worker";
assert.ok(
  existsSync(`${target}/dist/src/functions/alertSweepTimer.js`),
  "Alert worker bundle must contain the timer function",
);
assert.ok(
  existsSync(`${target}/dist/src/alertSweep.js`),
  "Alert worker bundle must contain the sweep client",
);
assert.ok(
  existsSync(`${target}/host.json`),
  "Alert worker bundle must contain host.json",
);
assert.ok(
  existsSync(`${target}/package.json`),
  "Alert worker bundle must contain package.json",
);

const pkg = JSON.parse(
  readFileSync(`${target}/package.json`, "utf8"),
);
assert.equal(
  pkg?.engines?.node,
  "22.x",
  "Scheduled worker must target Node 22 on Flex Consumption",
);
assert.equal(
  pkg?.dependencies?.["@azure/functions"],
  "^4.0.0",
  "Scheduled worker must include Azure Functions runtime dependency",
);

const host = JSON.parse(
  readFileSync(`${target}/host.json`, "utf8"),
);
assert.equal(host?.version, "2.0");
assert.equal(
  host?.extensionBundle?.id,
  "Microsoft.Azure.Functions.ExtensionBundle",
  "Timer worker must use the Azure Functions extension bundle",
);

const timerSource = readFileSync(
  `${target}/dist/src/functions/alertSweepTimer.js`,
  "utf8",
);
assert.ok(
  timerSource.includes("app.timer"),
  "Worker build must register a timer trigger",
);

const bootstrap = readFileSync(
  "infrastructure/azure/bootstrap-alert-worker.ps1",
  "utf8",
);
assert.ok(
  bootstrap.includes("--flexconsumption-location"),
  "Worker bootstrap must create a Flex Consumption function app",
);
assert.ok(
  bootstrap.includes("--runtime-version 22"),
  "Worker bootstrap must create a Node 22 function app",
);
assert.ok(
  bootstrap.includes("bootstrap-cosmos.ps1"),
  "Worker bootstrap must require persistent Cosmos storage first",
);
assert.ok(
  !bootstrap.includes('Write-Host $workerSecret'),
  "Worker secret must never be printed",
);

console.log(
  "Alert worker package smoke passed: Node 22, timer trigger, Flex bootstrap",
);
