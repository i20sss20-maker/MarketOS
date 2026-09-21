import type {
  MarketDataPolicy,
  MarketDataTiming,
  MarketDataUsageScope,
} from "@marketos/market-core";
import {
  ProductionGateError,
  realDataRequired,
} from "./policy.js";

const timingValues =
  new Set<MarketDataTiming>([
    "realtime",
    "delayed",
    "end-of-day",
  ]);

const usageValues =
  new Set<MarketDataUsageScope>([
    "personal",
    "commercial",
  ]);

function isoDate(
  value: string | undefined,
) {
  const raw =
    value?.trim() ?? "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      raw,
    )
  ) {
    return undefined;
  }

  const timestamp =
    Date.parse(
      `${raw}T00:00:00Z`,
    );

  return Number.isFinite(
    timestamp,
  )
    ? raw
    : undefined;
}

function integer(
  value: string | undefined,
) {
  if (
    !value ||
    !/^\d+$/.test(value.trim())
  ) {
    return undefined;
  }

  const parsed =
    Number(value);

  return Number.isSafeInteger(
    parsed,
  )
    ? parsed
    : undefined;
}

export function marketDataPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
  now = new Date(),
): MarketDataPolicy {
  const timingRaw =
    (
      env.MARKET_DATA_TIMING ??
      ""
    )
      .trim()
      .toLowerCase();

  const timing =
    timingValues.has(
      timingRaw as MarketDataTiming,
    )
      ? timingRaw as MarketDataTiming
      : "unknown";

  const usageRaw =
    (
      env.MARKET_DATA_USAGE_SCOPE ??
      ""
    )
      .trim()
      .toLowerCase();

  const usageScope =
    usageValues.has(
      usageRaw as MarketDataUsageScope,
    )
      ? usageRaw as MarketDataUsageScope
      : "unknown";

  const delayMinutes =
    timing === "delayed"
      ? integer(
          env.MARKET_DATA_DELAY_MINUTES,
        )
      : timing === "realtime"
        ? 0
        : undefined;

  const rightsConfirmed =
    (
      env.MARKET_DATA_RIGHTS_CONFIRMED ??
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  const rightsConfirmedAt =
    isoDate(
      env.MARKET_DATA_RIGHTS_CONFIRMED_AT,
    );

  const rightsExpiresAt =
    isoDate(
      env.MARKET_DATA_RIGHTS_EXPIRES_AT,
    );

  const today =
    now
      .toISOString()
      .slice(0, 10);

  const confirmationValid =
    Boolean(
      rightsConfirmedAt &&
      rightsConfirmedAt <= today,
    );

  const expiryValid =
    !rightsExpiresAt ||
    rightsExpiresAt >= today;

  const delayValid =
    timing !== "delayed" ||
    (
      delayMinutes !==
        undefined &&
      delayMinutes >= 1 &&
      delayMinutes <= 1440
    );

  return {
    timing,
    ...(delayMinutes ===
    undefined
      ? {}
      : { delayMinutes }),
    usageScope,
    rightsConfirmed,
    ...(rightsConfirmedAt
      ? { rightsConfirmedAt }
      : {}),
    ...(rightsExpiresAt
      ? { rightsExpiresAt }
      : {}),
    configured:
      timing !== "unknown" &&
      usageScope !==
        "unknown" &&
      rightsConfirmed &&
      confirmationValid &&
      expiryValid &&
      delayValid,
  };
}

export function assertMarketDataPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
  now = new Date(),
) {
  const policy =
    marketDataPolicy(
      env,
      now,
    );

  if (
    !realDataRequired(env)
  ) {
    return policy;
  }

  if (
    policy.timing ===
    "unknown"
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_TIMING_UNDECLARED",
      "Declare whether production market data is realtime, delayed, or end-of-day.",
    );
  }

  if (
    policy.timing ===
      "delayed" &&
    (
      policy.delayMinutes ===
        undefined ||
      policy.delayMinutes < 1 ||
      policy.delayMinutes > 1440
    )
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_DELAY_INVALID",
      "Delayed market data requires an explicit delay in minutes.",
    );
  }

  if (
    policy.usageScope ===
    "unknown"
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_USAGE_SCOPE_UNDECLARED",
      "Declare whether the selected market-data rights are personal or commercial.",
    );
  }

  if (
    !policy.rightsConfirmed
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_RIGHTS_UNCONFIRMED",
      "Market-data usage rights have not been confirmed for this deployment.",
    );
  }

  if (
    !policy.rightsConfirmedAt
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_RIGHTS_CONFIRMATION_INVALID",
      "A valid market-data rights confirmation date is required.",
    );
  }

  const today =
    now
      .toISOString()
      .slice(0, 10);

  if (
    policy.rightsConfirmedAt >
    today
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_RIGHTS_CONFIRMATION_INVALID",
      "Market-data rights confirmation date cannot be in the future.",
    );
  }

  if (
    policy.rightsExpiresAt &&
    policy.rightsExpiresAt <
      today
  ) {
    throw new ProductionGateError(
      "MARKET_DATA_RIGHTS_EXPIRED",
      "The declared market-data usage rights have expired.",
    );
  }

  return policy;
}
