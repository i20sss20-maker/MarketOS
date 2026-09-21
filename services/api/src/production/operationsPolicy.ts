import {
  ProductionGateError,
  realDataRequired,
} from "./policy.js";

export type OperationsPolicy = {
  metricAlertsConfigured: boolean;
  costBudgetConfigured: boolean;
  applicationInsightsLinked: boolean;
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

  const applicationInsightsLinked =
    Boolean(
      env.APPLICATIONINSIGHTS_CONNECTION_STRING
        ?.trim(),
    );

  return {
    metricAlertsConfigured,
    costBudgetConfigured,
    applicationInsightsLinked,
    configured:
      metricAlertsConfigured &&
      costBudgetConfigured &&
      applicationInsightsLinked,
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

  if (
    !policy.applicationInsightsLinked
  ) {
    throw new ProductionGateError(
      "APPLICATION_INSIGHTS_NOT_LINKED",
      "Production requires Application Insights linked to the MarketOS Static Web App.",
    );
  }

  return policy;
}
