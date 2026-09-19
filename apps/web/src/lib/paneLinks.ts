export type PaneLinkSettings = {
  range: boolean;
  symbol: boolean;
  timeframe: boolean;
};

export const defaultPaneLinkSettings: PaneLinkSettings = {
  range: true,
  symbol: false,
  timeframe: false,
};

export function normalizePaneLinkSettings(
  value: unknown,
  fallback: PaneLinkSettings = defaultPaneLinkSettings,
): PaneLinkSettings {
  const source =
    value &&
    typeof value === "object"
      ? value as Partial<PaneLinkSettings>
      : {};

  return {
    range:
      typeof source.range === "boolean"
        ? source.range
        : fallback.range,
    symbol:
      typeof source.symbol === "boolean"
        ? source.symbol
        : fallback.symbol,
    timeframe:
      typeof source.timeframe === "boolean"
        ? source.timeframe
        : fallback.timeframe,
  };
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPaneLinkSettings(): PaneLinkSettings {
  const store = storage();
  if (!store) return defaultPaneLinkSettings;

  return {
    range:
      store.getItem("marketos:chart-sync") !== "off",
    symbol:
      store.getItem("marketos:pane-link-symbol") === "on",
    timeframe:
      store.getItem("marketos:pane-link-timeframe") === "on",
  };
}

export function savePaneLinkSettings(
  settings: PaneLinkSettings,
) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      "marketos:chart-sync",
      settings.range ? "on" : "off",
    );
    store.setItem(
      "marketos:pane-link-symbol",
      settings.symbol ? "on" : "off",
    );
    store.setItem(
      "marketos:pane-link-timeframe",
      settings.timeframe ? "on" : "off",
    );
  } catch {
    // Ignore restricted storage.
  }
}
