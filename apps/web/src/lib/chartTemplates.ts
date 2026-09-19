import { validateFormula } from "@marketos/formula-core";
import {
  defaultChartSettings,
  normalizeChartSettings,
  type ChartSettings,
} from "./chartSettings";
import {
  defaultIndicators,
  type IndicatorId,
  type IndicatorSelection,
} from "./indicators";
import type {
  CustomIndicatorDefinition,
} from "./customIndicators";

export type ChartTemplateView =
  | "candles"
  | "line"
  | "area";

export type ChartTemplateDefinition = {
  name: string;
  chartView: ChartTemplateView;
  chartSettings: ChartSettings;
  indicators: IndicatorSelection;
  customIndicators: CustomIndicatorDefinition[];
};

export type SavedChartTemplate =
  ChartTemplateDefinition & {
    id: string;
    createdAt: number;
    updatedAt: number;
  };

const STORAGE_KEY = "marketos:chart-templates";
const MAX_LOCAL_TEMPLATES = 30;

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

function safeStorage() {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `template-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeIndicators(
  value: unknown,
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
        : defaultIndicators[id],
    ]),
  ) as IndicatorSelection;
}

function validView(
  value: unknown,
): value is ChartTemplateView {
  return (
    value === "candles" ||
    value === "line" ||
    value === "area"
  );
}

function sanitizeCustomIndicators(
  value: unknown,
): CustomIndicatorDefinition[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const output: CustomIndicatorDefinition[] = [];

  for (const raw of value) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }

    const item =
      raw as Partial<CustomIndicatorDefinition>;

    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.formula !== "string" ||
      (
        item.pane !== "price" &&
        item.pane !== "separate"
      ) ||
      !validateFormula(item.formula).ok
    ) {
      continue;
    }

    const signature =
      `${item.formula.trim()}::${item.pane}`;

    if (seen.has(signature)) continue;
    seen.add(signature);

    output.push({
      id: item.id.slice(0, 120),
      name: item.name.trim().slice(0, 60),
      formula:
        item.formula.trim().slice(0, 300),
      pane: item.pane,
      enabled: true,
      createdAt:
        typeof item.createdAt === "number" &&
        Number.isFinite(item.createdAt)
          ? Math.floor(item.createdAt)
          : Date.now(),
    });

    if (output.length >= 20) break;
  }

  return output;
}

export function normalizeSavedChartTemplate(
  value: unknown,
): SavedChartTemplate | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const item =
    value as Partial<SavedChartTemplate>;

  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    !validView(item.chartView)
  ) {
    return null;
  }

  const createdAt =
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt)
      ? Math.floor(item.createdAt)
      : Date.now();

  const updatedAt =
    typeof item.updatedAt === "number" &&
    Number.isFinite(item.updatedAt)
      ? Math.floor(item.updatedAt)
      : createdAt;

  const name =
    item.name.trim().slice(0, 60);

  if (!name) return null;

  return {
    id: item.id.slice(0, 120),
    name,
    chartView: item.chartView,
    chartSettings:
      normalizeChartSettings(
        item.chartSettings,
      ),
    indicators:
      normalizeIndicators(
        item.indicators,
      ),
    customIndicators:
      sanitizeCustomIndicators(
        item.customIndicators,
      ),
    createdAt,
    updatedAt,
  };
}

export function loadChartTemplates() {
  const storage = safeStorage();
  if (!storage) return [];

  try {
    const raw =
      storage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed =
      JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeSavedChartTemplate)
      .filter(
        (
          item,
        ): item is SavedChartTemplate =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt,
      )
      .slice(0, MAX_LOCAL_TEMPLATES);
  } catch {
    return [];
  }
}

export function saveChartTemplates(
  templates: SavedChartTemplate[],
) {
  const storage = safeStorage();
  if (!storage) return;

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        templates
          .map(
            normalizeSavedChartTemplate,
          )
          .filter(
            (
              item,
            ): item is SavedChartTemplate =>
              item !== null,
          )
          .sort(
            (a, b) =>
              b.updatedAt - a.updatedAt,
          )
          .slice(
            0,
            MAX_LOCAL_TEMPLATES,
          ),
      ),
    );
  } catch {
    // Ignore restricted storage.
  }
}

export function createChartTemplate(
  name: string,
  input: Omit<
    ChartTemplateDefinition,
    "name"
  >,
): SavedChartTemplate {
  const now = Date.now();
  const normalizedName =
    name.trim().slice(0, 60);

  if (!normalizedName) {
    throw new Error(
      "Template name is required.",
    );
  }

  return {
    id: createId(),
    name: normalizedName,
    chartView: input.chartView,
    chartSettings:
      normalizeChartSettings(
        input.chartSettings,
      ),
    indicators:
      normalizeIndicators(
        input.indicators,
      ),
    customIndicators:
      sanitizeCustomIndicators(
        input.customIndicators.filter(
          (indicator) =>
            indicator.enabled,
        ),
      ),
    createdAt: now,
    updatedAt: now,
  };
}

function preset(
  name: string,
  indicators: Partial<IndicatorSelection>,
  settings?: Partial<ChartSettings>,
): ChartTemplateDefinition {
  return {
    name,
    chartView: "candles",
    chartSettings:
      normalizeChartSettings({
        ...defaultChartSettings,
        ...settings,
      }),
    indicators:
      normalizeIndicators({
        ...Object.fromEntries(
          indicatorIds.map((id) => [
            id,
            false,
          ]),
        ),
        ...indicators,
      }),
    customIndicators: [],
  };
}

export const chartTemplatePresets: ChartTemplateDefinition[] = [
  preset(
    "Clean Price",
    {},
    {
      showVolume: true,
      showGrid: true,
    },
  ),
  preset(
    "Trend",
    {
      sma20: true,
      ema20: true,
      ema50: true,
    },
  ),
  preset(
    "Momentum",
    {
      ema20: true,
      rsi14: true,
      macd: true,
    },
  ),
  preset(
    "Volatility",
    {
      bollinger20: true,
      atr14: true,
    },
  ),
];

function signature(
  indicator: CustomIndicatorDefinition,
) {
  return `${indicator.formula.trim()}::${indicator.pane}`;
}

function stableId(
  indicator: CustomIndicatorDefinition,
) {
  const source = signature(indicator);
  let hash = 2166136261;

  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(
      hash,
      16777619,
    );
  }

  return `template-indicator-${(
    hash >>> 0
  ).toString(36)}`;
}

export function mergeTemplateCustomIndicators(
  current: CustomIndicatorDefinition[],
  requested: CustomIndicatorDefinition[],
  maxIndicators: number,
) {
  const limit =
    Math.max(
      0,
      Math.floor(maxIndicators),
    );

  const next =
    current.map((indicator) => ({
      ...indicator,
      enabled: false,
    }));

  const bySignature =
    new Map(
      next.map((indicator) => [
        signature(indicator),
        indicator,
      ]),
    );

  let skipped = 0;

  for (
    const requestedIndicator
    of sanitizeCustomIndicators(
      requested,
    )
  ) {
    const key =
      signature(requestedIndicator);
    const existing =
      bySignature.get(key);

    if (existing) {
      existing.enabled = true;
      continue;
    }

    if (next.length >= limit) {
      skipped += 1;
      continue;
    }

    const added = {
      ...requestedIndicator,
      id:
        next.some(
          (item) =>
            item.id ===
            requestedIndicator.id,
        )
          ? stableId(
              requestedIndicator,
            )
          : requestedIndicator.id,
      enabled: true,
      createdAt: Date.now(),
    };

    next.push(added);
    bySignature.set(key, added);
  }

  return {
    indicators: next,
    skipped,
  };
}
