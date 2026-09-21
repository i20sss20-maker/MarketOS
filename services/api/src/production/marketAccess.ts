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
import { ownerKey } from "../forecasts/ledger.js";
import { getMarketApiQuotaStore } from "../usage/cosmosMarketApiQuota.js";
import { configuredMarketApiHardCap, marketApiQuotaExceeded, type MarketApiQuotaDecision } from "../usage/marketApiQuota.js";

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

  return user;
}


export type ProductionMarketAccess = {
  user: AuthenticatedUser;
  usage: MarketApiQuotaDecision;
};

export async function authorizeProductionMarketRequest(
  request: HttpRequest,
  cost = 1,
): Promise<ProductionMarketAccess | null> {
  const user =
    assertProductionMarketAccess(
      request,
    );

  if (!user) {
    return null;
  }

  const limit =
    configuredMarketApiHardCap();

  let usage:
    MarketApiQuotaDecision;

  try {
    usage =
      await getMarketApiQuotaStore()
        .consume(
          ownerKey(user),
          limit,
          cost,
        );
  } catch (error) {
    if (
      error instanceof
      ProductionGateError
    ) {
      throw error;
    }

    throw new ProductionGateError(
      "MARKET_API_QUOTA_UNAVAILABLE",
      "Market-data request quota is unavailable. No provider request was started.",
      503,
    );
  }

  if (!usage.allowed) {
    throw marketApiQuotaExceeded(
      usage,
    );
  }

  return {
    user,
    usage,
  };
}
