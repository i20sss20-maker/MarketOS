import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const configPath = "apps/web/dist/staticwebapp.config.json";
assert.ok(existsSync(configPath), "Vite build must copy staticwebapp.config.json into web dist");

const config = JSON.parse(readFileSync(configPath, "utf8"));
assert.equal(config?.platform?.apiRuntime, "node:20", "Azure managed API runtime must be Node 20");
assert.equal(config?.navigationFallback?.rewrite, "/index.html", "SPA navigation fallback must target index.html");
assert.ok(
  config?.globalHeaders?.["Content-Security-Policy"]?.includes("default-src 'self'"),
  "Security headers must include a CSP",
);

const securedUserRoute = config?.routes?.find(
  (route) => route?.route === "/api/user/*",
);
assert.deepEqual(
  securedUserRoute?.allowedRoles,
  ["authenticated"],
  "Cloud user API routes must require the authenticated role",
);
assert.ok(
  config?.routes?.some((route) => route?.route === "/login/microsoft"),
  "Static Web Apps config must expose the Microsoft login shortcut",
);
assert.ok(
  config?.routes?.some((route) => route?.route === "/login/github"),
  "Static Web Apps config must expose the GitHub login shortcut",
);

const apiDist = "artifacts/azure-api/dist";
assert.ok(existsSync(apiDist), "Standalone Azure API dist folder must exist after staging");

const stagedPackagePath = "artifacts/azure-api/package.json";
assert.ok(existsSync(stagedPackagePath), "Standalone Azure API package.json must exist");
const stagedPackage = JSON.parse(readFileSync(stagedPackagePath, "utf8"));
assert.equal(stagedPackage?.engines?.node, "20.x", "Standalone Azure API must target Node 20");
assert.equal(
  stagedPackage?.dependencies?.["@azure/functions"],
  "^4.0.0",
  "Standalone Azure API must include the Azure Functions runtime dependency",
);
assert.equal(
  stagedPackage?.dependencies?.["@azure/cosmos"],
  "^4.4.1",
  "Standalone Azure API must include the Cosmos SDK for persistent user state",
);
assert.ok(
  !Object.keys(stagedPackage?.dependencies ?? {}).some((name) => name.startsWith("@marketos/")),
  "Standalone Azure API must not depend on MarketOS workspace packages at runtime",
);

const javascriptFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".js")) javascriptFiles.push(path);
  }
}
walk(apiDist);

assert.ok(javascriptFiles.length > 0, "API build must contain JavaScript files");
for (const file of javascriptFiles) {
  const source = readFileSync(file, "utf8");
  assert.ok(
    !source.includes("@marketos/market-core"),
    `Azure API runtime file ${file} must not import the workspace-only market-core package`,
  );
}

const healthFile = javascriptFiles.find((file) => file.endsWith("health.js"));
assert.ok(healthFile, "Standalone Azure API bundle must contain the health function");
assert.ok(existsSync("artifacts/azure-api/host.json"), "Standalone Azure API bundle must include host.json");

const deployWorkflow = readFileSync(".github/workflows/azure-preview.yml", "utf8");
assert.ok(deployWorkflow.includes("workflow_dispatch"), "Azure deployment must remain manual");
assert.ok(
  deployWorkflow.includes("AZURE_STATIC_WEB_APPS_API_TOKEN"),
  "Azure deployment workflow must require the deployment-token secret",
);

const bootstrap = readFileSync("infrastructure/azure/bootstrap-preview.ps1", "utf8");
assert.ok(bootstrap.includes("rg-marketos-dev"), "Bootstrap script must stay scoped to the MarketOS dev resource group");
assert.ok(bootstrap.includes("--sku Free"), "Bootstrap script must create a Free Static Web App");
assert.ok(
  !bootstrap.includes("USER_DATA_PROVIDER=memory"),
  "Preview bootstrap must never downgrade persistent user storage back to memory",
);

const cosmosBootstrap = readFileSync("infrastructure/azure/bootstrap-cosmos.ps1", "utf8");
assert.ok(cosmosBootstrap.includes("--enable-free-tier true"), "Cosmos bootstrap must request Free Tier");
assert.ok(cosmosBootstrap.includes("--partition-key-path \"/userId\""), "Cosmos user state must partition by /userId");
assert.ok(!cosmosBootstrap.includes("Write-Host $connectionString"), "Cosmos connection string must never be printed");
assert.ok(
  cosmosBootstrap.includes("USER_DATA_PROVIDER=cosmos"),
  "Cosmos bootstrap must switch MarketOS user storage to Cosmos",
);

console.log(
  `Azure preview smoke test passed: ${javascriptFiles.length} staged API JS files, Node ${config.platform.apiRuntime}`,
);
