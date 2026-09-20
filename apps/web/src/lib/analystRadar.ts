import type {
  AnalystForecastResponse,
  MarketSymbol,
} from "@marketos/market-core";

export type AnalystRadarDirection =
  | "bull"
  | "base"
  | "bear";

export type AnalystRadarItem = {
  symbol: MarketSymbol;
  forecast: AnalystForecastResponse;
  direction: AnalystRadarDirection;
  directionProbability: number;
  confidence: number;
  clarity: number;
  calibrated: boolean;
};

export type AnalystRadarFailure = {
  symbol: MarketSymbol;
  error: string;
};

export type AnalystRadarChange =
  | "new"
  | "strengthening"
  | "weakening"
  | "stable"
  | "reversal";

export type AnalystRadarDelta = {
  symbolId: string;
  change: AnalystRadarChange;
  previousDirection?: AnalystRadarDirection;
  currentDirection: AnalystRadarDirection;
  directionChanged: boolean;
  probabilityDelta: number;
  clarityDelta: number;
  confidenceDelta: number;
};

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

function topScenario(
  forecast:
    AnalystForecastResponse,
) {
  return [...forecast.scenarios]
    .sort(
      (a, b) =>
        b.probability -
        a.probability,
    )[0];
}

function secondProbability(
  forecast:
    AnalystForecastResponse,
) {
  const sorted =
    [...forecast.scenarios]
      .map(
        (item) =>
          item.probability,
      )
      .sort(
        (a, b) => b - a,
      );

  return sorted[1] ?? 0;
}

function calibrationBoost(
  forecast:
    AnalystForecastResponse,
) {
  const calibration =
    forecast.calibration;

  if (!calibration) {
    return 0;
  }

  if (
    calibration.reliability ===
    "high"
  ) {
    return 6;
  }

  if (
    calibration.reliability ===
    "medium"
  ) {
    return 3;
  }

  return 1;
}

function riskPenalty(
  forecast:
    AnalystForecastResponse,
) {
  if (
    forecast.risk === "high"
  ) {
    return 8;
  }

  if (
    forecast.risk === "medium"
  ) {
    return 3;
  }

  return 0;
}

export function analystRadarClarity(
  forecast:
    AnalystForecastResponse,
) {
  const top =
    topScenario(forecast);
  const edge =
    Math.max(
      0,
      top.probability -
        secondProbability(
          forecast,
        ),
    );
  const directionalPenalty =
    top.id === "base"
      ? 5
      : 0;

  return Math.round(
    clamp(
      forecast.confidence *
        0.45 +
        top.probability *
          0.35 +
        edge * 0.35 +
        calibrationBoost(
          forecast,
        ) -
        riskPenalty(
          forecast,
        ) -
        directionalPenalty +
        (
          forecast.dataMode ===
          "provider"
            ? 3
            : 0
        ),
      0,
      100,
    ),
  );
}

export function buildAnalystRadarItem(
  symbol: MarketSymbol,
  forecast:
    AnalystForecastResponse,
): AnalystRadarItem {
  const top =
    topScenario(forecast);

  return {
    symbol,
    forecast,
    direction: top.id,
    directionProbability:
      top.probability,
    confidence:
      forecast.confidence,
    clarity:
      analystRadarClarity(
        forecast,
      ),
    calibrated:
      Boolean(
        forecast.calibration,
      ),
  };
}

export function rankAnalystRadar(
  forecasts:
    AnalystRadarItem[],
) {
  return [...forecasts].sort(
    (a, b) => {
      if (
        b.clarity !==
        a.clarity
      ) {
        return (
          b.clarity -
          a.clarity
        );
      }

      if (
        b.directionProbability !==
        a.directionProbability
      ) {
        return (
          b.directionProbability -
          a.directionProbability
        );
      }

      return (
        b.confidence -
        a.confidence
      );
    },
  );
}

export function buildAnalystRadarDelta(
  current: AnalystRadarItem,
  previous?: AnalystRadarItem,
): AnalystRadarDelta {
  if (!previous) {
    return {
      symbolId:
        current.symbol.id,
      change: "new",
      currentDirection:
        current.direction,
      directionChanged: false,
      probabilityDelta: 0,
      clarityDelta: 0,
      confidenceDelta: 0,
    };
  }

  const directionChanged =
    previous.direction !==
    current.direction;
  const probabilityDelta =
    current.directionProbability -
    previous.directionProbability;
  const clarityDelta =
    current.clarity -
    previous.clarity;
  const confidenceDelta =
    current.confidence -
    previous.confidence;

  if (directionChanged) {
    return {
      symbolId:
        current.symbol.id,
      change: "reversal",
      previousDirection:
        previous.direction,
      currentDirection:
        current.direction,
      directionChanged: true,
      probabilityDelta,
      clarityDelta,
      confidenceDelta,
    };
  }

  const changeScore =
    clarityDelta +
    probabilityDelta * 0.5 +
    confidenceDelta * 0.25;

  return {
    symbolId:
      current.symbol.id,
    change:
      changeScore >= 3
        ? "strengthening"
        : changeScore <= -3
          ? "weakening"
          : "stable",
    previousDirection:
      previous.direction,
    currentDirection:
      current.direction,
    directionChanged: false,
    probabilityDelta,
    clarityDelta,
    confidenceDelta,
  };
}

export function buildAnalystRadarDeltas(
  current: AnalystRadarItem[],
  previous: AnalystRadarItem[],
) {
  const previousBySymbol =
    new Map(
      previous.map(
        (item) => [
          item.symbol.id,
          item,
        ],
      ),
    );

  return current.map(
    (item) =>
      buildAnalystRadarDelta(
        item,
        previousBySymbol.get(
          item.symbol.id,
        ),
      ),
  );
}

export function prepareRadarSymbols(
  active:
    MarketSymbol,
  watchlist:
    MarketSymbol[],
  limit = 5,
) {
  const unique =
    new Map<
      string,
      MarketSymbol
    >();

  unique.set(
    active.id,
    active,
  );

  for (
    const symbol
    of watchlist
  ) {
    if (
      unique.size >=
      limit
    ) {
      break;
    }

    unique.set(
      symbol.id,
      symbol,
    );
  }

  return [
    ...unique.values(),
  ].slice(
    0,
    Math.max(
      1,
      Math.min(limit, 8),
    ),
  );
}
