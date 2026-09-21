import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { assertRealProvider, assertRequestOrigin, forecastLedgerConfig, ProductionGateError, realDataRequired } from "../production/policy.js";
import { marketDataProvider } from "../providers/index.js";
import { entitlementStore } from "../entitlements/index.js";
import { configuredForecastHardCap } from "../usage/forecastQuota.js";
import { assertMarketDataPolicy } from "../production/marketDataPolicy.js";

export async function productionReadiness(_request: HttpRequest): Promise<HttpResponseInit> {
  const blockers: string[] = [];
  const checks: Array<() => unknown> = [
    () => assertRealProvider(marketDataProvider),
    () => forecastLedgerConfig(),
    () => assertRequestOrigin(null),
    () => assertMarketDataPolicy(),
    () => configuredForecastHardCap(),
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
      "CLIENT_DEMO_FALLBACK_REMOVAL", "SERVER_OUTCOME_EVALUATION", "HOSTED_QUOTA_CONCURRENCY",
      "LOAD_TESTING_AND_RECOVERY", "OBSERVABILITY_AND_COST_ALERTS",
    ],
  });
}
app.http("productionReadiness", { methods: ["GET"], authLevel: "anonymous", route: "production/readiness", handler: productionReadiness });
