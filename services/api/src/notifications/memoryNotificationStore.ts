import type {
  MarketNotification,
  NotificationStore,
} from "./types.js";

export class MemoryNotificationStore
  implements NotificationStore {
  readonly mode = "memory" as const;

  private readonly notifications =
    new Map<string, Map<string, MarketNotification>>();

  private userMap(userId: string) {
    let map = this.notifications.get(userId);
    if (!map) {
      map = new Map<string, MarketNotification>();
      this.notifications.set(userId, map);
    }
    return map;
  }

  async list(userId: string, limit = 50) {
    const bounded = Math.min(
      100,
      Math.max(1, Math.floor(limit)),
    );

    return [...this.userMap(userId).values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, bounded);
  }

  async put(notification: MarketNotification) {
    this.userMap(notification.userId).set(
      notification.id,
      notification,
    );
    return notification;
  }

  async markRead(
    userId: string,
    ids: string[],
    readAt = Date.now(),
  ) {
    const map = this.userMap(userId);

    for (const id of ids.slice(0, 100)) {
      const current = map.get(id);
      if (!current) continue;
      map.set(id, {
        ...current,
        readAt,
      });
    }
  }

  async markAllRead(
    userId: string,
    readAt = Date.now(),
  ) {
    const map = this.userMap(userId);

    for (const [id, current] of map) {
      map.set(id, {
        ...current,
        readAt,
      });
    }
  }

  async clear(userId: string) {
    this.notifications.delete(userId);
  }
}
