import {
  ProductionGateError,
  realDataRequired,
} from "./policy.js";

export type OperationsPolicy = {
  metricAlertsConfigured: boolean;
  costBudgetConfigured: boolean;
  configured: boolean;
};

function enabled(
  value: string | undefined,
) {
  return (
    value?.trim().toLowerCase() ===
    "true"
  );
}

export function operationsPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
): OperationsPolicy {
  const metricAlertsConfigured =
    enabled(
      env.MARKETOS_METRIC_ALERTS_CONFIGURED,
    );

  const costBudgetConfigured =
    enabled(
      env.MARKETOS_COST_BUDGET_CONFIGURED,
    );

  return {
    metricAlertsConfigured,
    costBudgetConfigured,
    configured:
      metricAlertsConfigured &&
      costBudgetConfigured,
  };
}

export function assertOperationsPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
) {
  const policy =
    operationsPolicy(env);

  if (
    !realDataRequired(env)
  ) {
    return policy;
  }

  if (
    !policy.metricAlertsConfigured
  ) {
    throw new ProductionGateError(
      "METRIC_ALERTS_NOT_CONFIGURED",
      "Production requires Azure metric alerts for MarketOS service/function errors.",
    );
  }

  if (
    !policy.costBudgetConfigured
  ) {
    throw new ProductionGateError(
      "COST_BUDGET_NOT_CONFIGURED",
      "Production requires an Azure Cost Management budget notification for the MarketOS resource group.",
    );
  }

  return policy;
}
