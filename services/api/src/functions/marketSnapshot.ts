import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";

export async function marketSnapshot(request: HttpRequest): Promise<HttpResponseInit> {
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
