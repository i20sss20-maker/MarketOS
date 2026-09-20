import { guardFeedProvider } from "../production/providerGuard.js";
import type { CompanyFeedProvider } from "./types.js";
import { DemoFeedProvider } from "./demoFeedProvider.js";
import { TwelveDataFeedProvider } from "./twelveDataFeedProvider.js";

function createCompanyFeedProvider(): CompanyFeedProvider {
  const requested = (process.env.MARKET_FEED_PROVIDER ?? "demo")
    .trim()
    .toLowerCase();

  if (requested === "twelvedata") {
    const apiKey = process.env.TWELVE_DATA_API_KEY ?? process.env.MARKET_DATA_API_KEY;
    if (apiKey) return new TwelveDataFeedProvider(apiKey);
  }

  return new DemoFeedProvider();
}

export const companyFeedProvider = guardFeedProvider(createCompanyFeedProvider());
