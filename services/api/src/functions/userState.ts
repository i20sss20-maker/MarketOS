import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { json, preflight } from "../http/responses.js";
import { sanitizeUserCloudState } from "../storage/stateValidation.js";
import { userStateStore } from "../storage/index.js";

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
        updatedAt: stored?.updatedAt ?? null,
      });
    }

    if (request.method === "PUT") {
      const payload = await request.json() as {
        state?: unknown;
        expectedUpdatedAt?: unknown;
      };

      const state = sanitizeUserCloudState(
        payload?.state ?? payload,
      );

      const expectedUpdatedAt =
        typeof payload?.expectedUpdatedAt === "number" &&
        Number.isFinite(payload.expectedUpdatedAt)
          ? Math.floor(payload.expectedUpdatedAt)
          : null;

      const existing = await userStateStore.get(user.userId);

      if (
        expectedUpdatedAt !== null &&
        existing &&
        existing.updatedAt !== expectedUpdatedAt
      ) {
        return json(409, {
          ok: false,
          error: "Cloud state changed on another device. Refresh before uploading again.",
          conflict: true,
          currentUpdatedAt: existing.updatedAt,
        });
      }

      if (
        expectedUpdatedAt === null &&
        existing
      ) {
        return json(409, {
          ok: false,
          error: "A cloud copy already exists. Refresh it before replacing the stored state.",
          conflict: true,
          currentUpdatedAt: existing.updatedAt,
        });
      }

      const stored = await userStateStore.put(
        user.userId,
        state,
      );

      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        updatedAt: stored.updatedAt,
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
