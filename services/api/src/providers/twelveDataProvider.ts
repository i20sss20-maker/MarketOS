import type {
  AssetClass,
  Candle,
  MarketDataProvider,
  MarketDataStatus,
  MarketOverviewItem,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import { AsyncTtlCache } from "./providerCache.js";

const API_BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_TTL_MS = 5 * 60_000;
const QUOTE_TTL_MS = 5_000;
const BATCH_QUOTE_TTL_MS = 5_000;

const intervalByTimeframe: Record<Timeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
  "1w": "1week",
  "1M": "1month",
};

const candleTtlByTimeframe: Record<Timeframe, number> = {
  "1m": 15_000,
  "5m": 30_000,
  "15m": 60_000,
  "1h": 2 * 60_000,
  "4h": 5 * 60_000,
  "1d": 10 * 60_000,
  "1w": 30 * 60_000,
  "1M": 60 * 60_000,
};

type ApiError = {
  status?: string;
  code?: number;
  message?: string;
};

type SearchItem = {
  symbol?: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  currency?: string;
  instrument_type?: string;
};

type SearchResponse = ApiError & {
  data?: SearchItem[];
};

type TimeSeriesValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type TimeSeriesResponse = ApiError & {
  values?: TimeSeriesValue[];
};

type QuoteResponse = ApiError & {
  symbol?: string;
  currency?: string;
  timestamp?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  is_market_open?: boolean;
  is_extended_hours?: boolean;
};

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assetClassFromInstrumentType(type = ""): AssetClass {
  const normalized = type.toLowerCase();
  if (normalized.includes("digital") || normalized.includes("crypto")) return "crypto";
  if (normalized.includes("physical currency") || normalized.includes("forex")) return "forex";
  if (normalized.includes("future")) return "future";
  if (normalized.includes("commodity")) return "commodity";
  if (normalized.includes("index")) return "index";
  if (normalized.includes("etf") || normalized.includes("exchange-traded fund")) return "etf";
  return "stock";
}

function timestampFromDateTime(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.includes("T")
    ? value
    : value.length === 10
      ? `${value}T00:00:00Z`
      : `${value.replace(" ", "T")}Z`;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) return undefined;
  return Math.floor(milliseconds / 1000);
}

function requestSymbol(symbol: MarketSymbol) {
  return symbol.providerSymbol ?? symbol.ticker;
}

function symbolCacheKey(symbol: MarketSymbol) {
  return [
    requestSymbol(symbol),
    symbol.micCode ?? "",
    symbol.exchange ?? "",
  ].join("|").toUpperCase();
}

function quoteFromPayload(payload: QuoteResponse, symbol: MarketSymbol, source: string): Quote {
  const price = numberOrUndefined(payload.close);
  if (price === undefined) {
    throw new Error(`Market data provider did not return a valid quote price for ${symbol.ticker}.`);
  }

  return {
    symbol: payload.symbol || symbol.ticker,
    price,
    open: numberOrUndefined(payload.open),
    high: numberOrUndefined(payload.high),
    low: numberOrUndefined(payload.low),
    previousClose: numberOrUndefined(payload.previous_close),
    change: numberOrUndefined(payload.change),
    percentChange: numberOrUndefined(payload.percent_change),
    volume: numberOrUndefined(payload.volume),
    currency: payload.currency || symbol.currency,
    timestamp: payload.timestamp ?? Math.floor(Date.now() / 1000),
    isMarketOpen: payload.is_market_open,
    isExtendedHours: payload.is_extended_hours,
    source,
  };
}

function normalizedSymbol(value: string) {
  return value.replace(/:[^:]+$/, "").replace(/\s+/g, "").toUpperCase();
}

export class TwelveDataMarketDataProvider implements MarketDataProvider {
  readonly id = "twelvedata";

  private readonly searchCache = new AsyncTtlCache<MarketSymbol[]>(120);
  private readonly candleCache = new AsyncTtlCache<Candle[]>(300);
  private readonly quoteCache = new AsyncTtlCache<Quote>(500);
  private readonly batchQuoteCache = new AsyncTtlCache<MarketOverviewItem[]>(120);

  constructor(private readonly apiKey: string) {}

  private async request<T extends ApiError>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, API_BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    url.searchParams.set("apikey", this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "MarketOS/0.2",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Market data provider request timed out.");
      }
      throw error;
    }

    let payload: T;
    try {
      payload = await response.json() as T;
    } catch {
      throw new Error(`Market data provider returned an invalid response (${response.status}).`);
    }

    if (!response.ok || payload.status === "error") {
      const providerMessage = payload.message?.trim();
      if (response.status === 429) {
        throw new Error(providerMessage || "Market data provider rate limit reached.");
      }
      throw new Error(providerMessage || `Market data provider request failed (${response.status}).`);
    }

    return payload;
  }

  async searchSymbols(query: string): Promise<MarketSymbol[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `search:${normalizedQuery}`;

    return this.searchCache.getOrLoad(cacheKey, SEARCH_TTL_MS, async () => {
      const payload = await this.request<SearchResponse>("/symbol_search", {
        symbol: query,
        outputsize: 12,
      });

      return (payload.data ?? [])
        .filter((item): item is SearchItem & { symbol: string } => Boolean(item.symbol))
        .map((item) => {
          const exchange = item.exchange || item.mic_code || "MARKET";
          return {
            id: `${item.mic_code || exchange}:${item.symbol}`,
            ticker: item.symbol,
            providerSymbol: item.symbol,
            name: item.instrument_name || item.symbol,
            exchange,
            micCode: item.mic_code,
            country: item.country,
            assetClass: assetClassFromInstrumentType(item.instrument_type),
            currency: item.currency || "",
          };
        });
    });
  }

  async getCandles(symbol: MarketSymbol, timeframe: Timeframe, limit = 260): Promise<Candle[]> {
    const boundedLimit = Math.min(Math.max(limit, 40), 5000);
    const cacheKey = `candles:${symbolCacheKey(symbol)}:${timeframe}:${boundedLimit}`;

    return this.candleCache.getOrLoad(
      cacheKey,
      candleTtlByTimeframe[timeframe],
      async () => {
        const payload = await this.request<TimeSeriesResponse>("/time_series", {
          symbol: requestSymbol(symbol),
          interval: intervalByTimeframe[timeframe],
          outputsize: boundedLimit,
          order: "asc",
          timezone: "UTC",
          mic_code: symbol.micCode,
          exchange: symbol.micCode ? undefined : symbol.exchange,
        });

        return (payload.values ?? []).flatMap((value) => {
          const time = timestampFromDateTime(value.datetime);
          const open = numberOrUndefined(value.open);
          const high = numberOrUndefined(value.high);
          const low = numberOrUndefined(value.low);
          const close = numberOrUndefined(value.close);

          if (
            time === undefined ||
            open === undefined ||
            high === undefined ||
            low === undefined ||
            close === undefined
          ) {
            return [];
          }

          const volume = numberOrUndefined(value.volume);
          return [{
            time,
            open,
            high,
            low,
            close,
            ...(volume === undefined ? {} : { volume }),
          }];
        });
      },
    );
  }

  async getQuote(symbol: MarketSymbol): Promise<Quote> {
    const cacheKey = `quote:${symbolCacheKey(symbol)}`;

    return this.quoteCache.getOrLoad(cacheKey, QUOTE_TTL_MS, async () => {
      const payload = await this.request<QuoteResponse>("/quote", {
        symbol: requestSymbol(symbol),
        mic_code: symbol.micCode,
        exchange: symbol.micCode ? undefined : symbol.exchange,
      });

      return quoteFromPayload(payload, symbol, this.id);
    });
  }

  async getQuotes(symbols: MarketSymbol[]): Promise<MarketOverviewItem[]> {
    const requested = symbols.slice(0, 25);
    if (requested.length === 0) return [];
    if (requested.length === 1) {
      return [{ symbol: requested[0], quote: await this.getQuote(requested[0]) }];
    }

    const cacheKey = `batch:${requested
      .map(symbolCacheKey)
      .sort()
      .join(",")}`;

    return this.batchQuoteCache.getOrLoad(
      cacheKey,
      BATCH_QUOTE_TTL_MS,
      async () => {
        const payload = await this.request<Record<string, QuoteResponse> & ApiError>("/quote", {
          symbol: requested.map(requestSymbol).join(","),
        });

        const entries = Object.entries(payload)
          .filter(([key, value]) =>
            key !== "status" &&
            key !== "code" &&
            key !== "message" &&
            value &&
            typeof value === "object",
          ) as Array<[string, QuoteResponse]>;

        const output: MarketOverviewItem[] = [];

        for (const symbol of requested) {
          const wanted = normalizedSymbol(requestSymbol(symbol));
          const match = entries.find(([key, value]) => {
            const responseSymbol = value.symbol ? normalizedSymbol(value.symbol) : "";
            return normalizedSymbol(key) === wanted || responseSymbol === wanted;
          });

          if (!match || match[1].status === "error") continue;

          try {
            const quote = quoteFromPayload(match[1], symbol, this.id);
            output.push({ symbol, quote });
            this.quoteCache.set(`quote:${symbolCacheKey(symbol)}`, quote, QUOTE_TTL_MS);
          } catch {
            // Keep partial batch results when one symbol has no accessible quote.
          }
        }

        return output;
      },
    );
  }

  getStatus(): MarketDataStatus {
    return {
      provider: this.id,
      configured: true,
      mode: "provider",
      supportsSearch: true,
      supportsQuotes: true,
      supportsCandles: true,
      message: "Twelve Data adapter is configured with server-side caching and request deduplication.",
    };
  }
}
