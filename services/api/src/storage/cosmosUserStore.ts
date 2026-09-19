import { CosmosClient, type Container } from "@azure/cosmos";
import type {
  StoredUserState,
  UserCloudState,
  UserStateStore,
} from "./types.js";

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
      return response.resource ?? null;
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error &&
        "code" in error
          ? Number((error as { code?: unknown }).code)
          : undefined;

      if (statusCode === 404) return null;
      throw error;
    }
  }

  async put(userId: string, state: UserCloudState) {
    const container = await this.container();

    const stored: StoredUserState = {
      id: "state",
      userId,
      updatedAt: Date.now(),
      payload: {
        ...state,
        updatedAt: Date.now(),
      },
    };

    const response = await container.items.upsert(stored);
    return response.resource ?? stored;
  }

  async delete(userId: string) {
    const container = await this.container();

    try {
      await container.item("state", userId).delete();
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error &&
        "code" in error
          ? Number((error as { code?: unknown }).code)
          : undefined;

      if (statusCode !== 404) throw error;
    }
  }
}
