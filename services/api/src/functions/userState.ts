import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { json, preflight } from "../http/responses.js";
import { sanitizeUserCloudState } from "../storage/stateValidation.js";
import { userStateStore } from "../storage/index.js";
import { UserStateConflictError } from "../storage/types.js";

export async function userState(
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
    if (request.method === "GET") {
      const stored = await userStateStore.get(user.userId);

      return json(200, {
        ok: true,
        user: {
          userId: user.userId,
          identityProvider: user.identityProvider,
          userDetails: user.userDetails,
        },
        storageMode: userStateStore.mode,
        state: stored?.payload ?? null,
        updatedAt: stored?.clientUpdatedAt ?? null,
        serverUpdatedAt: stored?.updatedAt ?? null,
        clientRevision: stored?.clientRevision ?? null,
        serverRevision: stored?.serverRevision ?? null,
      });
    }

    if (request.method === "PUT") {
      const payload = await request.json() as {
        state?: unknown;
        expectedClientRevision?: unknown;
        expectedServerRevision?: unknown;
      };

      const state = sanitizeUserCloudState(
        payload?.state ?? payload,
      );

      const expectedClientRevision =
        payload?.expectedClientRevision === null
          ? null
          : typeof payload?.expectedClientRevision === "number" &&
              Number.isFinite(payload.expectedClientRevision)
            ? Math.floor(payload.expectedClientRevision)
            : undefined;

      const expectedServerRevision =
        payload?.expectedServerRevision === null
          ? null
          : typeof payload?.expectedServerRevision === "number" &&
              Number.isFinite(payload.expectedServerRevision)
            ? Math.floor(payload.expectedServerRevision)
            : undefined;

      const stored = await userStateStore.put(
        user.userId,
        state,
        {
          expectedClientRevision,
          expectedServerRevision,
        },
      );

      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        updatedAt: stored.clientUpdatedAt,
        serverUpdatedAt: stored.updatedAt,
        clientRevision: stored.clientRevision,
        serverRevision: stored.serverRevision,
        state: stored.payload,
      });
    }

    if (request.method === "DELETE") {
      await userStateStore.delete(user.userId);

      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        deleted: true,
      });
    }

    return json(405, {
      ok: false,
      error: "Method not allowed.",
    });
  } catch (error) {
    if (error instanceof UserStateConflictError) {
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
      message.includes("payload") ? 400 : 500,
      {
        ok: false,
        error: message,
      },
    );
  }
}

app.http("userState", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/state",
  handler: userState,
});
