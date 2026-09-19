import {
  isPlanId,
  resolveEntitlement,
  type ResolvedEntitlement,
  type UserEntitlement,
} from "@marketos/entitlements-core";
import { CosmosEntitlementStore } from "./cosmosEntitlementStore.js";
import { MemoryEntitlementStore } from "./memoryEntitlementStore.js";
import type {
  EntitlementGrantInput,
  EntitlementStore,
} from "./types.js";

function createEntitlementStore(): EntitlementStore {
  const requested =
    (process.env.ENTITLEMENT_DATA_PROVIDER ??
      process.env.USER_DATA_PROVIDER ??
      "memory")
      .trim()
      .toLowerCase();

  if (requested === "cosmos") {
    const connectionString =
      process.env.COSMOS_CONNECTION_STRING?.trim();

    if (connectionString) {
      return new CosmosEntitlementStore(
        connectionString,
        process.env.COSMOS_DATABASE?.trim() ||
          "marketos",
        process.env.COSMOS_ENTITLEMENTS_CONTAINER?.trim() ||
          "entitlements",
      );
    }
  }

  return new MemoryEntitlementStore();
}

export const entitlementStore =
  createEntitlementStore();

function defaultEntitlement(
  userId: string,
): UserEntitlement {
  return {
    userId,
    plan: "free",
    status: "active",
    source: "default",
    updatedAt: Date.now(),
  };
}

export async function getResolvedUserEntitlement(
  userId: string,
): Promise<ResolvedEntitlement> {
  const stored =
    await entitlementStore.get(userId);

  return resolveEntitlement(
    stored ?? defaultEntitlement(userId),
  );
}

export async function grantUserEntitlement(
  input: EntitlementGrantInput,
) {
  if (!input.userId.trim()) {
    throw new Error("A userId is required.");
  }

  if (!isPlanId(input.plan)) {
    throw new Error("Invalid MarketOS plan.");
  }

  const entitlement: UserEntitlement = {
    userId: input.userId.trim().slice(0, 160),
    plan: input.plan,
    status: input.status ?? "active",
    source: input.source ?? "internal",
    updatedAt: Date.now(),
    validUntil:
      typeof input.validUntil === "number" &&
      Number.isFinite(input.validUntil)
        ? Math.floor(input.validUntil)
        : undefined,
  };

  return entitlementStore.set(entitlement);
}
