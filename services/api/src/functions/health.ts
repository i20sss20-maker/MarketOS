import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { marketEventsProvider } from "../events/index.js";
import { companyFeedProvider } from "../feed/index.js";
import { json } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { getWebPushConfiguration } from "../push/webPush.js";
import { userStateStore } from "../storage/index.js";
import { entitlementStore } from "../entitlements/index.js";
import { configuredForecastHardCap } from "../usage/forecastQuota.js";

export async function health(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("MarketOS health check");

  const marketData = marketDataProvider.getStatus();
  const aiProvider = (process.env.AI_PROVIDER ?? "local-chart-engine").trim() || "local-chart-engine";
  const environment = (process.env.MARKETOS_ENVIRONMENT ?? "local").trim() || "local";
  const buildSha = (process.env.MARKETOS_BUILD_SHA ?? process.env.GITHUB_SHA ?? "dev").trim();
  const webPush = getWebPushConfiguration();
  let forecastHardCap: number | null = null;
  try {
    forecastHardCap = configuredForecastHardCap();
  } catch {
    forecastHardCap = null;
  }

  return json(200, {
      ok: true,
      service: "marketos-api",
      version: "0.7.0",
      environment,
      buildSha: buildSha.slice(0, 12),
      generatedAt: Math.floor(Date.now() / 1000),
      marketData,
      marketEvents: {
        provider: marketEventsProvider.id,
        mode: marketEventsProvider.id.includes("demo") ? "demo" : "provider",
      },
      companyFeed: {
        provider: companyFeedProvider.id,
        mode: companyFeedProvider.id.includes("demo") ? "demo" : "provider",
      },
      userData: {
        provider: userStateStore.mode,
        persistent: userStateStore.mode === "cosmos",
      },
      forecastQuota: {
        configured: forecastHardCap !== null && entitlementStore.mode === "cosmos",
        hardCap: forecastHardCap,
        entitlementStorage: entitlementStore.mode,
        window: "utc-day",
      },
      backgroundAlerts: {
        enabled:
          (process.env.ALERT_WORKER_ENABLED ?? "")
            .trim()
            .toLowerCase() === "true",
        mode: "scheduled-worker",
      },
      webPush: {
        enabled: webPush.enabled,
        mode: "vapid",
      },
    ai: {
      provider: aiProvider,
      mode: aiProvider === "local-chart-engine" ? "local" : "provider",
    },
  });
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
