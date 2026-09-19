import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

function seedFrom(text: string) {
  return [...text].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function createDemoCandles(symbol: string): CandlestickData[] {
  const seed = seedFrom(symbol);
  const points: CandlestickData[] = [];
  const now = Math.floor(Date.now() / 1000);
  let previousClose = 90 + (seed % 140);

  for (let i = 160; i >= 0; i -= 1) {
    const time = (now - i * 60 * 60) as UTCTimestamp;
    const wave = Math.sin((i + seed) / 9) * 1.4;
    const drift = Math.cos((i + seed) / 21) * 0.7;
    const open = previousClose;
    const close = Math.max(1, open + wave * 0.32 + drift * 0.25);
    const high = Math.max(open, close) + 0.7 + Math.abs(Math.sin(i / 5));
    const low = Math.min(open, close) - 0.7 - Math.abs(Math.cos(i / 6));

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
