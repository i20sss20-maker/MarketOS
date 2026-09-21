import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { realDataRequired } from "../production/policy.js";

export async function marketSnapshot(request: HttpRequest): Promise<HttpResponseInit> {
  if (realDataRequired()) {
    return json(410, {
      ok: false,
      code: "DEMO_DISABLED",
      error: "The demo snapshot endpoint is disabled in real-data mode.",
    });
  }

  const symbol = request.query.get("symbol") ?? "NASDAQ:AAPL";

  return {
    status: 200,
    jsonBody: {
      symbol,
      source: "demo",
      delayed: true,
      message: "Demo boundary only. A licensed market-data provider has not been selected yet.",
    },
  };
}

app.http("marketSnapshot", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/snapshot",
  handler: marketSnapshot,
});
