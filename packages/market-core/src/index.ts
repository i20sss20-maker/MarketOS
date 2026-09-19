export type AssetClass =
  | "stock"
  | "index"
  | "etf"
  | "forex"
  | "future"
  | "crypto"
  | "commodity";

export type MarketSymbol = {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
  currency: string;
  providerSymbol?: string;
  micCode?: string;
  country?: string;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Quote = {
  symbol: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  percentChange?: number;
  volume?: number;
  currency?: string;
  timestamp: number;
  isMarketOpen?: boolean;
  isExtendedHours?: boolean;
  source: string;
};

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d"
  | "1w"
  | "1M";

export type MarketDataStatus = {
  provider: string;
  configured: boolean;
  mode: "demo" | "provider";
  supportsSearch: boolean;
  supportsQuotes: boolean;
  supportsCandles: boolean;
  message?: string;
};

export interface MarketDataProvider {
  readonly id: string;
  searchSymbols(query: string): Promise<MarketSymbol[]>;
  getCandles(symbol: MarketSymbol, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  getQuote(symbol: MarketSymbol): Promise<Quote>;
  getStatus(): MarketDataStatus;
}

export type ChartContext = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  visibleCandles: Candle[];
  indicators: string[];
  userDrawings: unknown[];
};
