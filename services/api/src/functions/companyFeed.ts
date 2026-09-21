import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import type { AssetClass, MarketSymbol } from "@marketos/market-core";
import { companyFeedProvider } from "../feed/index.js";
import { json, marketError, preflight } from "../http/responses.js";
import { authorizeProductionMarketRequest } from "../production/marketAccess.js";

const assetClasses = new Set<AssetClass>([
  "stock",
  "index",
  "etf",
  "forex",
  "future",
  "crypto",
  "commodity",
]);

function sanitizeSymbol(value: unknown): MarketSymbol | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MarketSymbol>;

  if (
    typeof input.id !== "string" ||
    typeof input.ticker !== "string" ||
    typeof input.name !== "string" ||
    typeof input.exchange !== "string" ||
    typeof input.currency !== "string" ||
    typeof input.assetClass !== "string" ||
    !assetClasses.has(input.assetClass as AssetClass)
  ) {
    return null;
  }

  return {
    id: input.id.slice(0, 160),
    ticker: input.ticker.slice(0, 80),
    name: input.name.slice(0, 180),
    exchange: input.exchange.slice(0, 100),
    assetClass: input.assetClass as AssetClass,
    currency: input.currency.slice(0, 20),
    providerSymbol: typeof input.providerSymbol === "string"
      ? input.providerSymbol.slice(0, 100)
      : undefined,
    micCode: typeof input.micCode === "string"
      ? input.micCode.slice(0, 20)
      : undefined,
    country: typeof input.country === "string"
      ? input.country.slice(0, 80)
      : undefined,
  };
}

export async function companyFeed(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  try {
    await authorizeProductionMarketRequest(request, 2);
    const body = await request.json() as {
      symbols?: unknown;
      outputSize?: unknown;
    } | null;

    const symbols = Array.isArray(body?.symbols)
      ? body.symbols
          .slice(0, 8)
          .map(sanitizeSymbol)
          .filter((symbol): symbol is MarketSymbol => symbol !== null)
      : [];

    if (symbols.length === 0) {
      return json(400, {
        ok: false,
        error: "At least one valid symbol is required.",
      });
    }

    const requestedOutputSize = Number(body?.outputSize ?? 3);
    const outputSize = Number.isFinite(requestedOutputSize)
      ? Math.min(Math.max(Math.floor(requestedOutputSize), 1), 10)
      : 3;

    const releases = await companyFeedProvider.getFeed({
      symbols,
      outputSize,
    });

    return json(200, {
      ok: true,
      provider: companyFeedProvider.id,
      generatedAt: Math.floor(Date.now() / 1000),
      requestedSymbols: symbols.length,
      releases,
    });
  } catch (error) {
    return marketError(error);
  }
}

app.http("companyFeed", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "market/feed",
  handler: companyFeed,
});
