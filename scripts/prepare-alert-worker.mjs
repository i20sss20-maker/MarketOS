import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const target = "artifacts/alert-worker";

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(
  "services/alert-worker/dist",
  `${target}/dist`,
  { recursive: true },
);
cpSync(
  "services/alert-worker/host.json",
  `${target}/host.json`,
);

const packageJson = {
  name: "marketos-alert-worker-azure",
  private: true,
  version: "0.1.0",
  type: "module",
  main: "dist/src/functions/*.js",
  engines: {
    node: "22.x",
  },
  dependencies: {
    "@azure/functions": "^4.0.0",
  },
};

writeFileSync(
  `${target}/package.json`,
  `${JSON.stringify(packageJson, null, 2)}\n`,
);

console.log(
  "Prepared Azure alert worker bundle at artifacts/alert-worker",
);
