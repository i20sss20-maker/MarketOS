export type UserCloudState = {
  version: 1;
  updatedAt: number;
  watchlist: unknown[];
  workspaces: unknown[];
  alerts: unknown[];
  chartSettings: Record<string, unknown> | null;
  customIndicators: unknown[];
  drawings: Record<string, unknown[]>;
  ui: Record<string, unknown>;
};

export type StoredUserState = {
  id: "state";
  userId: string;
  updatedAt: number;
  clientUpdatedAt: number;
  clientRevision: number;
  payload: UserCloudState;
  _etag?: string;
};

export type UserStateBatch = {
  items: StoredUserState[];
  continuationToken?: string;
};

export type UserStatePutOptions = {
  expectedClientRevision?: number | null;
};

export class UserStateConflictError extends Error {
  constructor(
    readonly currentClientRevision: number | null,
    message = "Cloud state changed on another device.",
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
  ): Promise<StoredUserState | null>;
  delete(userId: string): Promise<void>;
  listBatch(
    limit: number,
    continuationToken?: string,
  ): Promise<UserStateBatch>;
}
