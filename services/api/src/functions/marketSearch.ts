import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, marketError } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";

export async function marketSearch(request: HttpRequest): Promise<HttpResponseInit> {
  const query = request.query.get("q")?.trim() ?? "";
  if (!query) return json(400, { ok: false, error: "Missing search query." });

  try {
    const symbols = await marketDataProvider.searchSymbols(query);
    return json(200, {
      ok: true,
      provider: marketDataProvider.id,
      symbols,
    });
  } catch (error) {
    return marketError(error);
  }
}

app.http("marketSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/search",
  handler: marketSearch,
});
