import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { canUseFeature } from "@marketos/entitlements-core";
import { appendAlertInboxEvents } from "../alerts/alertInbox.js";
import { evaluateStoredUserAlerts } from "../alerts/serverAlertService.js";
import { getResolvedUserEntitlement } from "../entitlements/index.js";
import { hasValidWorkerSecret } from "../auth/workerSecret.js";
import { json } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { userStateStore } from "../storage/index.js";

const USERS_PER_PAGE = 10;
const GROUPS_PER_USER = 5;

type SweepRequestBody = {
  continuationToken?: unknown;
};

function safeContinuationToken(value: unknown) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096
    ? value
    : undefined;
}

export async function internalAlertSweep(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (!hasValidWorkerSecret(request)) {
    return json(401, {
      ok: false,
      error: "Invalid worker credentials.",
    });
  }

  try {
    let body: SweepRequestBody = {};
    try {
      body = await request.json() as SweepRequestBody;
    } catch {
      // Empty body means first page.
    }

    const batch = await userStateStore.listBatch(
      USERS_PER_PAGE,
      safeContinuationToken(body.continuationToken),
    );

    let processedUsers = 0;
    let checkedGroups = 0;
    let triggeredCount = 0;
    let failureCount = 0;
    let cappedUsers = 0;
    let skippedPlanUsers = 0;

    for (const stored of batch.items) {
      const entitlement =
        await getResolvedUserEntitlement(
          stored.userId,
        );

      if (
        !canUseFeature(
          entitlement,
          "backgroundAlerts",
        )
      ) {
        skippedPlanUsers += 1;
        continue;
      }
      const result = await evaluateStoredUserAlerts(
        stored,
        {
          maxGroups: GROUPS_PER_USER,
        },
      );

      processedUsers += 1;
      checkedGroups += result.checkedGroups;
      triggeredCount += result.triggered.length;
      failureCount += result.failures.length;
      if (result.capped) cappedUsers += 1;

      if (result.checkedGroups > 0) {
        await userStateStore.updateAlerts(
          stored.userId,
          result.alerts,
          appendAlertInboxEvents(
            stored.payload.alertEvents,
            result.triggered,
            "background",
          ),
        );
      }
    }

    return json(200, {
      ok: true,
      storageMode: userStateStore.mode,
      provider: marketDataProvider.id,
      processedUsers,
      checkedGroups,
      triggeredCount,
      failureCount,
      cappedUsers,
      skippedPlanUsers,
      nextContinuationToken:
        batch.continuationToken ?? null,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Background alert sweep failed.",
    });
  }
}

app.http("internalAlertSweep", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/alerts/sweep",
  handler: internalAlertSweep,
});
