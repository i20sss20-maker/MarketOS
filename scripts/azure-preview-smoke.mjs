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

const apiDist = "services/api/dist";
assert.ok(existsSync(apiDist), "API dist folder must exist after build");

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
assert.ok(healthFile, "Azure API build must contain the health function");

const deployWorkflow = readFileSync(".github/workflows/azure-preview.yml", "utf8");
assert.ok(deployWorkflow.includes("workflow_dispatch"), "Azure deployment must remain manual");
assert.ok(
  deployWorkflow.includes("AZURE_STATIC_WEB_APPS_API_TOKEN"),
  "Azure deployment workflow must require the deployment-token secret",
);

const bootstrap = readFileSync("infrastructure/azure/bootstrap-preview.ps1", "utf8");
assert.ok(bootstrap.includes("rg-marketos-dev"), "Bootstrap script must stay scoped to the MarketOS dev resource group");
assert.ok(bootstrap.includes("--sku Free"), "Bootstrap script must create a Free Static Web App");

console.log(
  `Azure preview smoke test passed: ${javascriptFiles.length} API JS files, Node ${config.platform.apiRuntime}`,
);
