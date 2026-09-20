import { guardMarketDataProvider } from "../production/providerGuard.js";
import type { MarketDataProvider } from "@marketos/market-core";
import { DemoMarketDataProvider } from "./demoProvider.js";
import { TwelveDataMarketDataProvider } from "./twelveDataProvider.js";

function createProvider(): MarketDataProvider {
  const requested = (process.env.MARKET_DATA_PROVIDER ?? "demo").trim().toLowerCase();

  if (requested === "twelvedata") {
    const apiKey = process.env.TWELVE_DATA_API_KEY ?? process.env.MARKET_DATA_API_KEY;
    if (apiKey) return new TwelveDataMarketDataProvider(apiKey);
    return new DemoMarketDataProvider(
      "Twelve Data was selected but no API key is configured, so MarketOS fell back to demo data.",
    );
  }

  if (requested !== "demo") {
    return new DemoMarketDataProvider(
      `Unknown provider "${requested}". MarketOS fell back to demo data.`,
    );
  }

  return new DemoMarketDataProvider();
}

export const marketDataProvider = guardMarketDataProvider(createProvider());
