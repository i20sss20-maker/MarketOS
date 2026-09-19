import type { Candle } from "@marketos/market-core";

export type IndicatorId =
  | "sma20"
  | "ema20"
  | "ema50"
  | "bollinger20"
  | "rsi14"
  | "macd"
  | "atr14"
  | "stochastic14";

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
  { id: "macd", name: "MACD", description: "12 · 26 · 9", pane: "oscillator" },
  { id: "atr14", name: "ATR 14", description: "Average True Range", pane: "oscillator" },
  { id: "stochastic14", name: "Stochastic", description: "14 · 3 · 3", pane: "oscillator" },
];

export const defaultIndicators: IndicatorSelection = {
  sma20: true,
  ema20: false,
  ema50: false,
  bollinger20: false,
  rsi14: false,
  macd: false,
  atr14: false,
  stochastic14: false,
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
      macd: parsed.macd ?? defaultIndicators.macd,
      atr14: parsed.atr14 ?? defaultIndicators.atr14,
      stochastic14: parsed.stochastic14 ?? defaultIndicators.stochastic14,
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

function emaValues(values: Array<{ time: number; value: number }>, period: number): IndicatorPoint[] {
  if (period <= 0 || values.length < period) return [];
  const seed = values.slice(0, period).reduce((sum, item) => sum + item.value, 0) / period;
  const multiplier = 2 / (period + 1);
  const output: IndicatorPoint[] = [{ time: values[period - 1].time, value: seed }];
  let previous = seed;

  for (let index = period; index < values.length; index += 1) {
    const value = (values[index].value - previous) * multiplier + previous;
    output.push({ time: values[index].time, value });
    previous = value;
  }
  return output;
}

export function calculateMacd(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  if (candles.length < slow + signal) {
    return {
      macd: [] as IndicatorPoint[],
      signal: [] as IndicatorPoint[],
      histogram: [] as IndicatorPoint[],
    };
  }

  const fastSeries = calculateEma(candles, fast);
  const slowSeries = calculateEma(candles, slow);
  const fastMap = new Map(fastSeries.map((point) => [point.time, point.value]));
  const macd: IndicatorPoint[] = [];

  for (const slowPoint of slowSeries) {
    const fastValue = fastMap.get(slowPoint.time);
    if (fastValue === undefined) continue;
    macd.push({ time: slowPoint.time, value: fastValue - slowPoint.value });
  }

  const signalSeries = emaValues(macd, signal);
  const signalMap = new Map(signalSeries.map((point) => [point.time, point.value]));
  const histogram = macd.flatMap((point) => {
    const signalValue = signalMap.get(point.time);
    if (signalValue === undefined) return [];
    return [{ time: point.time, value: point.value - signalValue }];
  });

  return { macd, signal: signalSeries, histogram };
}

export function calculateAtr(candles: Candle[], period = 14): IndicatorPoint[] {
  if (period <= 0 || candles.length <= period) return [];

  const trueRanges: Array<{ time: number; value: number }> = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    trueRanges.push({ time: current.time, value: trueRange });
  }

  if (trueRanges.length < period) return [];
  const output: IndicatorPoint[] = [];
  let atr = trueRanges.slice(0, period).reduce((sum, item) => sum + item.value, 0) / period;
  output.push({ time: trueRanges[period - 1].time, value: atr });

  for (let index = period; index < trueRanges.length; index += 1) {
    atr = ((atr * (period - 1)) + trueRanges[index].value) / period;
    output.push({ time: trueRanges[index].time, value: atr });
  }

  return output;
}

export function calculateStochastic(
  candles: Candle[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
) {
  if (candles.length < period + smoothK + smoothD) {
    return { k: [] as IndicatorPoint[], d: [] as IndicatorPoint[] };
  }

  const rawK: IndicatorPoint[] = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const lowest = Math.min(...window.map((candle) => candle.low));
    const highest = Math.max(...window.map((candle) => candle.high));
    const denominator = highest - lowest;
    const value = denominator === 0 ? 50 : ((candles[index].close - lowest) / denominator) * 100;
    rawK.push({ time: candles[index].time, value });
  }

  const smooth = (input: IndicatorPoint[], window: number): IndicatorPoint[] => {
    if (input.length < window) return [];
    const output: IndicatorPoint[] = [];
    for (let index = window - 1; index < input.length; index += 1) {
      const slice = input.slice(index - window + 1, index + 1);
      output.push({
        time: input[index].time,
        value: slice.reduce((sum, point) => sum + point.value, 0) / window,
      });
    }
    return output;
  };

  const k = smooth(rawK, smoothK);
  const d = smooth(k, smoothD);
  return { k, d };
}
