import type { MarketSymbol, Timeframe } from "@marketos/market-core";

export type AlertInboxEvent = {
  id: string;
  alertId: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  triggeredAt: number;
  snapshot?: unknown;
  conditions?: unknown;
  source: "manual-cloud" | "background";
  readAt?: number;
};

export type AlertInboxResponse = {
  ok: boolean;
  storageMode: "memory" | "cosmos";
  events: AlertInboxEvent[];
  unreadCount: number;
};

async function requestInbox(
  method: "GET" | "POST",
  body?: unknown,
): Promise<AlertInboxResponse> {
  const response = await fetch("/api/user/alerts/inbox", {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as
    | (AlertInboxResponse & { error?: string })
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error ??
      (response.status === 401
        ? "Authentication required."
        : `Alert inbox request failed (${response.status}).`),
    );
  }

  return payload;
}

export function getAlertInbox() {
  return requestInbox("GET");
}

export function updateAlertInbox(
  action: "mark-read" | "mark-all-read" | "clear-read" | "clear-all",
  ids?: string[],
) {
  return requestInbox("POST", {
    action,
    ...(ids ? { ids } : {}),
  });
}
