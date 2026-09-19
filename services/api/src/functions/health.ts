import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";

export async function health(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("MarketOS health check");

  return {
    status: 200,
    jsonBody: {
      ok: true,
      service: "marketos-api",
      version: "0.1.0",
      mode: "foundation",
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
