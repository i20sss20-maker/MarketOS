import {
  resolveEntitlement,
  type ResolvedEntitlement,
} from "@marketos/entitlements-core";

type EntitlementApiResponse = {
  ok: boolean;
  storageMode: "memory" | "cosmos";
  entitlement: ResolvedEntitlement;
  error?: string;
};

export function anonymousEntitlement() {
  return resolveEntitlement(null);
}

export async function getUserEntitlements(
  signal?: AbortSignal,
): Promise<{
  entitlement: ResolvedEntitlement;
  storageMode: "memory" | "cosmos";
}> {
  const response = await fetch(
    "/api/user/entitlements",
    {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal,
    },
  );

  const payload =
    await response.json()
      .catch(() => null) as
      | EntitlementApiResponse
      | null;

  if (
    !response.ok ||
    !payload?.ok ||
    !payload.entitlement
  ) {
    throw new Error(
      payload?.error ??
      `Entitlements request failed (${response.status}).`,
    );
  }

  return {
    entitlement:
      payload.entitlement,
    storageMode:
      payload.storageMode,
  };
}
