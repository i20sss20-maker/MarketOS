import { REQUIRE_REAL_DATA, assertProviderSource, assertQuoteData } from "./productionMode";
import type {
  Candle,
  MarketDataStatus,
  MarketOverviewItem,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type MarketStatusResponse = MarketDataStatus & { ok: boolean };
type SearchResponse = { ok: boolean; provider: string; symbols: MarketSymbol[] };
type CandlesResponse = {
  ok: boolean;
  provider: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  candles: Candle[];
};
type QuoteResponse = {
  ok: boolean;
  provider: string;
  symbol: MarketSymbol;
  quote: Quote;
};

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  const payload = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `MarketOS API request failed (${response.status}).`);
  }
  if (payload.error) throw new Error(payload.error);
  return payload;
}

async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const payload = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `MarketOS API request failed (${response.status}).`);
  }
  if (payload.error) throw new Error(payload.error);
  return payload;
}

function symbolQuery(symbol: MarketSymbol) {
  const params = new URLSearchParams({
    symbol: symbol.ticker,
    exchange: symbol.exchange,
    assetClass: symbol.assetClass,
    currency: symbol.currency,
    name: symbol.name,
  });

  if (symbol.providerSymbol) params.set("providerSymbol", symbol.providerSymbol);
  if (symbol.micCode) params.set("micCode", symbol.micCode);
  if (symbol.country) params.set("country", symbol.country);
  return params;
}

export async function getMarketStatus(signal?: AbortSignal) {
  const result = await fetchJson<MarketStatusResponse>("/market/status", signal);
  if (REQUIRE_REAL_DATA) {
    assertProviderSource(result.provider);
    if (!result.ok || result.mode !== "provider" || !result.configured) throw new Error("مزود البيانات الحقيقية غير مهيأ.");
  }
  return result;
}

export async function searchMarketSymbols(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  const result = await fetchJson<SearchResponse>(`/market/search?${params.toString()}`, signal);
  assertProviderSource(result.provider);
  return result;
}

export async function getMarketCandles(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  limit = 260,
  signal?: AbortSignal,
) {
  const params = symbolQuery(symbol);
  params.set("timeframe", timeframe);
  params.set("limit", String(limit));
  const result = await fetchJson<CandlesResponse>(`/market/candles?${params.toString()}`, signal);
  assertProviderSource(result.provider);
  if (REQUIRE_REAL_DATA) {
    if (!result.ok || result.timeframe !== timeframe || !Array.isArray(result.candles) || !result.candles.length ||
        result.candles.some((bar, index) => !Number.isSafeInteger(bar.time) || bar.time <= 0 || bar.time > Date.now()/1000 + 300 ||
          (index > 0 && bar.time <= result.candles[index - 1].time) ||
          ![bar.open,bar.high,bar.low,bar.close].every(v => Number.isFinite(v) && v > 0) ||
          bar.high < Math.max(bar.open,bar.low,bar.close) || bar.low > Math.min(bar.open,bar.high,bar.close))) {
      throw new Error("شموع المصدر غير صالحة؛ لم يتم توليد شموع بديلة.");
    }
  }
  return result;
}

export async function getMarketQuote(symbol: MarketSymbol, signal?: AbortSignal) {
  const params = symbolQuery(symbol);
  const result = await fetchJson<QuoteResponse>(`/market/quote?${params.toString()}`, signal);
  assertQuoteData(result.quote, result.provider);
  return result;
}

export type MarketOverviewResponse = {
  ok: boolean;
  provider: string;
  generatedAt: number;
  requested: number;
  returned: number;
  items: MarketOverviewItem[];
};

export async function getMarketOverview(symbols: MarketSymbol[], signal?: AbortSignal) {
  const result = await postJson<MarketOverviewResponse>(
    "/market/overview",
    { symbols: symbols.slice(0, 25) },
    signal,
  );
  assertProviderSource(result.provider);
  if (REQUIRE_REAL_DATA) {
    if (!Array.isArray(result.items)) throw new Error("لقطة السوق غير صالحة.");
    for (const item of result.items) assertQuoteData(item.quote, result.provider);
  }
  return result;
}
