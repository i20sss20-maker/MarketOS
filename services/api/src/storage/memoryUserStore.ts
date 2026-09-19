import type {
  StoredUserState,
  UserCloudState,
  UserStateStore,
} from "./types.js";

export class MemoryUserStateStore implements UserStateStore {
  readonly mode = "memory" as const;
  private readonly states = new Map<string, StoredUserState>();

  async get(userId: string) {
    return this.states.get(userId) ?? null;
  }

  async put(userId: string, state: UserCloudState) {
    const stored: StoredUserState = {
      id: "state",
      userId,
      updatedAt: Date.now(),
      payload: {
        ...state,
        updatedAt: Date.now(),
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
