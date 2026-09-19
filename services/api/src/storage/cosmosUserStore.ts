import { CosmosClient, type Container } from "@azure/cosmos";
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

function statusCode(error: unknown) {
  return typeof error === "object" &&
    error &&
    "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

function normalizeStored(
  value: StoredUserState,
): StoredUserState {
  return {
    ...value,
    clientUpdatedAt:
      typeof value.clientUpdatedAt === "number" &&
      Number.isFinite(value.clientUpdatedAt)
        ? Math.floor(value.clientUpdatedAt)
        : value.updatedAt,
    clientRevision:
      typeof value.clientRevision === "number" &&
      Number.isFinite(value.clientRevision) &&
      value.clientRevision >= 1
        ? Math.floor(value.clientRevision)
        : 1,
    serverRevision:
      typeof value.serverRevision === "number" &&
      Number.isFinite(value.serverRevision) &&
      value.serverRevision >= 1
        ? Math.floor(value.serverRevision)
        : 1,
  };
}

export class CosmosUserStateStore implements UserStateStore {
  readonly mode = "cosmos" as const;

  private readonly client: CosmosClient;
  private containerPromise: Promise<Container> | null = null;

  constructor(
    connectionString: string,
    private readonly databaseId = "marketos",
    private readonly containerId = "userState",
  ) {
    this.client = new CosmosClient(connectionString);
  }

  private container() {
    if (!this.containerPromise) {
      this.containerPromise = (async () => {
        const { database } =
          await this.client.databases.createIfNotExists({
            id: this.databaseId,
          });

        const { container } =
          await database.containers.createIfNotExists({
            id: this.containerId,
            partitionKey: {
              paths: ["/userId"],
            },
          });

        return container;
      })();
    }

    return this.containerPromise;
  }

  async get(userId: string) {
    const container = await this.container();

    try {
      const response =
        await container.item("state", userId).read<StoredUserState>();

      return response.resource
        ? normalizeStored(response.resource)
        : null;
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }

  async put(
    userId: string,
    state: UserCloudState,
    options?: UserStatePutOptions,
  ) {
    const container = await this.container();
    const existing = await this.get(userId);
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

    if (!existing) {
      try {
        const response =
          await container.items.create<StoredUserState>(stored);
        return response.resource
          ? normalizeStored(response.resource)
          : stored;
      } catch (error) {
        if (statusCode(error) === 409) {
          const current = await this.get(userId);
          throw new UserStateConflictError(
            current?.clientRevision ?? null,
            current?.serverRevision ?? null,
          );
        }
        throw error;
      }
    }

    if (!existing._etag) {
      throw new UserStateConflictError(
        existing.clientRevision,
        existing.serverRevision,
        "Cloud state version is unavailable. Refresh before saving.",
      );
    }

    try {
      const response = await container
        .item("state", userId)
        .replace<StoredUserState>(
          stored,
          {
            accessCondition: {
              type: "IfMatch",
              condition: existing._etag,
            },
          },
        );

      return response.resource
        ? normalizeStored(response.resource)
        : stored;
    } catch (error) {
      if (statusCode(error) === 412) {
        const current = await this.get(userId);
        throw new UserStateConflictError(
          current?.clientRevision ?? null,
          current?.serverRevision ?? null,
        );
      }
      throw error;
    }
  }

  async updateAlerts(
    userId: string,
    alerts: unknown[],
    alertEvents?: AlertInboxEvent[],
  ) {
    const container = await this.container();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.get(userId);
      if (!existing) return null;
      if (!existing._etag) return existing;

      const now = Date.now();
      const stored: StoredUserState = {
        id: existing.id,
        userId: existing.userId,
        updatedAt: now,
        clientUpdatedAt: existing.clientUpdatedAt,
        clientRevision: existing.clientRevision,
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

      try {
        const response = await container
          .item("state", userId)
          .replace<StoredUserState>(
            stored,
            {
              accessCondition: {
                type: "IfMatch",
                condition: existing._etag,
              },
            },
          );

        return response.resource
          ? normalizeStored(response.resource)
          : stored;
      } catch (error) {
        if (statusCode(error) === 412) continue;
        throw error;
      }
    }

    throw new Error(
      "Cloud alerts changed concurrently too many times. Retry the alert sweep.",
    );
  }

  async updatePushSubscriptions(
    userId: string,
    updater: PushSubscriptionUpdater,
  ) {
    const container = await this.container();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.get(userId);
      if (!existing) return null;
      if (!existing._etag) return existing;

      const pushSubscriptions = updater(
        existing.payload.pushSubscriptions ?? [],
      );
      const now = Date.now();
      const stored: StoredUserState = {
        id: existing.id,
        userId: existing.userId,
        updatedAt: now,
        clientUpdatedAt: existing.clientUpdatedAt,
        clientRevision: existing.clientRevision,
        serverRevision: existing.serverRevision + 1,
        payload: {
          ...existing.payload,
          pushSubscriptions,
          updatedAt: now,
        },
      };

      try {
        const response = await container
          .item("state", userId)
          .replace<StoredUserState>(
            stored,
            {
              accessCondition: {
                type: "IfMatch",
                condition: existing._etag,
              },
            },
          );

        return response.resource
          ? normalizeStored(response.resource)
          : stored;
      } catch (error) {
        if (statusCode(error) === 412) continue;
        throw error;
      }
    }

    throw new Error(
      "Cloud Push registrations changed concurrently too many times. Retry device registration.",
    );
  }

  async delete(userId: string) {
    const container = await this.container();

    try {
      await container.item("state", userId).delete();
    } catch (error) {
      if (statusCode(error) !== 404) throw error;
    }
  }

  async listBatch(
    limit: number,
    continuationToken?: string,
  ) {
    const container = await this.container();
    const bounded = Math.min(100, Math.max(1, Math.floor(limit)));

    const response = await container.items
      .query<StoredUserState>(
        {
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [
            {
              name: "@id",
              value: "state",
            },
          ],
        },
        {
          maxItemCount: bounded,
          continuationToken,
        },
      )
      .fetchNext();

    return {
      items: (response.resources ?? []).map(normalizeStored),
      continuationToken:
        response.continuationToken || undefined,
    };
  }
}
