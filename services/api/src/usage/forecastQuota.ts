import type { ResolvedEntitlement } from "@marketos/entitlements-core";
import { ProductionGateError } from "../production/policy.js";

export type ForecastQuotaDecision = {
  allowed: boolean;
  day: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type ForecastUsageRecord = {
  id: string;
  userId: string;
  kind: "marketos-forecast-usage-v1";
  day: string;
  count: number;
  limit: number;
  updatedAt: number;
  _etag?: string;
};

export interface ForecastQuotaStore {
  consume(userId: string, limit: number, now?: number): Promise<ForecastQuotaDecision>;
}

export function utcUsageWindow(now = Date.now()) {
  if (!Number.isFinite(now) || now <= 0) {
    throw new ProductionGateError("INVALID_QUOTA_CLOCK", "Forecast quota clock is invalid.");
  }
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10);
  const resetAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return { day, resetAt, id: `forecast-usage:${day}` };
}

export function configuredForecastHardCap(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.FORECAST_DAILY_HARD_CAP?.trim();
  const value = raw ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new ProductionGateError(
      "FORECAST_QUOTA_NOT_CONFIGURED",
      "Configure FORECAST_DAILY_HARD_CAP between 1 and 500 before enabling real forecast generation.",
    );
  }
  return value;
}

export function effectiveForecastDailyLimit(
  entitlement: ResolvedEntitlement,
  env: NodeJS.ProcessEnv = process.env,
) {
  const planLimit = entitlement.definition.limits.aiQueriesPerDay;
  const hardCap = configuredForecastHardCap(env);
  if (!Number.isInteger(planLimit) || planLimit < 1) {
    throw new ProductionGateError("FORECAST_PLAN_LIMIT_INVALID", "The active plan does not allow forecast generation.", 403);
  }
  return Math.min(planLimit, hardCap);
}

export function quotaExceeded(decision: ForecastQuotaDecision) {
  return new ProductionGateError(
    "DAILY_FORECAST_LIMIT",
    `Daily forecast generation limit reached. Resets at ${new Date(decision.resetAt).toISOString()}.`,
    429,
  );
}
