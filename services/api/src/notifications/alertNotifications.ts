import { createHash } from "node:crypto";
import type {
  ServerAlertTriggered,
} from "../alerts/serverAlertService.js";
import { notificationStore } from "./index.js";
import type { MarketNotification } from "./types.js";

function notificationId(
  userId: string,
  alert: ServerAlertTriggered,
) {
  const material = [
    userId,
    alert.alertId,
    String(alert.triggeredAt ?? 0),
  ].join("|");

  const digest = createHash("sha256")
    .update(material)
    .digest("hex")
    .slice(0, 32);

  return `alert-${digest}`;
}

export async function recordAlertNotifications(
  userId: string,
  triggered: ServerAlertTriggered[],
) {
  let created = 0;
  let failures = 0;

  for (const item of triggered) {
    const notification: MarketNotification = {
      id: notificationId(userId, item),
      userId,
      kind: "alert-triggered",
      title:
        `تنبيه ${item.symbol} · ${item.timeframe.toUpperCase()}`,
      body:
        "تحققت شروط التنبيه المحفوظة في MarketOS.",
      createdAt:
        item.triggeredAt ?? Date.now(),
      alertId: item.alertId,
      symbol: item.symbol,
      timeframe: item.timeframe,
    };

    try {
      await notificationStore.put(notification);
      created += 1;
    } catch {
      failures += 1;
    }
  }

  return {
    created,
    failures,
  };
}
