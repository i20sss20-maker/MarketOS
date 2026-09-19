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
        state: stored
          ? {
              ...stored.payload,
              alertEvents: stored.payload.alertEvents ?? [],
            }
          : null,
        updatedAt: stored?.updatedAt ?? null,
      });
    }

    if (request.method === "PUT") {
      const payload = await request.json();
      const state = sanitizeUserCloudState(payload);
      const existing = await userStateStore.get(user.userId);
      const stored = await userStateStore.put(
        user.userId,
        {
          ...state,
          // The browser owns preferences; the server owns alert-delivery history.
          alertEvents: existing?.payload.alertEvents ?? [],
        },
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
