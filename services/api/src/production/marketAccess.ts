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
