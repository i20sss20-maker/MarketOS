import type { MarketSymbol } from "@marketos/market-core";

export type AlertCondition = "above" | "below";

export type PriceAlert = {
  id: string;
  symbol: MarketSymbol;
  condition: AlertCondition;
  price: number;
  createdAt: number;
  triggeredAt?: number;
};

const STORAGE_KEY = "marketos:price-alerts";

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

export function loadAlerts(): PriceAlert[] {
  const storage = safeStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PriceAlert[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((alert) =>
        alert &&
        typeof alert.id === "string" &&
        alert.symbol &&
        typeof alert.symbol.id === "string" &&
        (alert.condition === "above" || alert.condition === "below") &&
        Number.isFinite(alert.price),
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(0, 100)));
  } catch {
    // Ignore restricted storage environments.
  }
}

export function createPriceAlert(
  symbol: MarketSymbol,
  condition: AlertCondition,
  price: number,
): PriceAlert {
  return {
    id: alertId(),
    symbol,
    condition,
    price,
    createdAt: Date.now(),
  };
}

export function evaluateAlerts(
  alerts: PriceAlert[],
  symbol: MarketSymbol,
  price: number,
): { alerts: PriceAlert[]; triggered: PriceAlert[] } {
  const triggered: PriceAlert[] = [];
  const now = Date.now();

  const next = alerts.map((alert) => {
    if (alert.triggeredAt || alert.symbol.id !== symbol.id) return alert;

    const hit =
      alert.condition === "above"
        ? price >= alert.price
        : price <= alert.price;

    if (!hit) return alert;

    const updated = { ...alert, triggeredAt: now };
    triggered.push(updated);
    return updated;
  });

  return { alerts: next, triggered };
}
