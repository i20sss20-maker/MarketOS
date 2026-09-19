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

export function getMarketStatus(signal?: AbortSignal) {
  return fetchJson<MarketStatusResponse>("/market/status", signal);
}

export function searchMarketSymbols(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SearchResponse>(`/market/search?${params.toString()}`, signal);
}

export function getMarketCandles(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  limit = 260,
  signal?: AbortSignal,
) {
  const params = symbolQuery(symbol);
  params.set("timeframe", timeframe);
  params.set("limit", String(limit));
  return fetchJson<CandlesResponse>(`/market/candles?${params.toString()}`, signal);
}

export function getMarketQuote(symbol: MarketSymbol, signal?: AbortSignal) {
  const params = symbolQuery(symbol);
  return fetchJson<QuoteResponse>(`/market/quote?${params.toString()}`, signal);
}

export type MarketOverviewResponse = {
  ok: boolean;
  provider: string;
  generatedAt: number;
  requested: number;
  returned: number;
  items: MarketOverviewItem[];
};

export function getMarketOverview(symbols: MarketSymbol[], signal?: AbortSignal) {
  return postJson<MarketOverviewResponse>(
    "/market/overview",
    { symbols: symbols.slice(0, 25) },
    signal,
  );
}
