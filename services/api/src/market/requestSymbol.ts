import type { AssetClass, MarketSymbol } from "@marketos/market-core";
import type { HttpRequest } from "@azure/functions";

const allowedAssetClasses = new Set<AssetClass>([
  "stock",
  "index",
  "etf",
  "forex",
  "future",
  "crypto",
  "commodity",
]);

export function marketSymbolFromRequest(request: HttpRequest): MarketSymbol {
  const ticker = request.query.get("symbol")?.trim();
  if (!ticker) throw new Error("Missing symbol.");

  const rawAssetClass = request.query.get("assetClass") as AssetClass | null;
  const assetClass = rawAssetClass && allowedAssetClasses.has(rawAssetClass)
    ? rawAssetClass
    : "stock";

  const exchange = request.query.get("exchange")?.trim() || "MARKET";
  const providerSymbol = request.query.get("providerSymbol")?.trim() || undefined;
  const micCode = request.query.get("micCode")?.trim() || undefined;
  const currency = request.query.get("currency")?.trim() || "";

  return {
    id: `${micCode || exchange}:${ticker}`,
    ticker,
    providerSymbol,
    name: request.query.get("name")?.trim() || ticker,
    exchange,
    micCode,
    country: request.query.get("country")?.trim() || undefined,
    assetClass,
    currency,
  };
}
