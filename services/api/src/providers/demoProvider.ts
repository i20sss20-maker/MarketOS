import type {
  Candle,
  MarketDataProvider,
  MarketDataStatus,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";

const catalog: MarketSymbol[] = [
  { id: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:TSLA", ticker: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "XSAU:2222", ticker: "2222", name: "Saudi Aramco", exchange: "Saudi Exchange", micCode: "XSAU", assetClass: "stock", currency: "SAR", country: "Saudi Arabia" },
  { id: "XSAU:1120", ticker: "1120", name: "Al Rajhi Bank", exchange: "Saudi Exchange", micCode: "XSAU", assetClass: "stock", currency: "SAR", country: "Saudi Arabia" },
  { id: "FX:EURUSD", ticker: "EUR/USD", providerSymbol: "EUR/USD", name: "Euro / U.S. Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
  { id: "CRYPTO:BTCUSD", ticker: "BTC/USD", providerSymbol: "BTC/USD", name: "Bitcoin / U.S. Dollar", exchange: "Crypto", assetClass: "crypto", currency: "USD" },
  { id: "COMEX:GC", ticker: "GC", name: "Gold Futures", exchange: "COMEX", assetClass: "future", currency: "USD" },
];

const secondsByTimeframe: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
  "1w": 7 * 24 * 60 * 60,
  "1M": 30 * 24 * 60 * 60,
};

function seedFrom(text: string) {
  return [...text].reduce((sum, character) => sum + character.charCodeAt(0), 0);
}

function demoCandles(symbol: MarketSymbol, timeframe: Timeframe, limit = 260): Candle[] {
  const clampedLimit = Math.min(Math.max(limit, 40), 1000);
  const seed = seedFrom(symbol.id);
  const step = secondsByTimeframe[timeframe];
  const now = Math.floor(Date.now() / step) * step;
  const volatility =
    timeframe === "1m" || timeframe === "5m"
      ? 0.28
      : timeframe === "1d" || timeframe === "1w" || timeframe === "1M"
        ? 1.05
        : 0.62;

  let previousClose = symbol.currency === "SAR" ? 24 + (seed % 80) : 45 + (seed % 220);
  const output: Candle[] = [];

  for (let index = clampedLimit - 1; index >= 0; index -= 1) {
    const time = now - index * step;
    const waveIndex = clampedLimit - index;
    const cycle = Math.sin((waveIndex + seed) / 9) * volatility;
    const drift = Math.cos((waveIndex + seed) / 27) * volatility * 0.55;
    const pulse = Math.sin((waveIndex + seed) / 3.7) * volatility * 0.25;
    const open = previousClose;
    const close = Math.max(0.01, open + cycle * 0.38 + drift * 0.26 + pulse * 0.18);
    const spread = Math.max(0.06, volatility * 0.7);
    const high = Math.max(open, close) + spread + Math.abs(Math.sin(waveIndex / 5)) * spread;
    const low = Math.max(0.01, Math.min(open, close) - spread - Math.abs(Math.cos(waveIndex / 6)) * spread);

    output.push({
      time,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Math.round(50_000 + Math.abs(Math.sin((waveIndex + seed) / 4)) * 450_000),
    });
    previousClose = close;
  }

  return output;
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo";

  constructor(private readonly message = "Demo market data is active.") {}

  async searchSymbols(query: string): Promise<MarketSymbol[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter((symbol) =>
      [symbol.ticker, symbol.name, symbol.exchange, symbol.country ?? ""]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }

  async getCandles(symbol: MarketSymbol, timeframe: Timeframe, limit = 260): Promise<Candle[]> {
    return demoCandles(symbol, timeframe, limit);
  }

  async getQuote(symbol: MarketSymbol): Promise<Quote> {
    const candles = demoCandles(symbol, "1m", 2);
    const previous = candles[candles.length - 2];
    const current = candles[candles.length - 1];
    const change = current.close - previous.close;
    const percentChange = previous.close === 0 ? 0 : (change / previous.close) * 100;

    return {
      symbol: symbol.ticker,
      price: current.close,
      open: current.open,
      high: current.high,
      low: current.low,
      previousClose: previous.close,
      change,
      percentChange,
      volume: current.volume,
      currency: symbol.currency,
      timestamp: current.time,
      source: this.id,
    };
  }

  getStatus(): MarketDataStatus {
    return {
      provider: this.id,
      configured: true,
      mode: "demo",
      supportsSearch: true,
      supportsQuotes: true,
      supportsCandles: true,
      message: this.message,
    };
  }
}
