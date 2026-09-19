import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { marketDataProvider } from "../providers/index.js";

export async function health(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("MarketOS health check");

  return {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    jsonBody: {
      ok: true,
      service: "marketos-api",
      version: "0.2.0",
      mode: "market-data-v1",
      marketData: marketDataProvider.getStatus(),
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
