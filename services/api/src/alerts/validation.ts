import type {
  AdvancedAlert,
  AdvancedAlertCondition,
} from "@marketos/alert-core";
import type {
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";

const timeframes = new Set<Timeframe>([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
]);

function validSymbol(value: unknown): value is MarketSymbol {
  if (!value || typeof value !== "object") return false;
  const symbol = value as Partial<MarketSymbol>;

  return (
    typeof symbol.id === "string" &&
    typeof symbol.ticker === "string" &&
    typeof symbol.name === "string" &&
    typeof symbol.exchange === "string" &&
    typeof symbol.assetClass === "string" &&
    typeof symbol.currency === "string"
  );
}

function validCondition(
  value: unknown,
): value is AdvancedAlertCondition {
  if (!value || typeof value !== "object") return false;
  const condition = value as Partial<AdvancedAlertCondition>;

  if (typeof condition.id !== "string") return false;

  if (condition.type === "sma20Cross") {
    return (
      condition.direction === "above" ||
      condition.direction === "below"
    );
  }

  if (condition.type !== "numeric") return false;

  return (
    [
      "price",
      "changePercent",
      "volume",
      "rsi14",
      "sma20Distance",
    ].includes(String(condition.metric)) &&
    (condition.operator === "above" ||
      condition.operator === "below") &&
    typeof condition.value === "number" &&
    Number.isFinite(condition.value)
  );
}

export function validAdvancedAlert(
  value: unknown,
): value is AdvancedAlert {
  if (!value || typeof value !== "object") return false;
  const alert = value as Partial<AdvancedAlert>;

  return (
    typeof alert.id === "string" &&
    validSymbol(alert.symbol) &&
    typeof alert.timeframe === "string" &&
    timeframes.has(alert.timeframe as Timeframe) &&
    (alert.logic === "all" || alert.logic === "any") &&
    Array.isArray(alert.conditions) &&
    alert.conditions.length > 0 &&
    alert.conditions.length <= 4 &&
    alert.conditions.every(validCondition) &&
    typeof alert.enabled === "boolean" &&
    typeof alert.createdAt === "number"
  );
}

export function sanitizeAdvancedAlerts(
  value: unknown,
  limit = 100,
): AdvancedAlert[] {
  return Array.isArray(value)
    ? value
        .filter(validAdvancedAlert)
        .slice(0, Math.max(1, limit))
    : [];
}
