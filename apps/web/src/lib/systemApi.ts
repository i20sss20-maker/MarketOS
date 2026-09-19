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
