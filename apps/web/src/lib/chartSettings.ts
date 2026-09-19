export type PriceScaleSetting =
  | "normal"
  | "logarithmic"
  | "percentage"
  | "indexed";

export type CrosshairSetting =
  | "magnet"
  | "normal"
  | "hidden";

export type ChartSettings = {
  priceScaleMode: PriceScaleSetting;
  crosshairMode: CrosshairSetting;
  showGrid: boolean;
  showVolume: boolean;
  invertScale: boolean;
  showPriceScale: boolean;
  barSpacing: number;
  rightOffset: number;
};

export const defaultChartSettings: ChartSettings = {
  priceScaleMode: "normal",
  crosshairMode: "magnet",
  showGrid: true,
  showVolume: true,
  invertScale: false,
  showPriceScale: true,
  barSpacing: 7,
  rightOffset: 5,
};

const STORAGE_KEY = "marketos:chart-settings";

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function booleanOr(
  value: unknown,
  fallback: boolean,
) {
  return typeof value === "boolean" ? value : fallback;
}

function numberWithin(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : fallback;
}

export function normalizeChartSettings(
  input: Partial<ChartSettings> | null | undefined,
): ChartSettings {
  const priceScaleMode: PriceScaleSetting =
    input?.priceScaleMode === "logarithmic" ||
    input?.priceScaleMode === "percentage" ||
    input?.priceScaleMode === "indexed" ||
    input?.priceScaleMode === "normal"
      ? input.priceScaleMode
      : defaultChartSettings.priceScaleMode;

  const crosshairMode: CrosshairSetting =
    input?.crosshairMode === "normal" ||
    input?.crosshairMode === "hidden" ||
    input?.crosshairMode === "magnet"
      ? input.crosshairMode
      : defaultChartSettings.crosshairMode;

  return {
    priceScaleMode,
    crosshairMode,
    showGrid: booleanOr(
      input?.showGrid,
      defaultChartSettings.showGrid,
    ),
    showVolume: booleanOr(
      input?.showVolume,
      defaultChartSettings.showVolume,
    ),
    invertScale: booleanOr(
      input?.invertScale,
      defaultChartSettings.invertScale,
    ),
    showPriceScale: booleanOr(
      input?.showPriceScale,
      defaultChartSettings.showPriceScale,
    ),
    barSpacing: numberWithin(
      input?.barSpacing,
      3,
      20,
      defaultChartSettings.barSpacing,
    ),
    rightOffset: numberWithin(
      input?.rightOffset,
      0,
      30,
      defaultChartSettings.rightOffset,
    ),
  };
}

export function loadChartSettings(): ChartSettings {
  const storage = safeStorage();
  if (!storage) return defaultChartSettings;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultChartSettings;
    return normalizeChartSettings(
      JSON.parse(raw) as Partial<ChartSettings>,
    );
  } catch {
    return defaultChartSettings;
  }
}

export function saveChartSettings(
  settings: ChartSettings,
) {
  const storage = safeStorage();
  if (!storage) return;

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeChartSettings(settings)),
    );
  } catch {
    // Ignore restricted storage environments.
  }
}

export function resetChartSettings() {
  const settings = { ...defaultChartSettings };
  saveChartSettings(settings);
  return settings;
}
