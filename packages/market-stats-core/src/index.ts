import type { Candle, Quote } from "@marketos/market-core";

export type PerformanceWindow = {
  bars: number;
  changePercent: number | null;
  high: number | null;
  low: number | null;
};

export type InstrumentStats = {
  lastPrice: number | null;
  previousClose: number | null;
  quoteChangePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  performance: PerformanceWindow[];
  sma20: number | null;
  sma50: number | null;
  distanceFromSma20Percent: number | null;
  distanceFromSma50Percent: number | null;
  atr14: number | null;
  atr14Percent: number | null;
  realizedVolatility20Percent: number | null;
  averageVolume20: number | null;
  latestVolumeRatio: number | null;
  rangePosition20Percent: number | null;
  upBars20: number;
  downBars20: number;
  unchangedBars20: number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentChange(from: number, to: number) {
  if (!finite(from) || !finite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

function simpleSma(candles: Candle[], period: number) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return slice.reduce((sum, candle) => sum + candle.close, 0) / period;
}

function atr(candles: Candle[], period: number) {
  if (candles.length <= period) return null;

  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  if (trueRanges.length < period) return null;
  let value =
    trueRanges.slice(0, period).reduce((sum, item) => sum + item, 0) /
    period;

  for (let index = period; index < trueRanges.length; index += 1) {
    value = ((value * (period - 1)) + trueRanges[index]) / period;
  }

  return value;
}

function realizedVolatility(
  candles: Candle[],
  period: number,
) {
  if (candles.length <= period) return null;

  const slice = candles.slice(-(period + 1));
  const returns: number[] = [];

  for (let index = 1; index < slice.length; index += 1) {
    const previous = slice[index - 1].close;
    const current = slice[index].close;
    if (previous <= 0 || current <= 0) continue;
    returns.push(Math.log(current / previous));
  }

  if (returns.length < 2) return null;

  const mean =
    returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) /
    (returns.length - 1);

  return Math.sqrt(Math.max(0, variance)) * 100;
}

function performanceWindow(
  candles: Candle[],
  bars: number,
): PerformanceWindow {
  if (candles.length <= bars) {
    return {
      bars,
      changePercent: null,
      high: null,
      low: null,
    };
  }

  const startIndex = candles.length - 1 - bars;
  const slice = candles.slice(startIndex);
  const first = candles[startIndex];
  const last = candles[candles.length - 1];

  return {
    bars,
    changePercent:
      percentChange(first.close, last.close) === null
        ? null
        : round(percentChange(first.close, last.close) as number),
    high: round(Math.max(...slice.map((candle) => candle.high))),
    low: round(Math.min(...slice.map((candle) => candle.low))),
  };
}

export function calculateInstrumentStats(
  candlesInput: Candle[],
  quote?: Quote | null,
): InstrumentStats {
  const candles = candlesInput
    .filter(
      (candle) =>
        finite(candle.time) &&
        finite(candle.open) &&
        finite(candle.high) &&
        finite(candle.low) &&
        finite(candle.close) &&
        candle.high >= candle.low,
    )
    .sort((a, b) => a.time - b.time);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const lastPrice = quote?.price ?? last?.close ?? null;
  const previousClose =
    quote?.previousClose ?? previous?.close ?? null;

  const sma20 = simpleSma(candles, 20);
  const sma50 = simpleSma(candles, 50);
  const atr14 = atr(candles, 14);

  const last20 = candles.slice(-20);
  const volumes = last20
    .map((candle) => candle.volume)
    .filter((value): value is number => finite(value));
  const averageVolume20 =
    volumes.length > 0
      ? volumes.reduce((sum, value) => sum + value, 0) /
        volumes.length
      : null;

  const latestVolume =
    quote?.volume ?? last?.volume ?? null;
  const latestVolumeRatio =
    averageVolume20 &&
    latestVolume !== null &&
    averageVolume20 > 0
      ? latestVolume / averageVolume20
      : null;

  const rangeHigh20 =
    last20.length > 0
      ? Math.max(...last20.map((candle) => candle.high))
      : null;
  const rangeLow20 =
    last20.length > 0
      ? Math.min(...last20.map((candle) => candle.low))
      : null;

  const rangePosition20Percent =
    lastPrice !== null &&
    rangeHigh20 !== null &&
    rangeLow20 !== null &&
    rangeHigh20 > rangeLow20
      ? ((lastPrice - rangeLow20) /
          (rangeHigh20 - rangeLow20)) *
        100
      : null;

  let upBars20 = 0;
  let downBars20 = 0;
  let unchangedBars20 = 0;
  for (const candle of last20) {
    if (candle.close > candle.open) upBars20 += 1;
    else if (candle.close < candle.open) downBars20 += 1;
    else unchangedBars20 += 1;
  }

  const quoteChangePercent =
    quote?.percentChange ??
    (lastPrice !== null && previousClose !== null
      ? percentChange(previousClose, lastPrice)
      : null);

  return {
    lastPrice:
      lastPrice === null ? null : round(lastPrice),
    previousClose:
      previousClose === null ? null : round(previousClose),
    quoteChangePercent:
      quoteChangePercent === null ||
      quoteChangePercent === undefined
        ? null
        : round(quoteChangePercent),
    open:
      quote?.open ?? last?.open ?? null,
    high:
      quote?.high ?? last?.high ?? null,
    low:
      quote?.low ?? last?.low ?? null,
    volume:
      quote?.volume ?? last?.volume ?? null,
    performance: [1, 5, 20, 50].map((bars) =>
      performanceWindow(candles, bars),
    ),
    sma20: sma20 === null ? null : round(sma20),
    sma50: sma50 === null ? null : round(sma50),
    distanceFromSma20Percent:
      sma20 !== null && lastPrice !== null
        ? round(percentChange(sma20, lastPrice) ?? 0)
        : null,
    distanceFromSma50Percent:
      sma50 !== null && lastPrice !== null
        ? round(percentChange(sma50, lastPrice) ?? 0)
        : null,
    atr14: atr14 === null ? null : round(atr14),
    atr14Percent:
      atr14 !== null && lastPrice !== null && lastPrice !== 0
        ? round((atr14 / lastPrice) * 100)
        : null,
    realizedVolatility20Percent:
      realizedVolatility(candles, 20) === null
        ? null
        : round(realizedVolatility(candles, 20) as number),
    averageVolume20:
      averageVolume20 === null
        ? null
        : round(averageVolume20, 2),
    latestVolumeRatio:
      latestVolumeRatio === null
        ? null
        : round(latestVolumeRatio),
    rangePosition20Percent:
      rangePosition20Percent === null
        ? null
        : round(
            Math.max(0, Math.min(100, rangePosition20Percent)),
            2,
          ),
    upBars20,
    downBars20,
    unchangedBars20,
  };
}
