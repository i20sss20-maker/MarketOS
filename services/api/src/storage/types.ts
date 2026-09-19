import type { MarketSymbol, Timeframe } from "@marketos/market-core";

export type AlertInboxEvent = {
  id: string;
  alertId: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  triggeredAt: number;
  snapshot?: unknown;
  conditions?: unknown;
  source: "manual-cloud" | "background";
  readAt?: number;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: number;
  lastSeenAt: number;
  userAgent?: string;
};

export type UserCloudState = {
  version: 1;
  updatedAt: number;
  watchlist: unknown[];
  workspaces: unknown[];
  alerts: unknown[];
  alertEvents?: AlertInboxEvent[];
  pushSubscriptions?: PushSubscriptionRecord[];
  chartSettings: Record<string, unknown> | null;
  customIndicators: unknown[];
  ui: Record<string, unknown>;
};

export type StoredUserState = {
  id: "state";
  userId: string;
  updatedAt: number;
  payload: UserCloudState;
};

export type UserStateBatch = {
  items: StoredUserState[];
  continuationToken?: string;
};

export interface UserStateStore {
  readonly mode: "memory" | "cosmos";
  get(userId: string): Promise<StoredUserState | null>;
  put(userId: string, state: UserCloudState): Promise<StoredUserState>;
  delete(userId: string): Promise<void>;
  listBatch(
    limit: number,
    continuationToken?: string,
  ): Promise<UserStateBatch>;
}
