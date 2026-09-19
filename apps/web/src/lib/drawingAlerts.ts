export type HorizontalDrawingAlertSpec = {
  operator: "above" | "below";
  value: number;
};

export function buildHorizontalDrawingAlertSpec(
  currentPrice: number,
  linePrice: number,
): HorizontalDrawingAlertSpec | null {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(linePrice)
  ) {
    return null;
  }

  const tolerance =
    Math.max(
      Math.abs(linePrice) * 1e-9,
      1e-9,
    );

  if (
    Math.abs(
      currentPrice - linePrice,
    ) <= tolerance
  ) {
    return null;
  }

  return {
    operator:
      currentPrice < linePrice
        ? "above"
        : "below",
    value: linePrice,
  };
}
