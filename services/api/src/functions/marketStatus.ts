import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";

export async function marketStatus(_request: HttpRequest): Promise<HttpResponseInit> {
  return json(200, {
    ok: true,
    ...marketDataProvider.getStatus(),
  });
}

app.http("marketStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/status",
  handler: marketStatus,
});
