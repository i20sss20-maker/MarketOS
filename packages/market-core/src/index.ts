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

export type MarketOverviewItem = {
  symbol: MarketSymbol;
  quote: Quote;
};

export type MarketEventType =
  | "earnings"
  | "dividend"
  | "ipo"
  | "economic";

export type MarketEvent = {
  id: string;
  type: MarketEventType;
  date: string;
  time?: string;
  title: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  micCode?: string;
  country?: string;
  currency?: string;
  epsEstimate?: number;
  epsActual?: number;
  surprisePercent?: number;
  importance?: "low" | "medium" | "high";
  source: string;
};

export type MarketEventsResult = {
  provider: string;
  generatedAt: number;
  startDate: string;
  endDate: string;
  events: MarketEvent[];
  cached?: boolean;
};

export interface MarketDataProvider {
  readonly id: string;
  searchSymbols(query: string): Promise<MarketSymbol[]>;
  getCandles(symbol: MarketSymbol, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  getQuote(symbol: MarketSymbol): Promise<Quote>;
  getQuotes(symbols: MarketSymbol[]): Promise<MarketOverviewItem[]>;
  getStatus(): MarketDataStatus;
}

export type ChartDrawingContext =
  | {
      type: "horizontal";
      price: number;
    }
  | {
      type: "trend" | "zone" | "fibonacci";
      points: [
        { time: number; price: number },
        { time: number; price: number },
      ];
    };

export type ChartContext = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  visibleCandles: Candle[];
  quote?: Quote | null;
  indicators: string[];
  userDrawings: ChartDrawingContext[];
  prompt?: string;
};

export type ChartAnalysisMetrics = {
  lastPrice: number;
  change20: number;
  rangeLow20: number;
  rangeHigh20: number;
  sma20: number;
  distanceFromSma20: number;
  averageVolume20?: number;
  latestVolumeRatio?: number;
  realizedRangePercent20: number;
};

export type ChartAnalysisResponse = {
  engine: string;
  generatedAt: number;
  symbol: string;
  timeframe: Timeframe;
  summary: string;
  observations: string[];
  metrics: ChartAnalysisMetrics;
  activeIndicators: string[];
  drawingCount: number;
};
