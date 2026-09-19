import type { Candle, Quote, Timeframe } from "@marketos/market-core";

function seedFrom(text: string) {
  return [...text].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

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

export function createDemoCandles(symbol: string, timeframe: Timeframe, limit = 260): Candle[] {
  const seed = seedFrom(symbol);
  const points: Candle[] = [];
  const step = secondsByTimeframe[timeframe];
  const now = Math.floor(Date.now() / step) * step;
  const volatility =
    timeframe === "1m" || timeframe === "5m"
      ? 0.28
      : timeframe === "1d" || timeframe === "1w" || timeframe === "1M"
        ? 1.05
        : 0.62;
  let previousClose = 45 + (seed % 220);

  for (let index = limit - 1; index >= 0; index -= 1) {
    const waveIndex = limit - index;
    const time = now - index * step;
    const cycle = Math.sin((waveIndex + seed) / 9) * volatility;
    const drift = Math.cos((waveIndex + seed) / 27) * volatility * 0.55;
    const pulse = Math.sin((waveIndex + seed) / 3.7) * volatility * 0.25;
    const open = previousClose;
    const close = Math.max(1, open + cycle * 0.38 + drift * 0.26 + pulse * 0.18);
    const spread = Math.max(0.16, volatility * 0.7);
    const high = Math.max(open, close) + spread + Math.abs(Math.sin(waveIndex / 5)) * spread;
    const low = Math.max(0.01, Math.min(open, close) - spread - Math.abs(Math.cos(waveIndex / 6)) * spread);

    points.push({
      time,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Math.round(50_000 + Math.abs(Math.sin((waveIndex + seed) / 4)) * 450_000),
    });

    previousClose = close;
  }

  return points;
}

export function createDemoQuote(symbol: string, currency: string, candles: Candle[]): Quote {
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? current;
  const change = current.close - previous.close;
  const percentChange = previous.close === 0 ? 0 : (change / previous.close) * 100;

  return {
    symbol,
    price: current.close,
    open: current.open,
    high: current.high,
    low: current.low,
    previousClose: previous.close,
    change,
    percentChange,
    volume: current.volume,
    currency,
    timestamp: current.time,
    source: "web-demo-fallback",
  };
}

