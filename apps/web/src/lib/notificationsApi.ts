export type MarketNotification = {
  id: string;
  userId: string;
  kind: "alert-triggered" | "system";
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  alertId?: string;
  symbol?: string;
  timeframe?: string;
};

export type NotificationListResponse = {
  ok: boolean;
  storageMode: "memory" | "cosmos";
  notifications: MarketNotification[];
  unreadCount: number;
};

async function requestNotifications(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<NotificationListResponse> {
  const response = await fetch("/api/user/notifications", {
    method,
    headers: {
      Accept: "application/json",
      ...(body
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body
      ? JSON.stringify(body)
      : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as
    | (NotificationListResponse & { error?: string })
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error ??
      (response.status === 401
        ? "Authentication required."
        : `Notification request failed (${response.status}).`),
    );
  }

  return payload;
}

export function getNotifications() {
  return requestNotifications("GET");
}

export function markNotificationsRead(
  ids: string[],
) {
  return requestNotifications("POST", {
    action: "read",
    ids: ids.slice(0, 100),
  });
}

export function markAllNotificationsRead() {
  return requestNotifications("POST", {
    action: "read-all",
  });
}

export function clearNotifications() {
  return requestNotifications("DELETE");
}
