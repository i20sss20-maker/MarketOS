import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRecoveryEvidence } from "./cosmos-recovery-drill-lib.mjs";

const require = createRequire(new URL("../services/api/package.json", import.meta.url));
const { CosmosClient } = require("@azure/cosmos");

try {
  const evidence = await createRecoveryEvidence({
    env: process.env,
    createClient: (connectionString) => new CosmosClient(connectionString),
  });
  const filename = evidence.mode === "seed"
    ? "cosmos-recovery-marker.json"
    : "cosmos-restore-drill-acceptance.json";
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(`artifacts/${filename}`, JSON.stringify(evidence, null, 2));
  console.log(`Cosmos recovery ${evidence.mode} passed for ${evidence.containers.length} containers. Marker ID: ${evidence.markerId}. No credentials or account endpoints were written to evidence.`);
} catch {
  // SDK errors and assertion operands may contain credentials or stored data.
  console.error("Cosmos recovery drill failed. Check the mode, release SHA, marker identity, source hash, credentials and container configuration. No successful evidence was written.");
  process.exitCode = 1;
}
