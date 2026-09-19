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

export type PushSubscriptionUpdater = (
  current: PushSubscriptionRecord[],
) => PushSubscriptionRecord[];

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
  chartTemplates: unknown[];
  drawings: Record<string, unknown[]>;
  ui: Record<string, unknown>;
};

export type StoredUserState = {
  id: "state";
  userId: string;
  updatedAt: number;
  clientUpdatedAt: number;
  clientRevision: number;
  serverRevision: number;
  payload: UserCloudState;
  _etag?: string;
};

export type UserStateBatch = {
  items: StoredUserState[];
  continuationToken?: string;
};

export type UserStatePutOptions = {
  expectedClientRevision?: number | null;
  expectedServerRevision?: number | null;
};

export class UserStateConflictError extends Error {
  constructor(
    readonly currentClientRevision: number | null,
    readonly currentServerRevision: number | null,
    message = "Cloud state changed since this device last read it.",
  ) {
    super(message);
    this.name = "UserStateConflictError";
  }
}

export interface UserStateStore {
  readonly mode: "memory" | "cosmos";

  get(userId: string): Promise<StoredUserState | null>;

  put(
    userId: string,
    state: UserCloudState,
    options?: UserStatePutOptions,
  ): Promise<StoredUserState>;

  updateAlerts(
    userId: string,
    alerts: unknown[],
    alertEvents?: AlertInboxEvent[],
  ): Promise<StoredUserState | null>;

  updatePushSubscriptions(
    userId: string,
    updater: PushSubscriptionUpdater,
  ): Promise<StoredUserState | null>;

  delete(userId: string): Promise<void>;

  listBatch(
    limit: number,
    continuationToken?: string,
  ): Promise<UserStateBatch>;
}
