import type { UserEntitlement } from "@marketos/entitlements-core";
import type { EntitlementStore } from "./types.js";

export class MemoryEntitlementStore implements EntitlementStore {
  readonly mode = "memory" as const;
  private readonly records = new Map<string, UserEntitlement>();

  async get(userId: string) {
    return this.records.get(userId) ?? null;
  }

  async set(entitlement: UserEntitlement) {
    const stored = { ...entitlement };
    this.records.set(entitlement.userId, stored);
    return stored;
  }

  async delete(userId: string) {
    this.records.delete(userId);
  }
}
