import {
  UserStateConflictError,
  type StoredUserState,
  type UserCloudState,
  type UserStatePutOptions,
  type UserStateStore,
} from "./types.js";

export class MemoryUserStateStore implements UserStateStore {
  readonly mode = "memory" as const;
  private readonly states = new Map<string, StoredUserState>();

  async get(userId: string) {
    return this.states.get(userId) ?? null;
  }

  async put(
    userId: string,
    state: UserCloudState,
    options?: UserStatePutOptions,
  ) {
    const existing = this.states.get(userId) ?? null;
    const expected = options?.expectedClientRevision;

    if (expected !== undefined) {
      if (expected === null && existing) {
        throw new UserStateConflictError(
          existing.clientRevision,
          "A cloud copy already exists.",
        );
      }

      if (
        expected !== null &&
        (!existing || existing.clientRevision !== expected)
      ) {
        throw new UserStateConflictError(
          existing?.clientRevision ?? null,
        );
      }
    }

    const now = Date.now();
    const stored: StoredUserState = {
      id: "state",
      userId,
      updatedAt: now,
      clientRevision: (existing?.clientRevision ?? 0) + 1,
      payload: {
        ...state,
        updatedAt: now,
      },
    };

    this.states.set(userId, stored);
    return stored;
  }

  async updateAlerts(userId: string, alerts: unknown[]) {
    const existing = this.states.get(userId);
    if (!existing) return null;

    const now = Date.now();
    const stored: StoredUserState = {
      ...existing,
      updatedAt: now,
      payload: {
        ...existing.payload,
        alerts,
        updatedAt: now,
      },
    };

    this.states.set(userId, stored);
    return stored;
  }

  async delete(userId: string) {
    this.states.delete(userId);
  }

  async listBatch(
    limit: number,
    continuationToken?: string,
  ) {
    const bounded = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = continuationToken
      ? Math.max(0, Number.parseInt(continuationToken, 10) || 0)
      : 0;

    const items = [...this.states.values()]
      .sort((a, b) => a.userId.localeCompare(b.userId));

    const page = items.slice(offset, offset + bounded);
    const nextOffset = offset + page.length;

    return {
      items: page,
      continuationToken:
        nextOffset < items.length
          ? String(nextOffset)
          : undefined,
    };
  }
}
