export type ServerAlertTriggered = {
  alertId: string;
  symbol: string;
  timeframe: string;
  snapshot: unknown;
  conditions: unknown;
  triggeredAt?: number;
};

export type ServerAlertFailure = {
  symbol: string;
  timeframe: string;
  error: string;
};

export type ServerAlertCheckResponse = {
  ok: boolean;
  storageMode: "memory" | "cosmos";
  provider?: string;
  checkedGroups: number;
  totalAlerts?: number;
  triggered: ServerAlertTriggered[];
  failures: ServerAlertFailure[];
  capped?: boolean;
  message?: string;
};

export async function checkServerAlerts(): Promise<ServerAlertCheckResponse> {
  const response = await fetch("/api/user/alerts/check", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as
    | (ServerAlertCheckResponse & { error?: string })
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error ??
      (response.status === 401
        ? "Authentication required."
        : `Server alert check failed (${response.status}).`),
    );
  }

  return payload;
}
