import { CosmosUserStateStore } from "./cosmosUserStore.js";
import { MemoryUserStateStore } from "./memoryUserStore.js";
import type { UserStateStore } from "./types.js";

function createUserStateStore(): UserStateStore {
  const requested =
    (process.env.USER_DATA_PROVIDER ?? "memory")
      .trim()
      .toLowerCase();

  if (requested === "cosmos") {
    const connectionString =
      process.env.COSMOS_CONNECTION_STRING?.trim();

    if (connectionString) {
      return new CosmosUserStateStore(
        connectionString,
        process.env.COSMOS_DATABASE?.trim() || "marketos",
        process.env.COSMOS_CONTAINER?.trim() || "userState",
      );
    }
  }

  return new MemoryUserStateStore();
}

export const userStateStore = createUserStateStore();
