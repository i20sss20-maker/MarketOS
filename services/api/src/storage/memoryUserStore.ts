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
}
