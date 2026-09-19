import {
  createAlertConditionId,
  type AdvancedAlert,
  type AdvancedAlertCondition,
  type AlertLogic,
} from "@marketos/alert-core";
import type { MarketSymbol, Timeframe } from "@marketos/market-core";

const STORAGE_KEY = "marketos:alerts-v2";
const LEGACY_STORAGE_KEY = "marketos:price-alerts";

type LegacyPriceAlert = {
  id?: string;
  symbol?: MarketSymbol;
  condition?: "above" | "below";
  price?: number;
  createdAt?: number;
  triggeredAt?: number;
};

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function alertId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function validTimeframe(value: unknown): value is Timeframe {
  return [
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
    "1w",
    "1M",
  ].includes(String(value));
}

function validCondition(value: unknown): value is AdvancedAlertCondition {
  if (!value || typeof value !== "object") return false;
  const condition = value as Partial<AdvancedAlertCondition>;

  if (typeof condition.id !== "string") return false;

  if (condition.type === "sma20Cross") {
    return condition.direction === "above" || condition.direction === "below";
  }

  if (condition.type !== "numeric") return false;
  if (
    ![
      "price",
      "changePercent",
      "volume",
      "rsi14",
      "sma20Distance",
    ].includes(String(condition.metric))
  ) {
    return false;
  }

  return (
    (condition.operator === "above" || condition.operator === "below") &&
    typeof condition.value === "number" &&
    Number.isFinite(condition.value)
  );
}

function validAlert(value: unknown): value is AdvancedAlert {
  if (!value || typeof value !== "object") return false;
  const alert = value as Partial<AdvancedAlert>;

  return (
    typeof alert.id === "string" &&
    Boolean(alert.symbol) &&
    typeof alert.symbol?.id === "string" &&
    validTimeframe(alert.timeframe) &&
    (alert.logic === "all" || alert.logic === "any") &&
    Array.isArray(alert.conditions) &&
    alert.conditions.length > 0 &&
    alert.conditions.length <= 4 &&
    alert.conditions.every(validCondition) &&
    typeof alert.enabled === "boolean" &&
    typeof alert.createdAt === "number"
  );
}

function migrateLegacyAlerts(
  legacy: LegacyPriceAlert[],
  timeframe: Timeframe,
): AdvancedAlert[] {
  return legacy.flatMap((alert) => {
    if (
      !alert.symbol ||
      typeof alert.symbol.id !== "string" ||
      (alert.condition !== "above" && alert.condition !== "below") ||
      typeof alert.price !== "number" ||
      !Number.isFinite(alert.price)
    ) {
      return [];
    }

    return [{
      id: typeof alert.id === "string" ? alert.id : alertId(),
      symbol: alert.symbol,
      timeframe,
      logic: "all",
      conditions: [{
        id: createAlertConditionId(),
        type: "numeric",
        metric: "price",
        operator: alert.condition,
        value: alert.price,
      }],
      enabled: true,
      createdAt:
        typeof alert.createdAt === "number"
          ? alert.createdAt
          : Date.now(),
      triggeredAt:
        typeof alert.triggeredAt === "number"
          ? alert.triggeredAt
          : undefined,
    } satisfies AdvancedAlert];
  });
}

export function loadAlerts(
  legacyTimeframe: Timeframe = "1h",
): AdvancedAlert[] {
  const storage = safeStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(validAlert).slice(0, 100);
    }

    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return [];

    const legacy = JSON.parse(legacyRaw) as LegacyPriceAlert[];
    if (!Array.isArray(legacy)) return [];

    const migrated = migrateLegacyAlerts(legacy, legacyTimeframe);
    saveAlerts(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: AdvancedAlert[]) {
  const storage = safeStorage();
  if (!storage) return;

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(alerts.filter(validAlert).slice(0, 100)),
    );
  } catch {
    // Ignore restricted storage environments.
  }
}

export function createAdvancedAlert(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  logic: AlertLogic,
  conditions: AdvancedAlertCondition[],
): AdvancedAlert {
  return {
    id: alertId(),
    symbol,
    timeframe,
    logic,
    conditions: conditions.slice(0, 4),
    enabled: true,
    createdAt: Date.now(),
  };
}

export function rearmAlert(alert: AdvancedAlert): AdvancedAlert {
  return {
    ...alert,
    enabled: true,
    triggeredAt: undefined,
    lastCheckedAt: undefined,
  };
}

export function toggleAlertEnabled(
  alert: AdvancedAlert,
): AdvancedAlert {
  return {
    ...alert,
    enabled: !alert.enabled,
  };
}
