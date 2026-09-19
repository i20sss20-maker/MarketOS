import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { canUseFeature } from "@marketos/entitlements-core";
import { appendAlertInboxEvents } from "../alerts/alertInbox.js";
import { evaluateStoredUserAlerts } from "../alerts/serverAlertService.js";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { getResolvedUserEntitlement } from "../entitlements/index.js";
import { json, preflight } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { userStateStore } from "../storage/index.js";

const MAX_GROUPS_PER_CHECK = 20;

export async function userAlertCheck(
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
      await getResolvedUserEntitlement(
        user.userId,
      );

    if (
      !canUseFeature(
        entitlement,
        "serverAlerts",
      )
    ) {
      return json(403, {
        ok: false,
        code: "PLAN_FEATURE",
        error:
          "Server alerts are not included in the current MarketOS plan.",
        plan: entitlement.plan,
        feature: "serverAlerts",
      });
    }

    const stored = await userStateStore.get(user.userId);
    if (!stored) {
      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        provider: marketDataProvider.id,
        checkedGroups: 0,
        totalAlerts: 0,
        triggered: [],
        failures: [],
        capped: false,
        message: "No cloud state is stored for this user.",
      });
    }

    const result = await evaluateStoredUserAlerts(
      stored,
      {
        maxGroups: MAX_GROUPS_PER_CHECK,
      },
    );

    if (result.checkedGroups > 0) {
      await userStateStore.updateAlerts(
        user.userId,
        result.alerts,
        appendAlertInboxEvents(
          stored.payload.alertEvents,
          result.triggered,
          "manual-cloud",
        ),
      );
    }

    return json(200, {
      ok: true,
      storageMode: userStateStore.mode,
      provider: marketDataProvider.id,
      checkedGroups: result.checkedGroups,
      totalAlerts: result.alerts.length,
      triggered: result.triggered,
      failures: result.failures,
      capped: result.capped,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Server alert check failed.",
    });
  }
}

app.http("userAlertCheck", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/alerts/check",
  handler: userAlertCheck,
});
