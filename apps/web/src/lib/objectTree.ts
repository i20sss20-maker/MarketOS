import type { MarketSymbol } from "@marketos/market-core";
import type { ChartDrawing } from "./drawings";
import type {
  CustomIndicatorDefinition,
} from "./customIndicators";
import type {
  IndicatorSelection,
} from "./indicators";

export type ObjectTreeSummary = {
  comparisonCount: number;
  builtInEnabled: number;
  customEnabled: number;
  drawingCount: number;
  hiddenDrawings: number;
  lockedDrawings: number;
  totalObjects: number;
};

export function normalizeObjectQuery(
  value: string,
) {
  return value
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function objectMatchesQuery(
  query: string,
  ...fields: Array<string | undefined>
) {
  const needle =
    normalizeObjectQuery(query);

  if (!needle) return true;

  const haystack =
    normalizeObjectQuery(
      fields.filter(Boolean).join(" "),
    );

  if (!haystack) return false;

  return needle
    .split(" ")
    .filter(Boolean)
    .every(
      (token) =>
        haystack.includes(token),
    );
}

export function buildObjectTreeSummary(
  indicators: IndicatorSelection,
  customIndicators:
    CustomIndicatorDefinition[],
  drawings: ChartDrawing[],
  comparisonSymbol:
    MarketSymbol | null,
): ObjectTreeSummary {
  const builtInEnabled =
    Object.values(indicators)
      .filter(Boolean)
      .length;

  const customEnabled =
    customIndicators.filter(
      (indicator) =>
        indicator.enabled,
    ).length;

  const hiddenDrawings =
    drawings.filter(
      (drawing) =>
        drawing.hidden,
    ).length;

  const lockedDrawings =
    drawings.filter(
      (drawing) =>
        drawing.locked,
    ).length;

  const comparisonCount =
    comparisonSymbol ? 1 : 0;

  return {
    comparisonCount,
    builtInEnabled,
    customEnabled,
    drawingCount: drawings.length,
    hiddenDrawings,
    lockedDrawings,
    totalObjects:
      comparisonCount +
      builtInEnabled +
      customEnabled +
      drawings.length,
  };
}
