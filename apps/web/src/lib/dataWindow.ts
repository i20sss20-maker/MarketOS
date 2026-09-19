import { evaluateFormula } from "@marketos/formula-core";
import type { Candle } from "@marketos/market-core";
import type { CustomIndicatorDefinition } from "./customIndicators";
import type { IndicatorSelection } from "./indicators";
import {
  calculateAtr,
  calculateBollinger,
  calculateEma,
  calculateMacd,
  calculateRsi,
  calculateSma,
  calculateStochastic,
} from "./indicators";

export type DataWindowRow = {
  id: string;
  label: string;
  value: number | null;
  secondaryValue?: number | null;
  secondaryLabel?: string;
};

export type DataWindowSnapshot = {
  time: number;
  candle: Candle;
  rows: DataWindowRow[];
};

function valueAt(
  points: Array<{ time: number; value: number }>,
  time: number,
): number | null {
  const point = points.find((item) => item.time === time);
  return point?.value ?? null;
}

export function buildDataWindowSnapshot(
  candles: Candle[],
  time: number,
  indicators: IndicatorSelection,
  customIndicators: CustomIndicatorDefinition[] = [],
): DataWindowSnapshot | null {
  const candle = candles.find((item) => item.time === time);
  if (!candle) return null;

  const rows: DataWindowRow[] = [];

  if (indicators.sma20) {
    rows.push({
      id: "sma20",
      label: "SMA 20",
      value: valueAt(calculateSma(candles, 20), time),
    });
  }

  if (indicators.ema20) {
    rows.push({
      id: "ema20",
      label: "EMA 20",
      value: valueAt(calculateEma(candles, 20), time),
    });
  }

  if (indicators.ema50) {
    rows.push({
      id: "ema50",
      label: "EMA 50",
      value: valueAt(calculateEma(candles, 50), time),
    });
  }

  if (indicators.bollinger20) {
    const bands = calculateBollinger(candles, 20, 2);
    rows.push(
      {
        id: "bb-upper",
        label: "BB Upper",
        value: valueAt(bands.upper, time),
      },
      {
        id: "bb-middle",
        label: "BB Middle",
        value: valueAt(bands.middle, time),
      },
      {
        id: "bb-lower",
        label: "BB Lower",
        value: valueAt(bands.lower, time),
      },
    );
  }

  if (indicators.rsi14) {
    rows.push({
      id: "rsi14",
      label: "RSI 14",
      value: valueAt(calculateRsi(candles, 14), time),
    });
  }

  if (indicators.macd) {
    const macd = calculateMacd(candles);
    rows.push(
      {
        id: "macd",
        label: "MACD",
        value: valueAt(macd.macd, time),
        secondaryLabel: "Signal",
        secondaryValue: valueAt(macd.signal, time),
      },
      {
        id: "macd-hist",
        label: "MACD Hist",
        value: valueAt(macd.histogram, time),
      },
    );
  }

  if (indicators.atr14) {
    rows.push({
      id: "atr14",
      label: "ATR 14",
      value: valueAt(calculateAtr(candles, 14), time),
    });
  }

  if (indicators.stochastic14) {
    const stochastic = calculateStochastic(candles);
    rows.push({
      id: "stochastic",
      label: "Stochastic %K",
      value: valueAt(stochastic.k, time),
      secondaryLabel: "%D",
      secondaryValue: valueAt(stochastic.d, time),
    });
  }

  for (const definition of customIndicators.filter((item) => item.enabled)) {
    try {
      const points = evaluateFormula(candles, definition.formula);
      rows.push({
        id: `custom:${definition.id}`,
        label: definition.name,
        value: valueAt(points, time),
      });
    } catch {
      rows.push({
        id: `custom:${definition.id}`,
        label: definition.name,
        value: null,
      });
    }
  }

  return {
    time,
    candle,
    rows,
  };
}
