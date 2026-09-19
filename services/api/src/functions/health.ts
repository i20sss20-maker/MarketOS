import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { marketEventsProvider } from "../events/index.js";
import { json } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";

export async function health(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("MarketOS health check");

  const marketData = marketDataProvider.getStatus();
  const aiProvider = (process.env.AI_PROVIDER ?? "local-chart-engine").trim() || "local-chart-engine";
  const environment = (process.env.MARKETOS_ENVIRONMENT ?? "local").trim() || "local";
  const buildSha = (process.env.MARKETOS_BUILD_SHA ?? process.env.GITHUB_SHA ?? "dev").trim();

  return json(200, {
      ok: true,
      service: "marketos-api",
      version: "0.3.0",
      environment,
      buildSha: buildSha.slice(0, 12),
      generatedAt: Math.floor(Date.now() / 1000),
      marketData,
      marketEvents: {
        provider: marketEventsProvider.id,
        mode: marketEventsProvider.id.includes("demo") ? "demo" : "provider",
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
