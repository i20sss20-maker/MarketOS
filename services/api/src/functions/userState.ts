import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { cloudStateViolations } from "@marketos/entitlements-core";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { getResolvedUserEntitlement } from "../entitlements/index.js";
import { json, preflight } from "../http/responses.js";
import { sanitizeUserCloudState } from "../storage/stateValidation.js";
import { userStateStore } from "../storage/index.js";
import {
  UserStateConflictError,
  type UserCloudState,
} from "../storage/types.js";

function publicCloudState(
  state: UserCloudState,
) {
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    watchlist: state.watchlist,
    workspaces: state.workspaces,
    alerts: state.alerts,
    alertEvents: state.alertEvents ?? [],
    chartSettings: state.chartSettings,
    customIndicators: state.customIndicators,
    chartTemplates: state.chartTemplates,
    drawings: state.drawings,
    ui: state.ui,
  };
}

export async function userState(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  const user =
    getAuthenticatedUser(request);

  if (!user) {
    return json(401, {
      ok: false,
      error: "Authentication required.",
    });
  }

  try {
    if (request.method === "GET") {
      const stored =
        await userStateStore.get(
          user.userId,
        );

      return json(200, {
        ok: true,
        user: {
          userId: user.userId,
          identityProvider:
            user.identityProvider,
          userDetails:
            user.userDetails,
        },
        storageMode:
          userStateStore.mode,
        state: stored
          ? publicCloudState(stored.payload)
          : null,

        // updatedAt is the last user/device sync,
        // not the last background worker write.
        updatedAt:
          stored?.clientUpdatedAt ??
          null,

        serverUpdatedAt:
          stored?.updatedAt ??
          null,

        clientRevision:
          stored?.clientRevision ??
          null,

        serverRevision:
          stored?.serverRevision ??
          null,
      });
    }

    if (request.method === "PUT") {
      const payload =
        await request.json() as {
          state?: unknown;
          expectedClientRevision?: unknown;
          expectedServerRevision?: unknown;
        };

      const state =
        sanitizeUserCloudState(
          payload?.state ?? payload,
        );

      const entitlement =
        await getResolvedUserEntitlement(
          user.userId,
        );

      const violations =
        cloudStateViolations(
          {
            watchlistItems:
              state.watchlist.length,
            savedWorkspaces:
              state.workspaces.length,
            alerts:
              state.alerts.length,
            customIndicators:
              state.customIndicators.length,
            chartTemplates:
              state.chartTemplates.length,
          },
          entitlement,
        );

      if (violations.length > 0) {
        return json(403, {
          ok: false,
          code: "PLAN_LIMIT",
          error:
            "Cloud state exceeds the current MarketOS plan limits.",
          plan: entitlement.plan,
          limits:
            entitlement.definition.limits,
          violations,
        });
      }

      const expectedClientRevision =
        payload?.expectedClientRevision === null
          ? null
          : typeof payload
                ?.expectedClientRevision ===
              "number" &&
              Number.isFinite(
                payload
                  .expectedClientRevision,
              )
            ? Math.floor(
                payload
                  .expectedClientRevision,
              )
            : undefined;

      const expectedServerRevision =
        payload?.expectedServerRevision === null
          ? null
          : typeof payload
                ?.expectedServerRevision ===
              "number" &&
              Number.isFinite(
                payload
                  .expectedServerRevision,
              )
            ? Math.floor(
                payload
                  .expectedServerRevision,
              )
            : undefined;

      const existing =
        await userStateStore.get(
          user.userId,
        );

      const stored =
        await userStateStore.put(
          user.userId,
          {
            ...state,

            // Browser owns preferences.
            // Server owns alert delivery history + Push device registrations.
            alertEvents:
              existing?.payload
                .alertEvents ?? [],
            pushSubscriptions:
              existing?.payload
                .pushSubscriptions ?? [],
          },
          {
            expectedClientRevision,
            expectedServerRevision,
          },
        );

      return json(200, {
        ok: true,
        storageMode:
          userStateStore.mode,
        updatedAt:
          stored.clientUpdatedAt,
        serverUpdatedAt:
          stored.updatedAt,
        clientRevision:
          stored.clientRevision,
        serverRevision:
          stored.serverRevision,
        state: publicCloudState(
          stored.payload,
        ),
      });
    }

    if (
      request.method === "DELETE"
    ) {
      await userStateStore.delete(
        user.userId,
      );

      return json(200, {
        ok: true,
        storageMode:
          userStateStore.mode,
        deleted: true,
      });
    }

    return json(405, {
      ok: false,
      error: "Method not allowed.",
    });
  } catch (error) {
    if (
      error instanceof
      UserStateConflictError
    ) {
      return json(409, {
        ok: false,
        error: error.message,
        conflict: true,
        currentClientRevision:
          error.currentClientRevision,
        currentServerRevision:
          error.currentServerRevision,
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Cloud state operation failed.";

    return json(
      message.includes("payload")
        ? 400
        : 500,
      {
        ok: false,
        error: message,
      },
    );
  }
}

app.http("userState", {
  methods: [
    "GET",
    "PUT",
    "DELETE",
    "OPTIONS",
  ],
  authLevel: "anonymous",
  route: "user/state",
  handler: userState,
});
