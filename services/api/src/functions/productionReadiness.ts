import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { assertRealProvider, assertRequestOrigin, forecastLedgerConfig, ProductionGateError, realDataRequired } from "../production/policy.js";
import { marketDataProvider } from "../providers/index.js";

export async function productionReadiness(_request: HttpRequest): Promise<HttpResponseInit> {
  const blockers: string[] = [];
  const checks: Array<() => unknown> = [() => assertRealProvider(marketDataProvider), () => forecastLedgerConfig(), () => assertRequestOrigin(null)];
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
      "HOSTED_AUTH_AND_OWNER_ISOLATION", "COSMOS_WRITE_READ_RESTART", "LICENSED_MARKET_DATA_AND_TIMESTAMPS",
      "CLIENT_DEMO_FALLBACK_REMOVAL", "SERVER_OUTCOME_EVALUATION", "LOAD_LIMITS_AND_RECOVERY",
    ],
  });
}
app.http("productionReadiness", { methods: ["GET"], authLevel: "anonymous", route: "production/readiness", handler: productionReadiness });
