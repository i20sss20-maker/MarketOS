export type SystemHealth = {
  ok: boolean;
  service: string;
  version: string;
  environment: string;
  buildSha: string;
  generatedAt: number;
  marketData: {
    provider: string;
    configured: boolean;
    mode: "demo" | "provider";
    supportsSearch: boolean;
    supportsQuotes: boolean;
    supportsCandles: boolean;
    dataPolicy?: {
      timing:
        | "realtime"
        | "delayed"
        | "end-of-day"
        | "unknown";
      delayMinutes?: number;
      usageScope:
        | "personal"
        | "commercial"
        | "unknown";
      rightsConfirmed: boolean;
      rightsConfirmedAt?: string;
      rightsExpiresAt?: string;
      configured: boolean;
    };
    message?: string;
  };
  marketEvents: {
    provider: string;
    mode: "demo" | "provider";
  };
  companyFeed: {
    provider: string;
    mode: "demo" | "provider";
  };
  ai: {
    provider: string;
    mode: "local" | "provider";
  };
  userData: {
    provider: "memory" | "cosmos";
    persistent: boolean;
  };
  operations: {
    metricAlertsConfigured: boolean;
    costBudgetConfigured: boolean;
    configured: boolean;
  };
  marketDataQuota: {
    configured: boolean;
    hardCap: number | null;
    window: "utc-day";
    unit: "planned-provider-request";
  };
  forecastQuota: {
    configured: boolean;
    hardCap: number | null;
    entitlementStorage: "memory" | "cosmos";
    window: "utc-day";
  };
  backgroundAlerts: {
    enabled: boolean;
    mode: "scheduled-worker";
  };
  webPush: {
    enabled: boolean;
    mode: "vapid";
  };
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export async function getSystemHealth(signal?: AbortSignal): Promise<SystemHealth> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    headers: { Accept: "application/json" },
    signal,
  });

  const payload = await response.json().catch(() => null) as SystemHealth | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(`MarketOS health request failed (${response.status}).`);
  }
  return payload;
}


export type ProductionReadiness = {
  ok: boolean;
  scope: "configuration-only";
  productionReady: false;
  configured: boolean;
  blockers: string[];
  requiredAcceptanceChecks: string[];
};

export async function getProductionReadiness(
  signal?: AbortSignal,
): Promise<ProductionReadiness> {
  const response = await fetch(
    `${API_BASE_URL}/production/readiness`,
    {
      headers: {
        Accept: "application/json",
      },
      signal,
    },
  );

  const payload =
    await response
      .json()
      .catch(() => null) as
      ProductionReadiness |
      null;

  if (
    !payload ||
    typeof payload.configured !==
      "boolean" ||
    !Array.isArray(
      payload.blockers,
    ) ||
    !Array.isArray(
      payload.requiredAcceptanceChecks,
    )
  ) {
    throw new Error(
      `MarketOS readiness request failed (${response.status}).`,
    );
  }

  // HTTP 503 is an expected configuration-blocked state, not a transport error.
  if (
    !response.ok &&
    response.status !== 503
  ) {
    throw new Error(
      `MarketOS readiness request failed (${response.status}).`,
    );
  }

  return payload;
}
