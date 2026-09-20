import { guardEventsProvider } from "../production/providerGuard.js";
import type { MarketEventsProvider } from "./types.js";
import { DemoEventsProvider } from "./demoEventsProvider.js";
import { TwelveDataEventsProvider } from "./twelveDataEventsProvider.js";

function createEventsProvider(): MarketEventsProvider {
  const requested = (process.env.MARKET_EVENTS_PROVIDER ?? "demo").trim().toLowerCase();

  if (requested === "twelvedata") {
    const apiKey = process.env.TWELVE_DATA_API_KEY ?? process.env.MARKET_DATA_API_KEY;
    if (apiKey) return new TwelveDataEventsProvider(apiKey);
  }

  return new DemoEventsProvider();
}

export const marketEventsProvider = guardEventsProvider(createEventsProvider());
