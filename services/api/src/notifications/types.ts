export type NotificationKind =
  | "alert-triggered"
  | "system";

export type MarketNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  alertId?: string;
  symbol?: string;
  timeframe?: string;
};

export interface NotificationStore {
  readonly mode: "memory" | "cosmos";
  list(
    userId: string,
    limit?: number,
  ): Promise<MarketNotification[]>;
  put(
    notification: MarketNotification,
  ): Promise<MarketNotification>;
  markRead(
    userId: string,
    ids: string[],
    readAt?: number,
  ): Promise<void>;
  markAllRead(
    userId: string,
    readAt?: number,
  ): Promise<void>;
  clear(userId: string): Promise<void>;
}
