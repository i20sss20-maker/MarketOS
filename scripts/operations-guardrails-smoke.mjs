import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );

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
    env.MARKETOS_REQUIRE_REAL_DATA === "true";
}
`);

let compiled =
  ts.transpileModule(
    readFileSync(
      "services/api/src/production/operationsPolicy.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

compiled =
  compiled.replace(
    '"./policy.js"',
    JSON.stringify(policyUrl),
  );

const {
  operationsPolicy,
  assertOperationsPolicy,
} = await import(
  dataUrl(compiled),
);

const production = {
  MARKETOS_ENVIRONMENT:
    "production",
};

assert.deepEqual(
  operationsPolicy(production),
  {
    metricAlertsConfigured:
      false,
    costBudgetConfigured:
      false,
    configured: false,
  },
);

assert.throws(
  () =>
    assertOperationsPolicy(
      production,
    ),
  (error) =>
    error.code ===
    "METRIC_ALERTS_NOT_CONFIGURED",
);

assert.throws(
  () =>
    assertOperationsPolicy({
      ...production,
      MARKETOS_METRIC_ALERTS_CONFIGURED:
        "true",
    }),
  (error) =>
    error.code ===
    "COST_BUDGET_NOT_CONFIGURED",
);

assert.deepEqual(
  assertOperationsPolicy({
    ...production,
    MARKETOS_METRIC_ALERTS_CONFIGURED:
      "TRUE",
    MARKETOS_COST_BUDGET_CONFIGURED:
      "true",
  }),
  {
    metricAlertsConfigured:
      true,
    costBudgetConfigured:
      true,
    configured: true,
  },
);

assert.equal(
  assertOperationsPolicy({
    MARKETOS_ENVIRONMENT:
      "local",
  }).configured,
  false,
);

const bootstrap =
  readFileSync(
    "infrastructure/azure/bootstrap-operations-guardrails.ps1",
    "utf8",
  );

for (
  const required
  of [
    "IUnderstandAzureMonitorMayCharge",
    "FunctionErrors",
    "SiteErrors",
    "MARKETOS_METRIC_ALERTS_CONFIGURED=true",
    "MARKETOS_COST_BUDGET_CONFIGURED=true",
    "az consumption budget create-with-rg",
    "Actual80",
    "Actual100",
    "criterion.timeAggregation",
    "existing.actions",
    "actual100.contactGroups",
    "Budget '$BudgetName' exists but its 80%/100% notification policy does not match MarketOS requirements.",
    "budgets send notifications; they do not stop resources or spending automatically",
  ]
) {
  assert.ok(
    bootstrap.includes(
      required,
    ),
    `Missing guardrail marker: ${required}`,
  );
}

assert.doesNotMatch(
  bootstrap,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING/,
);
assert.doesNotMatch(
  bootstrap,
  /az group create/,
);
assert.doesNotMatch(
  bootstrap,
  /az staticwebapp create/,
);

const readiness =
  readFileSync(
    "services/api/src/functions/productionReadiness.ts",
    "utf8",
  );
assert.match(
  readiness,
  /assertOperationsPolicy\(\)/,
);
assert.match(
  readiness,
  /APPLICATION_INSIGHTS_AND_LOG_REVIEW/,
);

const health =
  readFileSync(
    "services/api/src/functions/health.ts",
    "utf8",
  );
assert.match(
  health,
  /metricAlertsConfigured/,
);
assert.match(
  health,
  /costBudgetConfigured/,
);

const panel =
  readFileSync(
    "apps/web/src/components/SystemPanel.tsx",
    "utf8",
  );
assert.match(
  panel,
  /Operations Guardrails/,
);
assert.match(
  panel,
  /لا توقف الاستهلاك تلقائيًا/,
);

console.log(
  "Operations guardrails smoke passed: production fails closed without monitoring/budget declarations; bootstrap requires explicit charge acknowledgement and never creates app/provider/storage resources.",
);
