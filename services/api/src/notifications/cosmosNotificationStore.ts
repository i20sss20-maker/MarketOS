import {
  CosmosClient,
  type Container,
} from "@azure/cosmos";
import type {
  MarketNotification,
  NotificationStore,
} from "./types.js";

export class CosmosNotificationStore
  implements NotificationStore {
  readonly mode = "cosmos" as const;

  private readonly client: CosmosClient;
  private containerPromise: Promise<Container> | null =
    null;

  constructor(
    connectionString: string,
    private readonly databaseId = "marketos",
    private readonly containerId = "notifications",
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

  async list(userId: string, limit = 50) {
    const container = await this.container();
    const bounded = Math.min(
      100,
      Math.max(1, Math.floor(limit)),
    );

    const response = await container.items
      .query<MarketNotification>(
        {
          query:
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
          parameters: [
            {
              name: "@userId",
              value: userId,
            },
          ],
        },
        {
          partitionKey: userId,
          maxItemCount: bounded,
        },
      )
      .fetchNext();

    return response.resources ?? [];
  }

  async put(notification: MarketNotification) {
    const container = await this.container();
    await container.items.upsert(notification);
    return notification;
  }

  async markRead(
    userId: string,
    ids: string[],
    readAt = Date.now(),
  ) {
    const container = await this.container();

    await Promise.all(
      ids.slice(0, 100).map(async (id) => {
        try {
          await container
            .item(id, userId)
            .patch([
              {
                op: "set",
                path: "/readAt",
                value: readAt,
              },
            ]);
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error &&
            "code" in error
              ? Number(
                  (error as { code?: unknown }).code,
                )
              : undefined;

          if (statusCode !== 404) throw error;
        }
      }),
    );
  }

  async markAllRead(
    userId: string,
    readAt = Date.now(),
  ) {
    const items = await this.list(userId, 100);
    await this.markRead(
      userId,
      items.map((item) => item.id),
      readAt,
    );
  }

  async clear(userId: string) {
    const container = await this.container();
    const items = await this.list(userId, 100);

    await Promise.all(
      items.map((item) =>
        container
          .item(item.id, userId)
          .delete(),
      ),
    );
  }
}
