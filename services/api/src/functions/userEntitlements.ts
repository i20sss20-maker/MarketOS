import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import {
  entitlementStore,
  getResolvedUserEntitlement,
} from "../entitlements/index.js";
import { json, preflight } from "../http/responses.js";

export async function userEntitlements(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  const user = getAuthenticatedUser(request);
  if (!user) {
    return json(401, {
      ok: false,
      error: "Authentication required.",
    });
  }

  try {
    const entitlement =
      await getResolvedUserEntitlement(user.userId);

    return json(200, {
      ok: true,
      storageMode: entitlementStore.mode,
      entitlement,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to resolve MarketOS entitlements.",
    });
  }
}

app.http("userEntitlements", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/entitlements",
  handler: userEntitlements,
});
