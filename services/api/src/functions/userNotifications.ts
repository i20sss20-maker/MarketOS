import {
  app,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { json, preflight } from "../http/responses.js";
import { notificationStore } from "../notifications/index.js";

type NotificationActionBody = {
  action?: unknown;
  ids?: unknown;
};

function sanitizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 160)
    .slice(0, 100);
}

export async function userNotifications(
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
      const rawLimit = Number(
        request.query.get("limit") ?? "50",
      );
      const limit = Number.isFinite(rawLimit)
        ? Math.min(
            100,
            Math.max(1, Math.floor(rawLimit)),
          )
        : 50;

      const notifications =
        await notificationStore.list(
          user.userId,
          limit,
        );

      return json(200, {
        ok: true,
        storageMode: notificationStore.mode,
        notifications,
        unreadCount:
          notifications.filter(
            (item) => !item.readAt,
          ).length,
      });
    }

    if (request.method === "POST") {
      const body =
        await request.json() as NotificationActionBody;
      const action =
        typeof body.action === "string"
          ? body.action
          : "";

      if (action === "read-all") {
        await notificationStore.markAllRead(
          user.userId,
        );
      } else if (action === "read") {
        const ids = sanitizeIds(body.ids);
        if (ids.length === 0) {
          return json(400, {
            ok: false,
            error:
              "At least one notification id is required.",
          });
        }
        await notificationStore.markRead(
          user.userId,
          ids,
        );
      } else {
        return json(400, {
          ok: false,
          error: "Unsupported notification action.",
        });
      }

      const notifications =
        await notificationStore.list(
          user.userId,
          50,
        );

      return json(200, {
        ok: true,
        storageMode: notificationStore.mode,
        notifications,
        unreadCount:
          notifications.filter(
            (item) => !item.readAt,
          ).length,
      });
    }

    if (request.method === "DELETE") {
      await notificationStore.clear(user.userId);

      return json(200, {
        ok: true,
        storageMode: notificationStore.mode,
        notifications: [],
        unreadCount: 0,
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
          : "Notification operation failed.",
    });
  }
}

app.http("userNotifications", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/notifications",
  handler: userNotifications,
});
