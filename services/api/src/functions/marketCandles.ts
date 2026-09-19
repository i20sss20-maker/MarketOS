import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import type { Timeframe } from "@marketos/market-core";
import { json, marketError } from "../http/responses.js";
import { marketSymbolFromRequest } from "../market/requestSymbol.js";
import { marketDataProvider } from "../providers/index.js";

const allowedTimeframes = new Set<Timeframe>([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
]);

export async function marketCandles(request: HttpRequest): Promise<HttpResponseInit> {
  try {
    const symbol = marketSymbolFromRequest(request);
    const requestedTimeframe = (request.query.get("timeframe") ?? "1h") as Timeframe;
    if (!allowedTimeframes.has(requestedTimeframe)) {
      return json(400, { ok: false, error: "Unsupported timeframe." });
    }

    const rawLimit = Number(request.query.get("limit") ?? "260");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 40), 5000) : 260;
    const candles = await marketDataProvider.getCandles(symbol, requestedTimeframe, limit);

    return json(200, {
      ok: true,
      provider: marketDataProvider.id,
      symbol,
      timeframe: requestedTimeframe,
      candles,
    });
  } catch (error) {
    return marketError(error);
  }
}

app.http("marketCandles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market/candles",
  handler: marketCandles,
});
