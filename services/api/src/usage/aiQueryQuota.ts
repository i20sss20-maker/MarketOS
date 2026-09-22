import type {
  HttpRequest,
} from "@azure/functions";
import {
  getAuthenticatedUser,
} from "../auth/clientPrincipal.js";
import {
  entitlementStore,
  getResolvedUserEntitlement,
} from "../entitlements/index.js";
import {
  ownerKey,
} from "../forecasts/ledger.js";
import {
  assertRequestOrigin,
  ProductionGateError,
  realDataRequired,
} from "../production/policy.js";
import {
  getForecastQuotaStore,
} from "./cosmosForecastQuota.js";
import {
  effectiveForecastDailyLimit,
  quotaExceeded,
  type ForecastQuotaDecision,
} from "./forecastQuota.js";

export type AiQueryQuotaResult = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

export async function consumeProductionAiQuery(
  request: HttpRequest,
): Promise<AiQueryQuotaResult | null> {
  if (!realDataRequired()) {
    return null;
  }

  assertRequestOrigin(
    request.headers.get(
      "origin",
    ),
  );

  const user =
    getAuthenticatedUser(
      request,
    );

  if (!user) {
    throw new ProductionGateError(
      "AUTH_REQUIRED",
      "Sign in to use MarketOS AI in real-data mode.",
      401,
    );
  }

  if (
    entitlementStore.mode !==
    "cosmos"
  ) {
    throw new ProductionGateError(
      "ENTITLEMENTS_NOT_PERSISTENT",
      "Persistent entitlements are required before production AI queries are enabled.",
    );
  }

  const entitlement =
    await getResolvedUserEntitlement(
      user.userId,
    );
  const limit =
    effectiveForecastDailyLimit(
      entitlement,
    );

  let decision:
    ForecastQuotaDecision;

  try {
    decision =
      await getForecastQuotaStore()
        .consume(
          ownerKey(user),
          limit,
        );
  } catch (error) {
    if (
      error instanceof
      ProductionGateError
    ) {
      throw error;
    }

    throw new ProductionGateError(
      "AI_QUERY_QUOTA_UNAVAILABLE",
      "AI query quota storage is unavailable. The analysis was not started.",
      503,
    );
  }

  if (!decision.allowed) {
    const exceeded =
      quotaExceeded(
        decision,
      );

    throw new ProductionGateError(
      "DAILY_AI_QUERY_LIMIT",
      exceeded.message.replace(
        "forecast generation",
        "AI query",
      ),
      429,
    );
  }

  return {
    used: decision.used,
    limit: decision.limit,
    remaining:
      decision.remaining,
    resetAt:
      decision.resetAt,
  };
}
