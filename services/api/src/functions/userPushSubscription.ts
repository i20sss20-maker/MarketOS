import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { json, preflight } from "../http/responses.js";
import {
  getWebPushConfiguration,
  removePushSubscription,
  sanitizePushSubscriptions,
  upsertPushSubscription,
} from "../push/webPush.js";
import { userStateStore } from "../storage/index.js";
import type { UserCloudState } from "../storage/types.js";

function emptyState(): UserCloudState {
  return {
    version: 1,
    updatedAt: Date.now(),
    watchlist: [],
    workspaces: [],
    alerts: [],
    alertEvents: [],
    pushSubscriptions: [],
    chartSettings: null,
    customIndicators: [],
    ui: {},
  };
}

function validSubscription(value: unknown): value is {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
} {
  if (!value || typeof value !== "object") return false;
  const item = value as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: unknown;
  };
  const keys =
    item.keys && typeof item.keys === "object"
      ? item.keys as { p256dh?: unknown; auth?: unknown }
      : null;

  return (
    typeof item.endpoint === "string" &&
    item.endpoint.startsWith("https://") &&
    item.endpoint.length <= 2048 &&
    (item.expirationTime === null ||
      item.expirationTime === undefined ||
      (typeof item.expirationTime === "number" &&
        Number.isFinite(item.expirationTime))) &&
    Boolean(keys) &&
    typeof keys?.p256dh === "string" &&
    keys.p256dh.length > 0 &&
    keys.p256dh.length <= 512 &&
    typeof keys.auth === "string" &&
    keys.auth.length > 0 &&
    keys.auth.length <= 512
  );
}

export async function userPushSubscription(
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

  const configuration = getWebPushConfiguration();
  if (!configuration.enabled) {
    return json(503, {
      ok: false,
      error: "Web Push is not configured.",
    });
  }

  try {
    const stored = await userStateStore.get(user.userId);
    const current = stored?.payload ?? emptyState();

    if (request.method === "GET") {
      return json(200, {
        ok: true,
        configured: true,
        subscriptionCount: sanitizePushSubscriptions(
          current.pushSubscriptions,
        ).length,
      });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null) as
        | { subscription?: unknown }
        | null;

      if (!validSubscription(body?.subscription)) {
        return json(400, {
          ok: false,
          error: "Invalid push subscription.",
        });
      }

      const subscriptions = upsertPushSubscription(
        current.pushSubscriptions,
        body.subscription,
        request.headers.get("user-agent"),
      );

      await userStateStore.put(user.userId, {
        ...current,
        pushSubscriptions: subscriptions,
        updatedAt: Date.now(),
      });

      return json(200, {
        ok: true,
        configured: true,
        subscriptionCount: subscriptions.length,
      });
    }

    if (request.method === "DELETE") {
      const body = await request.json().catch(() => null) as
        | { endpoint?: unknown }
        | null;
      const endpoint =
        typeof body?.endpoint === "string"
          ? body.endpoint
          : "";

      if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
        return json(400, {
          ok: false,
          error: "Invalid push endpoint.",
        });
      }

      const subscriptions = removePushSubscription(
        current.pushSubscriptions,
        endpoint,
      );

      await userStateStore.put(user.userId, {
        ...current,
        pushSubscriptions: subscriptions,
        updatedAt: Date.now(),
      });

      return json(200, {
        ok: true,
        configured: true,
        subscriptionCount: subscriptions.length,
      });
    }

    return json(405, {
      ok: false,
      error: "Method not allowed.",
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Push subscription operation failed.",
    });
  }
}

app.http("userPushSubscription", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/push/subscription",
  handler: userPushSubscription,
});
