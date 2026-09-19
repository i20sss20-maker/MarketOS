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
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
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

export interface MarketDataProvider {
  searchSymbols(query: string): Promise<MarketSymbol[]>;
  getCandles(symbol: MarketSymbol, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]>;
}

export type ChartContext = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  visibleCandles: Candle[];
  indicators: string[];
  userDrawings: unknown[];
};
