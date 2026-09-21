import {
  ProductionGateError,
} from "../production/policy.js";

export type MarketApiQuotaDecision = {
  allowed: boolean;
  day: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type MarketApiUsageRecord = {
  id: string;
  userId: string;
  kind: "marketos-market-api-usage-v1";
  day: string;
  count: number;
  limit: number;
  updatedAt: number;
  _etag?: string;
};

export interface MarketApiQuotaStore {
  consume(
    userId: string,
    limit: number,
    cost?: number,
    now?: number,
  ): Promise<MarketApiQuotaDecision>;
}

export function marketApiUsageWindow(
  now = Date.now(),
) {
  if (
    !Number.isFinite(now) ||
    now <= 0
  ) {
    throw new ProductionGateError(
      "INVALID_MARKET_API_QUOTA_CLOCK",
      "Market API quota clock is invalid.",
    );
  }

  const date =
    new Date(now);
  const day =
    date
      .toISOString()
      .slice(0, 10);
  const resetAt =
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );

  return {
    day,
    resetAt,
    id:
      `market-api-usage:${day}`,
  };
}

export function configuredMarketApiHardCap(
  env: NodeJS.ProcessEnv =
    process.env,
) {
  const raw =
    env.MARKET_API_DAILY_HARD_CAP?.trim();
  const value =
    raw
      ? Number(raw)
      : NaN;

  if (
    !Number.isInteger(value) ||
    value < 100 ||
    value > 100_000
  ) {
    throw new ProductionGateError(
      "MARKET_API_QUOTA_NOT_CONFIGURED",
      "Configure MARKET_API_DAILY_HARD_CAP between 100 and 100000 before enabling real market-data endpoints.",
    );
  }

  return value;
}

export function marketApiQuotaExceeded(
  decision: MarketApiQuotaDecision,
) {
  return new ProductionGateError(
    "DAILY_MARKET_API_LIMIT",
    `Daily market-data request limit reached. Resets at ${new Date(decision.resetAt).toISOString()}.`,
    429,
  );
}
