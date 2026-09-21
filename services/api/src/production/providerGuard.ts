import type { Candle, MarketDataProvider, Quote } from "@marketos/market-core";
import type { MarketEventsProvider } from "../events/types.js";
import type { CompanyFeedProvider } from "../feed/types.js";
import { assertRealProvider, ProductionGateError, realDataRequired } from "./policy.js";
import { marketDataPolicy } from "./marketDataPolicy.js";

function invalid() {
  return new ProductionGateError("INVALID_PROVIDER_DATA", "The provider returned invalid or unverified data. Synthetic data was not substituted.", 502);
}

export function validateProviderQuote(quote: Quote, providerId: string, now = Date.now() / 1000) {
  if (!Number.isFinite(quote.price) || quote.price <= 0 ||
      !Number.isSafeInteger(quote.timestamp) || quote.timestamp <= 0 || quote.timestamp > now + 300 ||
      quote.source !== providerId || !quote.symbol?.trim()) throw invalid();

  const policy = marketDataPolicy();
  if (realDataRequired() && (policy.timing === "realtime" || policy.timing === "delayed") &&
      quote.isMarketOpen !== false) {
    if (quote.timestampKind !== "last-quote") throw invalid();

    const allowedDelayMinutes = policy.timing === "realtime"
      ? 15
      : (policy.delayMinutes ?? 0) + 15;
    if (now - quote.timestamp > allowedDelayMinutes * 60) throw invalid();
  }

  return quote;
}

export function validateProviderCandles(candles: Candle[], now = Date.now() / 1000) {
  if (!Array.isArray(candles) || candles.length === 0) throw invalid();
  let previous = -Infinity;
  for (const bar of candles) {
    if (!Number.isSafeInteger(bar.time) || bar.time <= previous || bar.time <= 0 || bar.time > now + 300 ||
        ![bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0) ||
        bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high) ||
        (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))) throw invalid();
    previous = bar.time;
  }
  return candles;
}

// Lazy checks keep /health available even when production configuration is broken.
export function guardMarketDataProvider(provider: MarketDataProvider): MarketDataProvider {
  const check = () => { if (realDataRequired()) assertRealProvider(provider); };
  return {
    id: provider.id,
    getStatus: () => provider.getStatus(),
    searchSymbols: async query => { check(); return provider.searchSymbols(query); },
    getCandles: async (symbol, timeframe, limit) => {
      check();
      const result = await provider.getCandles(symbol, timeframe, limit);
      return realDataRequired() ? validateProviderCandles(result) : result;
    },
    getQuote: async symbol => {
      check();
      const result = await provider.getQuote(symbol);
      return realDataRequired() ? validateProviderQuote(result, provider.id) : result;
    },
    getQuotes: async symbols => {
      check();
      const result = await provider.getQuotes(symbols);
      if (realDataRequired()) result.forEach(item => validateProviderQuote(item.quote, provider.id));
      return result;
    },
  };
}

function assertRealSource(providerId: string, sources: string[]) {
  if (/demo/i.test(providerId) || sources.some(source => !source || /demo/i.test(source))) {
    throw new ProductionGateError("REAL_CONTEXT_REQUIRED", "Demo news and events are disabled in real-data mode.");
  }
}

export function guardEventsProvider(provider: MarketEventsProvider): MarketEventsProvider {
  return { id: provider.id, async getEvents(query) {
    if (realDataRequired()) assertRealSource(provider.id, []);
    const items = await provider.getEvents(query);
    if (realDataRequired()) assertRealSource(provider.id, items.map(item => item.source));
    return items;
  } };
}

export function guardFeedProvider(provider: CompanyFeedProvider): CompanyFeedProvider {
  return { id: provider.id, async getFeed(query) {
    if (realDataRequired()) assertRealSource(provider.id, []);
    const items = await provider.getFeed(query);
    if (realDataRequired()) assertRealSource(provider.id, items.map(item => item.source));
    return items;
  } };
}
