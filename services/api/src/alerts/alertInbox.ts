import type { AlertInboxEvent } from "../storage/types.js";
import type { ServerAlertTriggered } from "./serverAlertService.js";

export type AlertInboxSource = "manual-cloud" | "background";

const MAX_ALERT_EVENTS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeAlertInboxEvents(
  value: unknown,
  limit = MAX_ALERT_EVENTS,
): AlertInboxEvent[] {
  if (!Array.isArray(value)) return [];

  const events: AlertInboxEvent[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.symbol)) continue;

    const symbol = item.symbol;
    if (
      typeof item.id !== "string" ||
      typeof item.alertId !== "string" ||
      typeof item.timeframe !== "string" ||
      typeof item.triggeredAt !== "number" ||
      !Number.isFinite(item.triggeredAt) ||
      (item.source !== "manual-cloud" && item.source !== "background") ||
      typeof symbol.id !== "string" ||
      typeof symbol.ticker !== "string" ||
      typeof symbol.name !== "string" ||
      typeof symbol.exchange !== "string" ||
      typeof symbol.assetClass !== "string" ||
      typeof symbol.currency !== "string"
    ) {
      continue;
    }

    events.push({
      id: item.id.slice(0, 180),
      alertId: item.alertId.slice(0, 180),
      symbol: symbol as AlertInboxEvent["symbol"],
      timeframe: item.timeframe as AlertInboxEvent["timeframe"],
      triggeredAt: Math.floor(item.triggeredAt),
      snapshot: item.snapshot,
      conditions: item.conditions,
      source: item.source,
      readAt:
        typeof item.readAt === "number" && Number.isFinite(item.readAt)
          ? Math.floor(item.readAt)
          : undefined,
    });

    if (events.length >= Math.max(1, Math.min(MAX_ALERT_EVENTS, limit))) break;
  }

  return events.sort((a, b) => b.triggeredAt - a.triggeredAt);
}

export function appendAlertInboxEvents(
  current: unknown,
  triggered: ServerAlertTriggered[],
  source: AlertInboxSource,
): AlertInboxEvent[] {
  const existing = sanitizeAlertInboxEvents(current);
  const byId = new Map(existing.map((event) => [event.id, event]));

  for (const item of triggered) {
    if (!item.triggeredAt || !Number.isFinite(item.triggeredAt)) continue;

    const id = `${item.alertId}:${Math.floor(item.triggeredAt)}`;
    byId.set(id, {
      id,
      alertId: item.alertId,
      symbol: item.marketSymbol,
      timeframe: item.timeframe,
      triggeredAt: Math.floor(item.triggeredAt),
      snapshot: item.snapshot,
      conditions: item.conditions,
      source,
    });
  }

  return [...byId.values()]
    .sort((a, b) => b.triggeredAt - a.triggeredAt)
    .slice(0, MAX_ALERT_EVENTS);
}

export function markAlertInboxEventsRead(
  current: unknown,
  ids?: string[],
  readAt = Date.now(),
) {
  const events = sanitizeAlertInboxEvents(current);
  const idSet = ids ? new Set(ids) : null;

  return events.map((event) =>
    !idSet || idSet.has(event.id)
      ? { ...event, readAt: event.readAt ?? readAt }
      : event,
  );
}
