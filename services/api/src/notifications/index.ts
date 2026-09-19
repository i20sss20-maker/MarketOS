import { CosmosNotificationStore } from "./cosmosNotificationStore.js";
import { MemoryNotificationStore } from "./memoryNotificationStore.js";
import type { NotificationStore } from "./types.js";

function createNotificationStore(): NotificationStore {
  const userDataProvider =
    (process.env.USER_DATA_PROVIDER ?? "memory")
      .trim()
      .toLowerCase();

  if (userDataProvider === "cosmos") {
    const connectionString =
      process.env.COSMOS_CONNECTION_STRING?.trim();

    if (connectionString) {
      return new CosmosNotificationStore(
        connectionString,
        process.env.COSMOS_DATABASE?.trim() ||
          "marketos",
        process.env.COSMOS_NOTIFICATIONS_CONTAINER
          ?.trim() || "notifications",
      );
    }
  }

  return new MemoryNotificationStore();
}

export const notificationStore =
  createNotificationStore();
