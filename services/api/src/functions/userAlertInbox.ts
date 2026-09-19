import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import {
  markAlertInboxEventsRead,
  sanitizeAlertInboxEvents,
} from "../alerts/alertInbox.js";
import { json, preflight } from "../http/responses.js";
import { userStateStore } from "../storage/index.js";

type InboxAction =
  | "mark-read"
  | "mark-all-read"
  | "clear-read"
  | "clear-all";

function sanitizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 180))
    .slice(0, 100);
}

function responsePayload(events: ReturnType<typeof sanitizeAlertInboxEvents>) {
  return {
    events,
    unreadCount: events.filter((event) => !event.readAt).length,
  };
}

export async function userAlertInbox(
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
    const current = sanitizeAlertInboxEvents(
      stored?.payload.alertEvents,
    );

    if (request.method === "GET") {
      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        ...responsePayload(current),
      });
    }

    if (request.method !== "POST") {
      return json(405, {
        ok: false,
        error: "Method not allowed.",
      });
    }

    if (!stored) {
      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        ...responsePayload([]),
      });
    }

    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      ids?: unknown;
    };
    const action = body.action as InboxAction | undefined;

    let next = current;
    if (action === "mark-all-read") {
      next = markAlertInboxEventsRead(current);
    } else if (action === "mark-read") {
      const ids = sanitizeIds(body.ids);
      if (ids.length === 0) {
        return json(400, {
          ok: false,
          error: "At least one event id is required.",
        });
      }
      next = markAlertInboxEventsRead(current, ids);
    } else if (action === "clear-read") {
      next = current.filter((event) => !event.readAt);
    } else if (action === "clear-all") {
      next = [];
    } else {
      return json(400, {
        ok: false,
        error: "Invalid inbox action.",
      });
    }

    const saved = await userStateStore.put(user.userId, {
      ...stored.payload,
      alertEvents: next,
      updatedAt: Date.now(),
    });
    const events = sanitizeAlertInboxEvents(saved.payload.alertEvents);

    return json(200, {
      ok: true,
      storageMode: userStateStore.mode,
      ...responsePayload(events),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Alert inbox operation failed.",
    });
  }
}

app.http("userAlertInbox", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/alerts/inbox",
  handler: userAlertInbox,
});
