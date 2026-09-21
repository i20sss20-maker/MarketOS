import {
  ProductionGateError,
} from "../production/policy.js";

export type MarketDataQuotaDecision = {
  allowed: boolean;
  day: string;
  used: number;
  requestedUnits: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type MarketDataUsageRecord = {
  id: string;
  userId: string;
  kind: "marketos-market-data-usage-v1";
  day: string;
  count: number;
  limit: number;
  updatedAt: number;
  _etag?: string;
};

export interface MarketDataQuotaStore {
  consume(
    userId: string,
    limit: number,
    units?: number,
    now?: number,
  ): Promise<MarketDataQuotaDecision>;
}

export function marketDataUsageWindow(
  now = Date.now(),
) {
  if (
    !Number.isFinite(now) ||
    now <= 0
  ) {
    throw new ProductionGateError(
      "INVALID_MARKET_DATA_QUOTA_CLOCK",
      "Market-data quota clock is invalid.",
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
    id: `market-data-usage:${day}`,
  };
}

export function configuredMarketDataDailyHardCap(
  env: NodeJS.ProcessEnv =
    process.env,
) {
  const raw =
    env.MARKET_DATA_DAILY_HARD_CAP?.trim();
  const value =
    raw ? Number(raw) : NaN;

  if (
    !Number.isInteger(value) ||
    value < 10 ||
    value > 100_000
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_QUOTA_NOT_CONFIGURED",
      "Configure MARKET_DATA_DAILY_HARD_CAP between 10 and 100000 before enabling real market-data access.",
    );
  }

  return value;
}

export function marketDataQuotaExceeded(
  decision: MarketDataQuotaDecision,
) {
  return new ProductionGateError(
    "DAILY_MARKET_DATA_LIMIT",
    `Daily market-data request budget reached. Resets at ${new Date(decision.resetAt).toISOString()}.`,
    429,
  );
}
