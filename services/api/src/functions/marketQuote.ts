import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, marketError } from "../http/responses.js";
import { marketSymbolFromRequest } from "../market/requestSymbol.js";
import { marketDataProvider } from "../providers/index.js";
import { assertProductionMarketAccess, consumeProductionMarketDataQuota } from "../production/marketAccess.js";

export async function marketQuote(request: HttpRequest): Promise<HttpResponseInit> {
  try {
    const marketUser = assertProductionMarketAccess(request);
    await consumeProductionMarketDataQuota(marketUser);
    const symbol = marketSymbolFromRequest(request);
    const quote = await marketDataProvider.getQuote(symbol);

    return json(200, {
      ok: true,
      provider: marketDataProvider.id,
      symbol,
      quote,
    });
  } catch (error) {
    return marketError(error);
  }
}

app.http("marketQuote", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/quote",
  handler: marketQuote,
});
