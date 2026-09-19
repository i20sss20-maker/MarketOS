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

export type CompanyRelease = {
  id: string;
  symbol: string;
  name?: string;
  exchange?: string;
  micCode?: string;
  datetime: string;
  title: string;
  bodyText: string;
  languages: string[];
  source: string;
};

export type CompanyFeedResult = {
  provider: string;
  generatedAt: number;
  releases: CompanyRelease[];
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
      type: "trend" | "zone" | "fibonacci" | "measure";
      points: [
        { time: number; price: number },
        { time: number; price: number },
      ];
    }
  | {
      type: "text";
      point: { time: number; price: number };
      text: string;
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
  ema20?: number;
  ema50?: number;
  rsi14?: number;
  atr14?: number;
  atrPercent?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
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


export type MultiTimeframeTrend = "up" | "down" | "sideways";
export type MultiTimeframeAlignment = "up" | "down" | "sideways" | "mixed";

export type MultiTimeframeItem = {
  timeframe: Timeframe;
  trend: MultiTimeframeTrend;
  analysis: ChartAnalysisResponse;
};

export type MultiTimeframeFailure = {
  timeframe: Timeframe;
  error: string;
};

export type MultiTimeframeAnalysisResponse = {
  engine: string;
  generatedAt: number;
  symbol: string;
  requestedTimeframes: Timeframe[];
  items: MultiTimeframeItem[];
  failures: MultiTimeframeFailure[];
  alignment: MultiTimeframeAlignment;
  upCount: number;
  downCount: number;
  sidewaysCount: number;
  rangeLow: number;
  rangeHigh: number;
  summary: string;
  observations: string[];
};

export type AnalystForecastBias =
  | "bullish"
  | "bearish"
  | "neutral";

export type AnalystRiskLevel =
  | "low"
  | "medium"
  | "high";

export type AnalystMarketRegime =
  | "trend"
  | "range"
  | "volatile";

export type AnalystForecastScenario = {
  id: "bull" | "base" | "bear";
  label: string;
  probability: number;
  targetLow: number;
  targetHigh: number;
  trigger: string;
  invalidation: string;
  rationale: string[];
};

export type AnalystCatalyst = {
  kind: "event" | "release";
  title: string;
  date?: string;
  importance?: "low" | "medium" | "high";
  source: string;
};

export type AnalystForecastResponse = {
  engine: string;
  generatedAt: number;
  symbol: MarketSymbol;
  dataProvider: string;
  dataMode: "demo" | "provider";
  timeframes: Timeframe[];
  bias: AnalystForecastBias;
  confidence: number;
  risk: AnalystRiskLevel;
  regime: AnalystMarketRegime;
  horizon: string;
  referencePrice: number;
  support: number;
  resistance: number;
  expectedRangeLow: number;
  expectedRangeHigh: number;
  summary: string;
  scenarios: AnalystForecastScenario[];
  catalysts: AnalystCatalyst[];
  evidence: string[];
  uncertaintyNote: string;
};

