import type {
  HttpRequest,
} from "@azure/functions";
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from "../auth/clientPrincipal.js";
import {
  assertRequestOrigin,
  ProductionGateError,
  realDataRequired,
} from "./policy.js";
import {
  assertMarketDataPolicy,
} from "./marketDataPolicy.js";
import { ownerKey } from "../forecasts/ledger.js";
import { getMarketDataQuotaStore } from "../usage/cosmosMarketDataQuota.js";
import {
  configuredMarketDataHardCap,
  marketDataQuotaExceeded,
  type MarketDataQuotaDecision,
} from "../usage/marketDataQuota.js";

/**
 * Paid/provider-backed market endpoints stay usable in explicit preview mode,
 * but strict real-data mode requires the trusted SWA principal and configured
 * same-origin boundary before any provider call can start.
 */
export function assertProductionMarketAccess(
  request: HttpRequest,
): AuthenticatedUser | null {
  if (!realDataRequired()) {
    return null;
  }

  assertRequestOrigin(
    request.headers.get("origin"),
  );

  const user =
    getAuthenticatedUser(request);

  if (!user) {
    throw new ProductionGateError(
      "AUTH_REQUIRED",
      "Sign in to access real market data.",
      401,
    );
  }

  // Runtime provider access must fail closed if timing/rights policy
  // becomes invalid after deployment; release-time readiness is not enough.
  assertMarketDataPolicy();

  return user;
}


export async function consumeProductionMarketQuota(
  user: AuthenticatedUser | null,
  units = 1,
): Promise<MarketDataQuotaDecision | null> {
  if (!realDataRequired()) {
    return null;
  }

  if (!user) {
    throw new ProductionGateError(
      "AUTH_REQUIRED",
      "Sign in to access real market data.",
      401,
    );
  }

  const limit =
    configuredMarketDataHardCap();

  let decision:
    MarketDataQuotaDecision;
  try {
    decision =
      await getMarketDataQuotaStore()
        .consume(
          ownerKey(user),
          limit,
          units,
        );
  } catch (error) {
    if (
      error instanceof
      ProductionGateError
    ) {
      throw error;
    }

    throw new ProductionGateError(
      "MARKET_DATA_QUOTA_UNAVAILABLE",
      "Market-data quota storage is unavailable. No provider request was started.",
      503,
    );
  }

  if (!decision.allowed) {
    throw marketDataQuotaExceeded(
      decision,
    );
  }

  return decision;
}

export async function authorizeProductionMarketRequest(
  request: HttpRequest,
  units = 1,
) {
  const user =
    assertProductionMarketAccess(
      request,
    );

  return consumeProductionMarketQuota(
    user,
    units,
  );
}
