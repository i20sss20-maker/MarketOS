import type { Candle } from "@marketos/market-core";

export type ReplaySpeed =
  | "0.5x"
  | "1x"
  | "2x"
  | "4x"
  | "8x";

export const replaySpeeds: ReplaySpeed[] = [
  "0.5x",
  "1x",
  "2x",
  "4x",
  "8x",
];

const replayIntervals: Record<ReplaySpeed, number> = {
  "0.5x": 1200,
  "1x": 650,
  "2x": 360,
  "4x": 200,
  "8x": 120,
};

export function replayIntervalMs(
  speed: ReplaySpeed,
) {
  return replayIntervals[speed];
}

export function isReplaySpeed(
  value: unknown,
): value is ReplaySpeed {
  return replaySpeeds.includes(
    value as ReplaySpeed,
  );
}

export function clampReplayIndex(
  candlesLength: number,
  index: number,
  minimum = 20,
) {
  const max =
    Math.max(
      minimum,
      candlesLength - 1,
    );

  return Math.min(
    Math.max(
      minimum,
      Math.floor(index),
    ),
    max,
  );
}

export function defaultReplayStartIndex(
  candlesLength: number,
) {
  return clampReplayIndex(
    candlesLength,
    candlesLength - 60,
  );
}

export function replayPresetIndex(
  candlesLength: number,
  preset:
    | "25%"
    | "50%"
    | "75%"
    | "last-60",
) {
  if (preset === "last-60") {
    return defaultReplayStartIndex(
      candlesLength,
    );
  }

  const ratio =
    preset === "25%"
      ? 0.25
      : preset === "50%"
        ? 0.5
        : 0.75;

  return clampReplayIndex(
    candlesLength,
    Math.floor(
      (candlesLength - 1) *
        ratio,
    ),
  );
}

export type ReplaySessionStats = {
  startIndex: number;
  currentIndex: number;
  startPrice: number;
  currentPrice: number;
  movePercent: number;
  sessionHigh: number;
  sessionLow: number;
  rangePercent: number;
  revealedBars: number;
  remainingBars: number;
  progressPercent: number;
};

export function buildReplaySessionStats(
  candles: Candle[],
  startIndex: number,
  currentIndex: number,
): ReplaySessionStats | null {
  if (candles.length === 0) {
    return null;
  }

  const safeStart =
    clampReplayIndex(
      candles.length,
      startIndex,
    );

  const safeCurrent =
    Math.max(
      safeStart,
      clampReplayIndex(
        candles.length,
        currentIndex,
      ),
    );

  const start =
    candles[safeStart];
  const current =
    candles[safeCurrent];

  if (!start || !current) {
    return null;
  }

  const session =
    candles.slice(
      safeStart,
      safeCurrent + 1,
    );

  const sessionHigh =
    Math.max(
      ...session.map(
        (candle) => candle.high,
      ),
    );

  const sessionLow =
    Math.min(
      ...session.map(
        (candle) => candle.low,
      ),
    );

  const startPrice =
    start.close;
  const currentPrice =
    current.close;

  const movePercent =
    startPrice === 0
      ? 0
      : (
          (
            currentPrice -
            startPrice
          ) /
          startPrice
        ) * 100;

  const rangePercent =
    startPrice === 0
      ? 0
      : (
          (
            sessionHigh -
            sessionLow
          ) /
          startPrice
        ) * 100;

  const denominator =
    Math.max(
      1,
      candles.length -
        1 -
        safeStart,
    );

  const revealedBars =
    safeCurrent -
    safeStart;

  return {
    startIndex: safeStart,
    currentIndex: safeCurrent,
    startPrice,
    currentPrice,
    movePercent,
    sessionHigh,
    sessionLow,
    rangePercent,
    revealedBars,
    remainingBars:
      Math.max(
        0,
        candles.length -
          1 -
          safeCurrent,
      ),
    progressPercent:
      Math.min(
        100,
        Math.max(
          0,
          (
            revealedBars /
            denominator
          ) * 100,
        ),
      ),
  };
}
