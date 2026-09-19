import type {
  PlanId,
  ResolvedEntitlement,
  UserEntitlement,
} from "@marketos/entitlements-core";

export interface EntitlementStore {
  readonly mode: "memory" | "cosmos";
  get(userId: string): Promise<UserEntitlement | null>;
  set(entitlement: UserEntitlement): Promise<UserEntitlement>;
  delete(userId: string): Promise<void>;
}

export type EntitlementGrantInput = {
  userId: string;
  plan: PlanId;
  status?: UserEntitlement["status"];
  source?: UserEntitlement["source"];
  validUntil?: number;
};

export type EntitlementResponse = {
  storageMode: EntitlementStore["mode"];
  entitlement: ResolvedEntitlement;
};
