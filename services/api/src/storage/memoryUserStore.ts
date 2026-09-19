import {
  UserStateConflictError,
  type AlertInboxEvent,
  type PushSubscriptionRecord,
  type PushSubscriptionUpdater,
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
    const expectedClient =
      options?.expectedClientRevision;
    const expectedServer =
      options?.expectedServerRevision;

    if (
      (expectedClient === null || expectedServer === null) &&
      existing
    ) {
      throw new UserStateConflictError(
        existing.clientRevision,
        existing.serverRevision,
        "A cloud copy already exists.",
      );
    }

    if (
      expectedClient !== undefined &&
      expectedClient !== null &&
      (!existing || existing.clientRevision !== expectedClient)
    ) {
      throw new UserStateConflictError(
        existing?.clientRevision ?? null,
        existing?.serverRevision ?? null,
      );
    }

    if (
      expectedServer !== undefined &&
      expectedServer !== null &&
      (!existing || existing.serverRevision !== expectedServer)
    ) {
      throw new UserStateConflictError(
        existing?.clientRevision ?? null,
        existing?.serverRevision ?? null,
      );
    }

    const now = Date.now();
    const stored: StoredUserState = {
      id: "state",
      userId,
      updatedAt: now,
      clientUpdatedAt: now,
      clientRevision: (existing?.clientRevision ?? 0) + 1,
      serverRevision: (existing?.serverRevision ?? 0) + 1,
      payload: {
        ...state,
        updatedAt: now,
      },
    };

    this.states.set(userId, stored);
    return stored;
  }

  async updateAlerts(
    userId: string,
    alerts: unknown[],
    alertEvents?: AlertInboxEvent[],
  ) {
    const existing = this.states.get(userId);
    if (!existing) return null;

    const now = Date.now();
    const stored: StoredUserState = {
      ...existing,
      updatedAt: now,
      serverRevision: existing.serverRevision + 1,
      payload: {
        ...existing.payload,
        alerts,
        alertEvents:
          alertEvents ??
          existing.payload.alertEvents ??
          [],
        updatedAt: now,
      },
    };

    this.states.set(userId, stored);
    return stored;
  }

  async updatePushSubscriptions(
    userId: string,
    updater: PushSubscriptionUpdater,
  ) {
    const existing = this.states.get(userId);
    if (!existing) return null;

    const current =
      existing.payload.pushSubscriptions ?? [];
    const pushSubscriptions = updater(current);

    const now = Date.now();
    const stored: StoredUserState = {
      ...existing,
      updatedAt: now,
      serverRevision: existing.serverRevision + 1,
      payload: {
        ...existing.payload,
        pushSubscriptions,
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
