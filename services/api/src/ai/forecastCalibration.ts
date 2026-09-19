import type {
  AnalystForecastCalibration,
  Candle,
  Timeframe,
} from "@marketos/market-core";

type CalibrationInput = {
  timeframe: Timeframe;
  candles: Candle[];
  lookaheadBars?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentChange(from: number, to: number) {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

function rsiSignal(candles: Candle[], endIndex: number) {
  if (endIndex < 14) return 0;

  let gains = 0;
  let losses = 0;

  for (let index = endIndex - 13; index <= endIndex; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 1;

  const rs = (gains / 14) / (losses / 14);
  const rsi = 100 - 100 / (1 + rs);
  return clamp((rsi - 50) / 25, -1, 1);
}

function signalAt(candles: Candle[], endIndex: number) {
  if (endIndex < 49) return null;

  const close = candles[endIndex].close;
  const twenty = candles.slice(endIndex - 19, endIndex + 1);
  const fifty = candles.slice(endIndex - 49, endIndex + 1);

  const sma20 = average(twenty.map((item) => item.close));
  const sma50 = average(fifty.map((item) => item.close));

  const momentum = clamp(
    percentChange(twenty[0].close, close) / 5,
    -1,
    1,
  );
  const position = sma20 === 0
    ? 0
    : clamp(((close - sma20) / sma20 * 100) / 3, -1, 1);
  const trend = sma50 === 0
    ? 0
    : clamp(((sma20 - sma50) / sma50 * 100) / 3, -1, 1);

  return (
    momentum * 0.45 +
    position * 0.25 +
    rsiSignal(candles, endIndex) * 0.15 +
    trend * 0.15
  );
}

function outcomeThreshold(
  candles: Candle[],
  lookaheadBars: number,
) {
  const start = Math.max(1, candles.length - 90);
  const absoluteReturns: number[] = [];

  for (let index = start; index < candles.length; index += 1) {
    absoluteReturns.push(
      Math.abs(
        percentChange(
          candles[index - 1].close,
          candles[index].close,
        ),
      ),
    );
  }

  const oneBarMove = median(absoluteReturns);
  return clamp(
    oneBarMove * Math.sqrt(lookaheadBars) * 0.75,
    0.25,
    4,
  );
}

function roundedProbabilities(
  bull: number,
  base: number,
  bear: number,
) {
  const total = bull + base + bear;
  const bullProbability = Math.round((bull / total) * 100);
  const bearProbability = Math.round((bear / total) * 100);
  const baseProbability = 100 - bullProbability - bearProbability;

  return {
    bullProbability,
    baseProbability,
    bearProbability,
  };
}

export function buildForecastCalibration(
  input: CalibrationInput,
): AnalystForecastCalibration | null {
  const candles = [...input.candles]
    .filter(
      (item) =>
        Number.isFinite(item.time) &&
        Number.isFinite(item.close) &&
        item.close > 0,
    )
    .sort((a, b) => a.time - b.time)
    .slice(-500);

  const lookaheadBars = Math.max(
    2,
    Math.min(12, Math.floor(input.lookaheadBars ?? 5)),
  );

  if (candles.length < 90 + lookaheadBars) {
    return null;
  }

  const currentIndex = candles.length - 1;
  const currentSignal = signalAt(candles, currentIndex);

  if (currentSignal === null) {
    return null;
  }

  const threshold = outcomeThreshold(candles, lookaheadBars);
  const candidates: Array<{
    distance: number;
    forwardReturn: number;
  }> = [];

  for (
    let index = 55;
    index < candles.length - lookaheadBars;
    index += 1
  ) {
    const sampleSignal = signalAt(candles, index);
    if (sampleSignal === null) continue;

    candidates.push({
      distance: Math.abs(sampleSignal - currentSignal),
      forwardReturn: percentChange(
        candles[index].close,
        candles[index + lookaheadBars].close,
      ),
    });
  }

  if (candidates.length < 8) {
    return null;
  }

  const closeMatches = candidates
    .filter((item) => item.distance <= 0.28)
    .sort((a, b) => a.distance - b.distance);

  const selected = (
    closeMatches.length >= 12
      ? closeMatches
      : [...candidates].sort((a, b) => a.distance - b.distance)
  ).slice(0, 48);

  if (selected.length < 8) {
    return null;
  }

  let bull = 0;
  let base = 0;
  let bear = 0;

  for (const sample of selected) {
    if (sample.forwardReturn > threshold) bull += 1;
    else if (sample.forwardReturn < -threshold) bear += 1;
    else base += 1;
  }

  const probabilities = roundedProbabilities(
    bull + 2,
    base + 2,
    bear + 2,
  );

  const forwardReturns = selected.map((item) => item.forwardReturn);
  const averageDistance = average(selected.map((item) => item.distance));
  const similarityScore = Math.round(
    clamp(100 - averageDistance / 0.5 * 100, 0, 100),
  );

  const currentDirection =
    currentSignal >= 0.18
      ? "bull"
      : currentSignal <= -0.18
        ? "bear"
        : "base";

  const hits =
    currentDirection === "bull"
      ? bull
      : currentDirection === "bear"
        ? bear
        : base;

  const directionalHitRate = Math.round(
    (hits / selected.length) * 100,
  );

  const reliability =
    selected.length >= 30 && similarityScore >= 68
      ? "high"
      : selected.length >= 16 && similarityScore >= 48
        ? "medium"
        : "low";

  const blendWeight =
    reliability === "high"
      ? 0.42
      : reliability === "medium"
        ? 0.3
        : 0.18;

  return {
    method: "historical-analog",
    timeframe: input.timeframe,
    lookaheadBars,
    sampleSize: selected.length,
    comparableSamples: closeMatches.length,
    currentSignal: round(currentSignal, 3),
    outcomeThresholdPercent: round(threshold, 2),
    directionalHitRate,
    averageForwardReturn: round(average(forwardReturns), 2),
    medianForwardReturn: round(median(forwardReturns), 2),
    bullProbability: probabilities.bullProbability,
    baseProbability: probabilities.baseProbability,
    bearProbability: probabilities.bearProbability,
    similarityScore,
    reliability,
    blendWeight,
  };
}
