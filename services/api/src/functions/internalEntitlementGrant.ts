import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import {
  isPlanId,
  resolveEntitlement,
  type EntitlementStatus,
} from "@marketos/entitlements-core";
import { hasValidWorkerSecret } from "../auth/workerSecret.js";
import {
  entitlementStore,
  grantUserEntitlement,
} from "../entitlements/index.js";
import { json } from "../http/responses.js";

const statuses = new Set<EntitlementStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
]);

export async function internalEntitlementGrant(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (!hasValidWorkerSecret(request)) {
    return json(401, {
      ok: false,
      error: "Invalid worker credentials.",
    });
  }

  try {
    const body = await request.json() as {
      userId?: unknown;
      plan?: unknown;
      status?: unknown;
      validUntil?: unknown;
    };

    const userId =
      typeof body.userId === "string"
        ? body.userId.trim()
        : "";

    if (!userId) {
      return json(400, {
        ok: false,
        error: "A userId is required.",
      });
    }

    if (!isPlanId(body.plan)) {
      return json(400, {
        ok: false,
        error: "A valid MarketOS plan is required.",
      });
    }

    const status =
      typeof body.status === "string" &&
      statuses.has(body.status as EntitlementStatus)
        ? body.status as EntitlementStatus
        : "active";

    const validUntil =
      typeof body.validUntil === "number" &&
      Number.isFinite(body.validUntil)
        ? Math.floor(body.validUntil)
        : undefined;

    const stored =
      await grantUserEntitlement({
        userId,
        plan: body.plan,
        status,
        source: "internal",
        validUntil,
      });

    return json(200, {
      ok: true,
      storageMode: entitlementStore.mode,
      entitlement:
        resolveEntitlement(stored),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to grant MarketOS entitlement.",
    });
  }
}

app.http("internalEntitlementGrant", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/entitlements/grant",
  handler: internalEntitlementGrant,
});
