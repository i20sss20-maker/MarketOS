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
import { getMarketDataQuotaStore } from "../usage/cosmosMarketDataQuota.js";
import { configuredMarketDataDailyHardCap, marketDataQuotaExceeded, type MarketDataQuotaDecision } from "../usage/marketDataQuota.js";

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


export async function consumeProductionMarketDataQuota(
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

  const decision =
    await getMarketDataQuotaStore()
      .consume(
        ownerKey(user),
        configuredMarketDataDailyHardCap(),
        units,
      );

  if (!decision.allowed) {
    throw marketDataQuotaExceeded(
      decision,
    );
  }

  return decision;
}
