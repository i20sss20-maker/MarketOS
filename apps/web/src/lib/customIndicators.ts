import { validateFormula } from "@marketos/formula-core";

export type CustomIndicatorPane = "price" | "separate";

export type CustomIndicatorDefinition = {
  id: string;
  name: string;
  formula: string;
  pane: CustomIndicatorPane;
  enabled: boolean;
  createdAt: number;
};

const STORAGE_KEY = "marketos:custom-indicators";
const MAX_INDICATORS = 20;

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function id() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `indicator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadCustomIndicators(): CustomIndicatorDefinition[] {
  const storage = safeStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomIndicatorDefinition[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.formula === "string" &&
        (item.pane === "price" || item.pane === "separate") &&
        typeof item.enabled === "boolean" &&
        validateFormula(item.formula).ok,
      )
      .slice(0, MAX_INDICATORS);
  } catch {
    return [];
  }
}

export function saveCustomIndicators(indicators: CustomIndicatorDefinition[]) {
  const storage = safeStorage();
  if (!storage) return;

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(indicators.slice(0, MAX_INDICATORS)),
    );
  } catch {
    // Ignore restricted storage environments.
  }
}

export function createCustomIndicator(input: {
  name: string;
  formula: string;
  pane: CustomIndicatorPane;
}): CustomIndicatorDefinition {
  const validation = validateFormula(input.formula);
  if (!validation.ok) {
    throw new Error(validation.error ?? "Invalid formula.");
  }

  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Indicator name is required.");

  return {
    id: id(),
    name,
    formula: input.formula.trim(),
    pane: input.pane,
    enabled: true,
    createdAt: Date.now(),
  };
}

export const customIndicatorPresets: Array<{
  name: string;
  formula: string;
  pane: CustomIndicatorPane;
}> = [
  {
    name: "EMA 20",
    formula: "EMA(CLOSE, 20)",
    pane: "price",
  },
  {
    name: "EMA Spread",
    formula: "EMA(CLOSE, 20) - EMA(CLOSE, 50)",
    pane: "separate",
  },
  {
    name: "Price vs SMA %",
    formula: "(CLOSE - SMA(CLOSE, 20)) / SMA(CLOSE, 20) * 100",
    pane: "separate",
  },
  {
    name: "Volume Ratio",
    formula: "VOLUME / SMA(VOLUME, 20)",
    pane: "separate",
  },
  {
    name: "RSI 14",
    formula: "RSI(14)",
    pane: "separate",
  },
  {
    name: "ATR %",
    formula: "ATR(14) / CLOSE * 100",
    pane: "separate",
  },
];
