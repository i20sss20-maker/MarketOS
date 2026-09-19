import type { CandlestickData, LineData, UTCTimestamp } from "lightweight-charts";
import type { Timeframe } from "@marketos/market-core";

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

export function createDemoCandles(symbol: string, timeframe: Timeframe): CandlestickData<UTCTimestamp>[] {
  const seed = seedFrom(symbol);
  const points: CandlestickData<UTCTimestamp>[] = [];
  const now = Math.floor(Date.now() / 1000);
  const step = secondsByTimeframe[timeframe];
  const volatility = timeframe === "1m" || timeframe === "5m" ? 0.28 : timeframe === "1d" || timeframe === "1w" ? 1.05 : 0.62;
  let previousClose = 45 + (seed % 220);

  for (let i = 220; i >= 0; i -= 1) {
    const time = (now - i * step) as UTCTimestamp;
    const cycle = Math.sin((i + seed) / 9) * volatility;
    const drift = Math.cos((i + seed) / 27) * volatility * 0.55;
    const pulse = Math.sin((i + seed) / 3.7) * volatility * 0.25;
    const open = previousClose;
    const close = Math.max(1, open + cycle * 0.38 + drift * 0.26 + pulse * 0.18);
    const spread = Math.max(0.16, volatility * 0.7);
    const high = Math.max(open, close) + spread + Math.abs(Math.sin(i / 5)) * spread;
    const low = Math.max(0.01, Math.min(open, close) - spread - Math.abs(Math.cos(i / 6)) * spread);

    points.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });

    previousClose = close;
  }

  return points;
}

export function createSma(
  candles: CandlestickData<UTCTimestamp>[],
  period: number,
): LineData<UTCTimestamp>[] {
  const output: LineData<UTCTimestamp>[] = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const average = window.reduce((sum, candle) => sum + candle.close, 0) / period;
    output.push({
      time: candles[index].time,
      value: Number(average.toFixed(2)),
    });
  }

  return output;
}
