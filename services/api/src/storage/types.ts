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
  payload: UserCloudState;
};

export interface UserStateStore {
  readonly mode: "memory" | "cosmos";
  get(userId: string): Promise<StoredUserState | null>;
  put(userId: string, state: UserCloudState): Promise<StoredUserState>;
  delete(userId: string): Promise<void>;
}
