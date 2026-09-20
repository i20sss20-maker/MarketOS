import type {
  AnalystForecastResponse,
  Timeframe,
} from "@marketos/market-core";
import type {
  AdvancedAlert,
} from "@marketos/alert-core";

export type ForecastWatchSide =
  | "bull"
  | "bear";

export type ForecastWatchSpec = {
  side: ForecastWatchSide;
  operator: "above" | "below";
  value: number;
  label: string;
  probability: number;
};

function tolerance(
  value: number,
) {
  return Math.max(
    Math.abs(value) *
      0.0001,
    0.000001,
  );
}

function scenarioProbability(
  forecast:
    AnalystForecastResponse,
  side:
    ForecastWatchSide,
) {
  return (
    forecast.scenarios.find(
      (scenario) =>
        scenario.id === side,
    )?.probability ?? 0
  );
}

export function buildForecastWatchSpec(
  forecast:
    AnalystForecastResponse,
  side:
    ForecastWatchSide,
): ForecastWatchSpec | null {
  const reference =
    forecast.referencePrice;

  if (
    !Number.isFinite(
      reference,
    ) ||
    reference <= 0
  ) {
    return null;
  }

  if (side === "bull") {
    const value =
      forecast.resistance;

    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      value <=
        reference +
          tolerance(reference)
    ) {
      return null;
    }

    return {
      side,
      operator: "above",
      value,
      label:
        "اختراق المقاومة",
      probability:
        scenarioProbability(
          forecast,
          side,
        ),
    };
  }

  const value =
    forecast.support;

  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value >=
      reference -
        tolerance(reference)
  ) {
    return null;
  }

  return {
    side,
    operator: "below",
    value,
    label:
      "كسر الدعم",
    probability:
      scenarioProbability(
        forecast,
        side,
      ),
  };
}

export function hasForecastWatchAlert(
  alerts: AdvancedAlert[],
  symbolId: string,
  timeframe: Timeframe,
  spec:
    ForecastWatchSpec,
) {
  const epsilon =
    tolerance(spec.value);

  return alerts.some(
    (alert) =>
      alert.enabled &&
      !alert.triggeredAt &&
      alert.symbol.id ===
        symbolId &&
      alert.timeframe ===
        timeframe &&
      alert.conditions.some(
        (condition) =>
          condition.type ===
            "numeric" &&
          condition.metric ===
            "price" &&
          condition.operator ===
            spec.operator &&
          Math.abs(
            condition.value -
              spec.value,
          ) <= epsilon,
      ),
  );
}
