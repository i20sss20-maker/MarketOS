import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { marketDataPolicy } from "../production/marketDataPolicy.js";

export async function marketStatus(_request: HttpRequest): Promise<HttpResponseInit> {
  return json(200, {
    ok: true,
    ...marketDataProvider.getStatus(),
    dataPolicy: marketDataPolicy(),
  });
}

app.http("marketStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/status",
  handler: marketStatus,
});
