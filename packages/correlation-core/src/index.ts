import type { Candle } from "@marketos/market-core";

export type CorrelationSeries = {
  id: string;
  label: string;
  candles: Candle[];
};

export type CorrelationCell = {
  rowId: string;
  columnId: string;
  correlation: number | null;
  observations: number;
};

export type CorrelationPair = {
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
  correlation: number;
  observations: number;
};

export type CorrelationMatrixResult = {
  series: Array<{ id: string; label: string; observations: number }>;
  cells: CorrelationCell[];
  pairs: CorrelationPair[];
  strongestPositive?: CorrelationPair;
  strongestNegative?: CorrelationPair;
  averageAbsoluteCorrelation: number | null;
};

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function returnMap(candles: Candle[]) {
  const sorted = [...candles]
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.close) &&
      candle.close > 0,
    )
    .sort((a, b) => a.time - b.time);

  const map = new Map<number, number>();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.close <= 0 || current.close <= 0) continue;

    const value = Math.log(current.close / previous.close);
    if (Number.isFinite(value)) map.set(current.time, value);
  }

  return map;
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;

  const count = left.length;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / count;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / count;

  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;

  for (let index = 0; index < count; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }

  const varianceTolerance = 1e-20;
  if (
    leftSquares <= varianceTolerance ||
    rightSquares <= varianceTolerance
  ) {
    return null;
  }

  const denominator = Math.sqrt(leftSquares * rightSquares);
  if (!Number.isFinite(denominator) || denominator <= varianceTolerance) {
    return null;
  }

  return Math.max(-1, Math.min(1, numerator / denominator));
}

export function calculatePairCorrelation(
  leftCandles: Candle[],
  rightCandles: Candle[],
  minimumObservations = 8,
) {
  const leftReturns = returnMap(leftCandles);
  const rightReturns = returnMap(rightCandles);
  const times = [...leftReturns.keys()]
    .filter((time) => rightReturns.has(time))
    .sort((a, b) => a - b);

  if (times.length < minimumObservations) {
    return {
      correlation: null as number | null,
      observations: times.length,
    };
  }

  const left = times.map((time) => leftReturns.get(time) as number);
  const right = times.map((time) => rightReturns.get(time) as number);
  const correlation = pearson(left, right);

  return {
    correlation: correlation === null ? null : round(correlation),
    observations: times.length,
  };
}

export function calculateCorrelationMatrix(
  input: CorrelationSeries[],
  minimumObservations = 8,
): CorrelationMatrixResult {
  const unique = new Map<string, CorrelationSeries>();
  for (const series of input) {
    if (!series?.id || !series.label || !Array.isArray(series.candles)) continue;
    if (!unique.has(series.id)) unique.set(series.id, series);
  }

  const series = [...unique.values()].slice(0, 8);
  const returnsBySeries = new Map(
    series.map((item) => [item.id, returnMap(item.candles)]),
  );

  const cells: CorrelationCell[] = [];
  const pairs: CorrelationPair[] = [];

  for (let row = 0; row < series.length; row += 1) {
    for (let column = 0; column < series.length; column += 1) {
      const rowSeries = series[row];
      const columnSeries = series[column];

      if (rowSeries.id === columnSeries.id) {
        cells.push({
          rowId: rowSeries.id,
          columnId: columnSeries.id,
          correlation: 1,
          observations: returnsBySeries.get(rowSeries.id)?.size ?? 0,
        });
        continue;
      }

      const result = calculatePairCorrelation(
        rowSeries.candles,
        columnSeries.candles,
        minimumObservations,
      );

      cells.push({
        rowId: rowSeries.id,
        columnId: columnSeries.id,
        correlation: result.correlation,
        observations: result.observations,
      });

      if (column > row && result.correlation !== null) {
        pairs.push({
          leftId: rowSeries.id,
          rightId: columnSeries.id,
          leftLabel: rowSeries.label,
          rightLabel: columnSeries.label,
          correlation: result.correlation,
          observations: result.observations,
        });
      }
    }
  }

  const positivePairs = pairs
    .filter((pair) => pair.correlation >= 0)
    .sort((a, b) => b.correlation - a.correlation);

  const negativePairs = pairs
    .filter((pair) => pair.correlation < 0)
    .sort((a, b) => a.correlation - b.correlation);

  const averageAbsoluteCorrelation = pairs.length === 0
    ? null
    : round(
        pairs.reduce((sum, pair) => sum + Math.abs(pair.correlation), 0) /
          pairs.length,
      );

  return {
    series: series.map((item) => ({
      id: item.id,
      label: item.label,
      observations: returnsBySeries.get(item.id)?.size ?? 0,
    })),
    cells,
    pairs,
    strongestPositive: positivePairs[0],
    strongestNegative: negativePairs[0],
    averageAbsoluteCorrelation,
  };
}

export function correlationBand(value: number | null) {
  if (value === null) return "na";
  const magnitude = Math.abs(value);

  if (magnitude >= 0.8) return value >= 0 ? "positive-strong" : "negative-strong";
  if (magnitude >= 0.5) return value >= 0 ? "positive-medium" : "negative-medium";
  if (magnitude >= 0.25) return value >= 0 ? "positive-soft" : "negative-soft";
  return "neutral";
}

export function correlationDescription(value: number | null) {
  if (value === null) return "بيانات غير كافية";

  const magnitude = Math.abs(value);
  const direction = value >= 0 ? "موجب" : "سالب";

  if (magnitude >= 0.8) return `ارتباط ${direction} قوي جدًا`;
  if (magnitude >= 0.5) return `ارتباط ${direction} متوسط إلى قوي`;
  if (magnitude >= 0.25) return `ارتباط ${direction} ضعيف إلى متوسط`;
  return "ارتباط ضعيف";
}
