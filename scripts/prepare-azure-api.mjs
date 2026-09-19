import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const target = "artifacts/azure-api";

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync("services/api/dist", `${target}/dist`, { recursive: true });
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
  },
};

writeFileSync(
  `${target}/package.json`,
  `${JSON.stringify(packageJson, null, 2)}\n`,
);

console.log("Prepared Azure API bundle at artifacts/azure-api");
