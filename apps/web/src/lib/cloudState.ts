export type AuthPrincipal = {
  userId: string;
  identityProvider: string;
  userDetails: string;
  userRoles: string[];
};

export type CloudStatePayload = {
  version: 1;
  updatedAt: number;
  watchlist: unknown[];
  workspaces: unknown[];
  alerts: unknown[];
  chartSettings: Record<string, unknown> | null;
  customIndicators: unknown[];
  drawings: Record<string, unknown[]>;
  ui: Record<string, unknown>;
};

export type CloudStateResponse = {
  ok: boolean;
  storageMode: "memory" | "cosmos";
  state: CloudStatePayload | null;
  updatedAt: number | null;
  clientRevision: number | null;
  serverRevision: number | null;
  user?: {
    userId: string;
    identityProvider: string;
    userDetails: string;
  };
};

const JSON_KEYS = {
  watchlist: "marketos:watchlist",
  workspaces: "marketos:workspaces",
  alerts: "marketos:alerts-v2",
  chartSettings: "marketos:chart-settings",
  customIndicators: "marketos:custom-indicators",
} as const;

const UI_KEYS = [
  "marketos:symbol",
  "marketos:symbol-object",
  "marketos:timeframe",
  "marketos:chart-view",
  "marketos:chart-layout",
  "marketos:chart-sync",
  "marketos:pane-secondary",
  "marketos:pane-secondary-timeframe",
  "marketos:pane-third",
  "marketos:pane-third-timeframe",
  "marketos:pane-fourth",
  "marketos:pane-fourth-timeframe",
  "marketos:ui-watchlist",
  "marketos:ui-ai",
  "marketos:watchlist-filter",
  "marketos:watchlist-sort",
  "marketos:auto-refresh",
  "marketos:indicators",
] as const;

function parseJson(raw: string | null, fallback: unknown) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

export async function getAuthPrincipal(): Promise<AuthPrincipal | null> {
  try {
    const response = await fetch("/.auth/me", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = await response.json() as {
      clientPrincipal?: AuthPrincipal | null;
    };

    const principal = payload.clientPrincipal;
    if (!principal?.userId) return null;
    if (!principal.userRoles?.includes("authenticated")) return null;
    return principal;
  } catch {
    return null;
  }
}

export function collectLocalCloudState(): CloudStatePayload {
  const storage = window.localStorage;

  const watchlist = parseJson(storage.getItem(JSON_KEYS.watchlist), []);
  const workspaces = parseJson(storage.getItem(JSON_KEYS.workspaces), []);
  const alerts = parseJson(storage.getItem(JSON_KEYS.alerts), []);
  const chartSettings = parseJson(storage.getItem(JSON_KEYS.chartSettings), null);
  const customIndicators = parseJson(
    storage.getItem(JSON_KEYS.customIndicators),
    [],
  );

  const drawings: Record<string, unknown[]> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith("marketos:drawings:")) continue;

    const symbolId =
      key.slice("marketos:drawings:".length);
    if (!symbolId) continue;

    const parsed = parseJson(
      storage.getItem(key),
      [],
    );
    if (Array.isArray(parsed)) {
      drawings[symbolId] = parsed;
    }
  }

  const ui: Record<string, unknown> = {};
  for (const key of UI_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) ui[key] = value;
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    watchlist: Array.isArray(watchlist) ? watchlist : [],
    workspaces: Array.isArray(workspaces) ? workspaces : [],
    alerts: Array.isArray(alerts) ? alerts : [],
    chartSettings:
      chartSettings && typeof chartSettings === "object" && !Array.isArray(chartSettings)
        ? chartSettings as Record<string, unknown>
        : null,
    customIndicators: Array.isArray(customIndicators) ? customIndicators : [],
    drawings,
    ui,
  };
}

export function applyCloudStateToLocal(state: CloudStatePayload) {
  const storage = window.localStorage;

  storage.setItem(JSON_KEYS.watchlist, JSON.stringify(state.watchlist));
  storage.setItem(JSON_KEYS.workspaces, JSON.stringify(state.workspaces));
  storage.setItem(JSON_KEYS.alerts, JSON.stringify(state.alerts));

  if (state.chartSettings) {
    storage.setItem(
      JSON_KEYS.chartSettings,
      JSON.stringify(state.chartSettings),
    );
  }

  storage.setItem(
    JSON_KEYS.customIndicators,
    JSON.stringify(state.customIndicators),
  );

  for (
    let index = storage.length - 1;
    index >= 0;
    index -= 1
  ) {
    const key = storage.key(index);
    if (key?.startsWith("marketos:drawings:")) {
      storage.removeItem(key);
    }
  }

  for (
    const [symbolId, drawings]
    of Object.entries(state.drawings ?? {})
  ) {
    storage.setItem(
      `marketos:drawings:${symbolId}`,
      JSON.stringify(drawings),
    );
  }

  for (const [key, value] of Object.entries(state.ui)) {
    if (!UI_KEYS.includes(key as typeof UI_KEYS[number])) continue;
    if (typeof value === "string") {
      storage.setItem(key, value);
    }
  }

  storage.setItem(
    "marketos:cloud-last-restore",
    String(Date.now()),
  );
}

async function cloudRequest<T>(
  method: "GET" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/user/state", {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as
    | ({ error?: string } & T)
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ??
      (response.status === 401
        ? "Authentication required."
        : `Cloud sync request failed (${response.status}).`),
    );
  }

  if (payload.error) throw new Error(payload.error);
  return payload;
}

export function getCloudState() {
  return cloudRequest<CloudStateResponse>("GET");
}

export function putCloudState(
  state: CloudStatePayload,
  expectedClientRevision: number | null,
  expectedServerRevision: number | null,
) {
  return cloudRequest<CloudStateResponse>("PUT", {
    state,
    expectedClientRevision,
    expectedServerRevision,
  });
}

export function deleteCloudState() {
  return cloudRequest<{ ok: boolean; deleted: boolean; storageMode: string }>(
    "DELETE",
  );
}
