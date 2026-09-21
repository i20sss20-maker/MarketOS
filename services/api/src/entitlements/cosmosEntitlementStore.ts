import { CosmosClient, type Container } from "@azure/cosmos";
import type { UserEntitlement } from "@marketos/entitlements-core";
import type { EntitlementStore } from "./types.js";
import { existingUserPartitionContainer } from "../storage/existingCosmosContainer.js";

type StoredEntitlement = UserEntitlement & {
  id: "entitlement";
  _etag?: string;
};

function statusCode(error: unknown) {
  return typeof error === "object" &&
    error &&
    "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

export class CosmosEntitlementStore implements EntitlementStore {
  readonly mode = "cosmos" as const;
  private readonly client: CosmosClient;
  private readonly container: () => Promise<Container>;

  constructor(
    connectionString: string,
    private readonly databaseId = "marketos",
    private readonly containerId = "entitlements",
  ) {
    this.client = new CosmosClient(connectionString);
    this.container = existingUserPartitionContainer(
      this.client,
      this.databaseId,
      this.containerId,
      "Entitlements container",
    );
  }

  async get(userId: string) {
    const container = await this.container();

    try {
      const response =
        await container
          .item("entitlement", userId)
          .read<StoredEntitlement>();

      if (!response.resource) return null;

      const {
        id: _id,
        _etag: _etag,
        ...entitlement
      } = response.resource;

      return entitlement;
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }

  async set(entitlement: UserEntitlement) {
    const container = await this.container();

    const stored: StoredEntitlement = {
      id: "entitlement",
      ...entitlement,
    };

    const response =
      await container.items.upsert(stored);

    const resource =
      response.resource as StoredEntitlement | undefined;

    if (!resource) return entitlement;

    const {
      id: _id,
      _etag: _etag,
      ...next
    } = resource;

    return next;
  }

  async delete(userId: string) {
    const container = await this.container();

    try {
      await container
        .item("entitlement", userId)
        .delete();
    } catch (error) {
      if (statusCode(error) !== 404) throw error;
    }
  }
}
