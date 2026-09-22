import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { assertRealProvider, assertRequestOrigin, forecastLedgerConfig, ProductionGateError, realDataRequired } from "../production/policy.js";
import { marketDataProvider } from "../providers/index.js";
import { entitlementStore } from "../entitlements/index.js";
import { configuredForecastHardCap } from "../usage/forecastQuota.js";
import { configuredMarketDataHardCap } from "../usage/marketDataQuota.js";
import { assertOperationsPolicy } from "../production/operationsPolicy.js";
import { assertMarketDataPolicy } from "../production/marketDataPolicy.js";
import { assertForecastEvaluationPolicy } from "../production/forecastEvaluationPolicy.js";
import { assertCosmosBackupPolicy } from "../production/cosmosBackupPolicy.js";

export async function productionReadiness(_request: HttpRequest): Promise<HttpResponseInit> {
  const blockers: string[] = [];
  const checks: Array<() => unknown> = [
    () => assertRealProvider(marketDataProvider),
    () => forecastLedgerConfig(),
    () => assertRequestOrigin(null),
    () => assertMarketDataPolicy(),
    () => configuredForecastHardCap(),
    () => configuredMarketDataHardCap(),
    () => assertOperationsPolicy(),
    () => assertForecastEvaluationPolicy(),
    () => assertCosmosBackupPolicy(),
    () => {
      if (entitlementStore.mode !== "cosmos") {
        throw new ProductionGateError("ENTITLEMENTS_NOT_PERSISTENT", "Persistent entitlements are required for production forecast quotas.");
      }
    },
  ];
  if (!realDataRequired()) blockers.push("REAL_DATA_MODE_DISABLED");
  for (const check of checks) {
    try { check(); } catch (error) {
      blockers.push(error instanceof ProductionGateError ? error.code : "CONFIGURATION_INVALID");
    }
  }
  return json(blockers.length ? 503 : 200, {
    ok: blockers.length === 0,
    scope: "configuration-only",
    productionReady: false,
    configured: blockers.length === 0,
    blockers,
    requiredAcceptanceChecks: [
      "HOSTED_AUTH_AND_OWNER_ISOLATION", "COSMOS_WRITE_READ_RESTART", "HOSTED_MARKET_DATA_ENTITLEMENT_AND_TIMESTAMPS",
      "CLIENT_DEMO_FALLBACK_REMOVAL", "HOSTED_SERVER_OUTCOME_EVALUATION", "HOSTED_FORECAST_QUOTA_CONCURRENCY", "HOSTED_MARKET_DATA_QUOTA_CONCURRENCY",
      "HOSTED_ACCOUNT_ERASURE", "COSMOS_RESTORE_RUNBOOK_DRILL", "LOAD_TESTING_AND_RECOVERY", "APPLICATION_INSIGHTS_AND_LOG_REVIEW",
      "PRODUCTION_RELEASE_EVIDENCE_GATE",
    ],
  });
}
app.http("productionReadiness", { methods: ["GET"], authLevel: "anonymous", route: "production/readiness", handler: productionReadiness });
