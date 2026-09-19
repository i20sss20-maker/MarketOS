import type { Candle } from "@marketos/market-core";

export type IndicatorId =
  | "sma20"
  | "ema20"
  | "ema50"
  | "bollinger20"
  | "rsi14";

export type IndicatorSelection = Record<IndicatorId, boolean>;

export type IndicatorPoint = {
  time: number;
  value: number;
};

export const indicatorCatalog: Array<{
  id: IndicatorId;
  name: string;
  description: string;
  pane: "price" | "oscillator";
}> = [
  { id: "sma20", name: "SMA 20", description: "Simple Moving Average", pane: "price" },
  { id: "ema20", name: "EMA 20", description: "Exponential Moving Average", pane: "price" },
  { id: "ema50", name: "EMA 50", description: "Medium trend", pane: "price" },
  { id: "bollinger20", name: "Bollinger 20", description: "20 periods · 2σ", pane: "price" },
  { id: "rsi14", name: "RSI 14", description: "Relative Strength Index", pane: "oscillator" },
];

export const defaultIndicators: IndicatorSelection = {
  sma20: true,
  ema20: false,
  ema50: false,
  bollinger20: false,
  rsi14: false,
};

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadIndicatorSelection(): IndicatorSelection {
  const storage = safeStorage();
  if (!storage) return defaultIndicators;

  try {
    const raw = storage.getItem("marketos:indicators");
    if (!raw) return defaultIndicators;
    const parsed = JSON.parse(raw) as Partial<IndicatorSelection>;
    return {
      sma20: parsed.sma20 ?? defaultIndicators.sma20,
      ema20: parsed.ema20 ?? defaultIndicators.ema20,
      ema50: parsed.ema50 ?? defaultIndicators.ema50,
      bollinger20: parsed.bollinger20 ?? defaultIndicators.bollinger20,
      rsi14: parsed.rsi14 ?? defaultIndicators.rsi14,
    };
  } catch {
    return defaultIndicators;
  }
}

export function saveIndicatorSelection(selection: IndicatorSelection) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem("marketos:indicators", JSON.stringify(selection));
  } catch {
    // Ignore storage restrictions.
  }
}

export function calculateSma(candles: Candle[], period: number): IndicatorPoint[] {
  if (period <= 0 || candles.length < period) return [];
  const output: IndicatorPoint[] = [];
  let rolling = 0;

  for (let index = 0; index < candles.length; index += 1) {
    rolling += candles[index].close;
    if (index >= period) rolling -= candles[index - period].close;
    if (index >= period - 1) {
      output.push({
        time: candles[index].time,
        value: rolling / period,
      });
    }
  }

  return output;
}

export function calculateEma(candles: Candle[], period: number): IndicatorPoint[] {
  if (period <= 0 || candles.length < period) return [];

  const seed = candles
    .slice(0, period)
    .reduce((sum, candle) => sum + candle.close, 0) / period;
  const multiplier = 2 / (period + 1);
  const output: IndicatorPoint[] = [{
    time: candles[period - 1].time,
    value: seed,
  }];

  let previous = seed;
  for (let index = period; index < candles.length; index += 1) {
    const value = (candles[index].close - previous) * multiplier + previous;
    output.push({ time: candles[index].time, value });
    previous = value;
  }

  return output;
}

export function calculateBollinger(candles: Candle[], period = 20, deviations = 2) {
  if (period <= 0 || candles.length < period) {
    return { upper: [] as IndicatorPoint[], middle: [] as IndicatorPoint[], lower: [] as IndicatorPoint[] };
  }

  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, candle) => sum + candle.close, 0) / period;
    const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * deviations;
    const time = candles[index].time;

    middle.push({ time, value: mean });
    upper.push({ time, value: mean + deviation });
    lower.push({ time, value: mean - deviation });
  }

  return { upper, middle, lower };
}

export function calculateRsi(candles: Candle[], period = 14): IndicatorPoint[] {
  if (period <= 0 || candles.length <= period) return [];

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const output: IndicatorPoint[] = [];

  const pushRsi = (index: number) => {
    const value =
      averageLoss === 0
        ? 100
        : 100 - 100 / (1 + averageGain / averageLoss);
    output.push({ time: candles[index].time, value });
  };

  pushRsi(period);

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    pushRsi(index);
  }

  return output;
}
