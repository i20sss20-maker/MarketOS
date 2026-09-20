import type { MarketDataProvider } from "@marketos/market-core";

export class ProductionGateError extends Error {
  constructor(readonly code: string, message: string, readonly status = 503) {
    super(message);
    this.name = "ProductionGateError";
  }
}

export function realDataRequired(env: NodeJS.ProcessEnv = process.env) {
  const environment = (env.MARKETOS_ENVIRONMENT ?? "").trim().toLowerCase();
  return environment === "production" || environment === "azure-production" ||
    env.MARKETOS_REQUIRE_REAL_DATA?.trim().toLowerCase() === "true";
}

export function assertRealProvider(provider: MarketDataProvider) {
  const status = provider.getStatus();
  if (status.mode !== "provider" || !status.configured || !status.supportsCandles ||
      !status.supportsQuotes || /demo/i.test(provider.id) || status.provider !== provider.id) {
    throw new ProductionGateError("REAL_DATA_REQUIRED", "A configured real market-data provider is required. Demo fallback is disabled.");
  }
}

export function forecastLedgerConfig(env: NodeJS.ProcessEnv = process.env) {
  const connectionString = env.COSMOS_CONNECTION_STRING?.trim();
  const databaseId = env.COSMOS_DATABASE?.trim() || "marketos";
  const containerId = env.FORECAST_JOURNAL_CONTAINER?.trim();
  if (env.FORECAST_JOURNAL_ENABLED?.trim().toLowerCase() !== "true" ||
      env.USER_DATA_PROVIDER?.trim().toLowerCase() !== "cosmos" ||
      !connectionString || !containerId || containerId === (env.COSMOS_CONTAINER?.trim() || "userState")) {
    throw new ProductionGateError("FORECAST_STORAGE_NOT_CONFIGURED", "The separate persistent forecast journal is not configured. No in-memory fallback is used.");
  }
  return { connectionString, databaseId, containerId };
}

// SWA must be the only ingress to this API. The principal header is NOT a JWT.
export function assertRequestOrigin(origin: string | null, env: NodeJS.ProcessEnv = process.env) {
  let configured: URL;
  try {
    configured = new URL(env.MARKETOS_WEB_ORIGIN?.trim() || "");
    if (configured.protocol !== "https:" || configured.username || configured.password ||
        configured.search || configured.hash || configured.pathname !== "/") throw new Error();
  } catch {
    throw new ProductionGateError("WEB_ORIGIN_NOT_CONFIGURED", "Configure the HTTPS MarketOS origin before enabling the server forecast journal.");
  }
  if (origin !== null && origin !== configured.origin) {
    throw new ProductionGateError("ORIGIN_REJECTED", "This request origin is not allowed.", 403);
  }
}
