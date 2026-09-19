import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const target = "artifacts/azure-api";

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
mkdirSync(`${target}/vendor/alert-core`, { recursive: true });
mkdirSync(`${target}/vendor/entitlements-core`, { recursive: true });

cpSync("services/api/dist", `${target}/dist`, { recursive: true });
cpSync("packages/alert-core/dist", `${target}/vendor/alert-core/dist`, { recursive: true });
cpSync("packages/entitlements-core/dist", `${target}/vendor/entitlements-core/dist`, { recursive: true });
cpSync("services/api/host.json", `${target}/host.json`);

const packageJson = {
  name: "marketos-api-azure",
  private: true,
  version: "0.3.0",
  type: "module",
  main: "dist/src/functions/*.js",
  engines: {
    node: "20.x",
  },
  dependencies: {
    "@azure/functions": "^4.0.0",
    "@azure/cosmos": "^4.4.1",
    "@marketos/alert-core": "file:vendor/alert-core",
    "@marketos/entitlements-core": "file:vendor/entitlements-core",
    "web-push": "^3.6.7",
  },
};

writeFileSync(
  `${target}/vendor/alert-core/package.json`,
  `${JSON.stringify({
    name: "@marketos/alert-core",
    version: "0.1.0",
    type: "module",
    main: "dist/index.js",
  }, null, 2)}\n`,
);

writeFileSync(
  `${target}/vendor/entitlements-core/package.json`,
  `${JSON.stringify({
    name: "@marketos/entitlements-core",
    version: "0.1.0",
    type: "module",
    main: "dist/index.js",
  }, null, 2)}\n`,
);

writeFileSync(
  `${target}/package.json`,
  `${JSON.stringify(packageJson, null, 2)}\n`,
);

console.log("Prepared Azure API bundle at artifacts/azure-api");
