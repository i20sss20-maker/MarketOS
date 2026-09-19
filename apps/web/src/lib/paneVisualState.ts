import type { ChartView } from "../components/MarketChart";
import {
  normalizeChartSettings,
  type ChartSettings,
} from "./chartSettings";
import {
  defaultIndicators,
  type IndicatorId,
  type IndicatorSelection,
} from "./indicators";

export type AuxiliaryPaneId =
  | "secondary"
  | "third"
  | "fourth";

export type PaneVisualState = {
  chartView: ChartView;
  indicators: IndicatorSelection;
  chartSettings: ChartSettings;
};

const indicatorIds: IndicatorId[] = [
  "sma20",
  "ema20",
  "ema50",
  "bollinger20",
  "rsi14",
  "macd",
  "atr14",
  "stochastic14",
];

function validView(
  value: unknown,
): value is ChartView {
  return (
    value === "candles" ||
    value === "line" ||
    value === "area"
  );
}

function normalizeIndicators(
  value: unknown,
  fallback: IndicatorSelection,
): IndicatorSelection {
  const source =
    value &&
    typeof value === "object"
      ? value as Partial<IndicatorSelection>
      : {};

  return Object.fromEntries(
    indicatorIds.map((id) => [
      id,
      typeof source[id] === "boolean"
        ? source[id]
        : fallback[id] ??
          defaultIndicators[id],
    ]),
  ) as IndicatorSelection;
}

export function normalizePaneVisualState(
  value: unknown,
  fallback: PaneVisualState,
): PaneVisualState {
  const source =
    value &&
    typeof value === "object"
      ? value as Partial<PaneVisualState>
      : {};

  return {
    chartView:
      validView(source.chartView)
        ? source.chartView
        : fallback.chartView,
    indicators:
      normalizeIndicators(
        source.indicators,
        fallback.indicators,
      ),
    chartSettings:
      normalizeChartSettings(
        source.chartSettings ??
          fallback.chartSettings,
      ),
  };
}

export function paneVisualStorageKey(
  pane: AuxiliaryPaneId,
) {
  return `marketos:pane-${pane}-visual`;
}

export function loadPaneVisualState(
  pane: AuxiliaryPaneId,
  fallback: PaneVisualState,
): PaneVisualState {
  if (
    typeof window === "undefined"
  ) {
    return fallback;
  }

  try {
    const raw =
      window.localStorage.getItem(
        paneVisualStorageKey(pane),
      );

    if (!raw) return fallback;

    return normalizePaneVisualState(
      JSON.parse(raw),
      fallback,
    );
  } catch {
    return fallback;
  }
}

export function savePaneVisualState(
  pane: AuxiliaryPaneId,
  state: PaneVisualState,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      paneVisualStorageKey(pane),
      JSON.stringify(state),
    );
  } catch {
    // Ignore restricted storage.
  }
}
