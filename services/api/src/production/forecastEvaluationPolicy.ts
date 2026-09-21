import {
  ProductionGateError,
  realDataRequired,
} from "./policy.js";

export type ForecastEvaluationPolicy = {
  enabled: boolean;
  workerCredentialConfigured: boolean;
  configured: boolean;
};

export function forecastEvaluationPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
): ForecastEvaluationPolicy {
  const enabled =
    env.FORECAST_EVALUATION_ENABLED
      ?.trim()
      .toLowerCase() ===
    "true";

  const workerCredentialConfigured =
    (
      env.MARKETOS_WORKER_SECRET
        ?.trim() ?? ""
    ).length >= 32;

  return {
    enabled,
    workerCredentialConfigured,
    configured:
      enabled &&
      workerCredentialConfigured,
  };
}

export function assertForecastEvaluationPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
) {
  const policy =
    forecastEvaluationPolicy(
      env,
    );

  if (
    !realDataRequired(env)
  ) {
    return policy;
  }

  if (!policy.enabled) {
    throw new ProductionGateError(
      "FORECAST_EVALUATION_DISABLED",
      "Server forecast evaluation must be enabled for production.",
    );
  }

  if (
    !policy.workerCredentialConfigured
  ) {
    throw new ProductionGateError(
      "FORECAST_EVALUATION_WORKER_SECRET_MISSING",
      "A valid worker credential is required for production forecast evaluation.",
    );
  }

  return policy;
}
