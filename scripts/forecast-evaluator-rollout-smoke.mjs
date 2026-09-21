import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString("base64");

const policyUrl = dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function realDataRequired(env = {}) {
  return env.MARKETOS_ENVIRONMENT === "production" ||
    env.MARKETOS_ENVIRONMENT === "azure-production" ||
    env.MARKETOS_REQUIRE_REAL_DATA === "true";
}
`);

let compiled = ts.transpileModule(
  readFileSync(
    "services/api/src/production/forecastEvaluationPolicy.ts",
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

compiled = compiled.replace(
  '"./policy.js"',
  JSON.stringify(policyUrl),
);

const {
  forecastEvaluationPolicy,
  assertForecastEvaluationPolicy,
} = await import(dataUrl(compiled));

const production = {
  MARKETOS_ENVIRONMENT: "production",
};

assert.deepEqual(
  forecastEvaluationPolicy(production),
  {
    enabled: false,
    workerCredentialConfigured: false,
    configured: false,
  },
);

assert.throws(
  () => assertForecastEvaluationPolicy(production),
  (error) => error.code === "FORECAST_EVALUATION_DISABLED",
);

assert.throws(
  () => assertForecastEvaluationPolicy({
    ...production,
    FORECAST_EVALUATION_ENABLED: "true",
  }),
  (error) => error.code === "FORECAST_EVALUATION_WORKER_SECRET_MISSING",
);

const configured = assertForecastEvaluationPolicy({
  ...production,
  FORECAST_EVALUATION_ENABLED: "TRUE",
  MARKETOS_WORKER_SECRET: "x".repeat(48),
});
assert.equal(configured.configured, true);

assert.equal(
  assertForecastEvaluationPolicy({
    MARKETOS_ENVIRONMENT: "local",
  }).configured,
  false,
);

const bootstrap = readFileSync(
  "infrastructure/azure/configure-forecast-evaluation.ps1",
  "utf8",
);

for (const required of [
  "FORECAST_EVALUATION_ENABLED=true",
  "MARKETOS_FORECAST_EVALUATION_URL=$endpoint",
  "forecastEvaluationTimer",
  "az functionapp restart",
  "az functionapp function list",
  "RunOneLiveEvaluation",
  "IUnderstandEvaluationConsumesMarketData",
  "Persistent Cosmos forecast storage",
  "The worker credential was reused in memory and was never printed",
]) {
  assert.ok(
    bootstrap.includes(required),
    `Missing evaluator rollout marker: ${required}`,
  );
}

const workerSetting = bootstrap.indexOf(
  'az functionapp config appsettings set',
);
const timerVerification = bootstrap.indexOf(
  'forecastEvaluationTimer',
);
const apiEnable = bootstrap.lastIndexOf(
  'az staticwebapp appsettings set',
);

assert.ok(workerSetting >= 0);
assert.ok(timerVerification > workerSetting);
assert.ok(apiEnable > timerVerification);

assert.doesNotMatch(
  bootstrap,
  /Write-Host\s+\$workerSecret|Write-Output\s+\$workerSecret|echo\s+\$workerSecret/i,
);
assert.doesNotMatch(
  bootstrap,
  /az functionapp create|az storage account create|az staticwebapp create/,
  "Evaluator rollout must not create Azure resources.",
);

const readiness = readFileSync(
  "services/api/src/functions/productionReadiness.ts",
  "utf8",
);
assert.match(
  readiness,
  /assertForecastEvaluationPolicy\(\)/,
);
assert.match(
  readiness,
  /HOSTED_SERVER_OUTCOME_EVALUATION/,
);

const health = readFileSync(
  "services/api/src/functions/health.ts",
  "utf8",
);
assert.match(
  health,
  /forecastEvaluation/,
);
assert.match(
  health,
  /workerCredentialConfigured/,
);

const system = readFileSync(
  "apps/web/src/components/SystemPanel.tsx",
  "utf8",
);
assert.match(
  system,
  /Server Forecast Evaluation/,
);
assert.match(
  system,
  /إثبات timer \+ HTTPS \+ نتيجة محفوظة فعلية/,
);

console.log(
  "Forecast evaluator rollout smoke passed: production fails closed until the evaluator and worker credential are configured; rollout verifies the existing timer before API enablement and live provider work requires explicit consent.",
);
