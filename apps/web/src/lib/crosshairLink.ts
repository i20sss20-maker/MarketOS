import type { Candle } from "@marketos/market-core";

export type CrosshairPaneId =
  | "primary"
  | "secondary"
  | "third"
  | "fourth";

export type LinkedCrosshairPoint = {
  sourcePane: CrosshairPaneId;
  time: number;
};

export function nearestCandleByTime(
  candles: Candle[],
  targetTime: number,
): Candle | null {
  if (
    candles.length === 0 ||
    !Number.isFinite(targetTime)
  ) {
    return null;
  }

  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid =
      Math.floor((low + high) / 2);
    const time = candles[mid].time;

    if (time === targetTime) {
      return candles[mid];
    }

    if (time < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const before =
    high >= 0 ? candles[high] : null;
  const after =
    low < candles.length
      ? candles[low]
      : null;

  if (!before) return after;
  if (!after) return before;

  return (
    Math.abs(before.time - targetTime) <=
    Math.abs(after.time - targetTime)
      ? before
      : after
  );
}
