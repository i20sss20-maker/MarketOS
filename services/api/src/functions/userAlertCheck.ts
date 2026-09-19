import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { evaluateStoredUserAlerts } from "../alerts/serverAlertService.js";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
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
      await userStateStore.put(user.userId, {
        ...stored.payload,
        alerts: result.alerts,
        updatedAt: Date.now(),
      });
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
