import type { MarketSymbol, Timeframe } from "@marketos/market-core";
import type { ChartSettings } from "./chartSettings";
import { normalizeChartSettings } from "./chartSettings";
import type { CustomIndicatorDefinition } from "./customIndicators";
import type { ChartDrawing } from "./drawings";
import type { IndicatorSelection } from "./indicators";
import {
  normalizePaneVisualState,
  type PaneVisualState,
} from "./paneVisualState";
import {
  normalizePaneLinkSettings,
  type PaneLinkSettings,
} from "./paneLinks";

export type WorkspaceChartView = "candles" | "line" | "area";
export type WorkspaceLayoutMode = "single" | "split" | "quad";

export type WorkspacePaneState = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  visual?: PaneVisualState;
};

export type SavedWorkspace = {
  id: string;
  name: string;

  // Legacy primary fields kept for backward compatibility.
  symbol: MarketSymbol;
  timeframe: Timeframe;
  chartView: WorkspaceChartView;
  indicators: IndicatorSelection;
  drawings: ChartDrawing[];

  // V2/V3/V4/V5 fields.
  version?: 2 | 3 | 4 | 5;
  layoutMode?: WorkspaceLayoutMode;
  chartSyncEnabled?: boolean;
  paneLinks?: PaneLinkSettings;
  chartSettings?: ChartSettings;
  customIndicators?: CustomIndicatorDefinition[];
  panes?: {
    primary: WorkspacePaneState;
    secondary?: WorkspacePaneState | null;
    third?: WorkspacePaneState | null;
    fourth?: WorkspacePaneState | null;
  };

  savedAt: number;
};

const WORKSPACES_KEY = "marketos:workspaces";
const WATCHLIST_KEY = "marketos:watchlist";
const MAX_WORKSPACES = 12;

function storage() {
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
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function validSymbol(value: unknown): value is MarketSymbol {
  if (!value || typeof value !== "object") return false;
  const symbol = value as Partial<MarketSymbol>;
  return (
    typeof symbol.id === "string" &&
    typeof symbol.ticker === "string" &&
    typeof symbol.name === "string" &&
    typeof symbol.exchange === "string" &&
    typeof symbol.assetClass === "string" &&
    typeof symbol.currency === "string"
  );
}

function validTimeframe(value: unknown): value is Timeframe {
  return ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"].includes(String(value));
}

function validChartView(value: unknown): value is WorkspaceChartView {
  return value === "candles" || value === "line" || value === "area";
}

function validLayoutMode(value: unknown): value is WorkspaceLayoutMode {
  return value === "single" || value === "split" || value === "quad";
}

function normalizePane(
  value: unknown,
  fallback: WorkspacePaneState | null,
  visualFallback: PaneVisualState,
): WorkspacePaneState | null {
  if (!value || typeof value !== "object") return fallback;
  const pane = value as Partial<WorkspacePaneState>;
  if (!validSymbol(pane.symbol) || !validTimeframe(pane.timeframe)) return fallback;
  return {
    symbol: pane.symbol,
    timeframe: pane.timeframe,
    visual: normalizePaneVisualState(
      pane.visual,
      visualFallback,
    ),
  };
}

export function normalizeSavedWorkspace(value: unknown): SavedWorkspace | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedWorkspace>;

  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    !validSymbol(item.symbol) ||
    !validTimeframe(item.timeframe) ||
    !validChartView(item.chartView) ||
    !item.indicators ||
    typeof item.indicators !== "object" ||
    !Array.isArray(item.drawings) ||
    typeof item.savedAt !== "number"
  ) {
    return null;
  }

  const legacyVisual = normalizePaneVisualState(
    {
      chartView: item.chartView,
      indicators: item.indicators,
      chartSettings: item.chartSettings,
    },
    {
      chartView: item.chartView,
      indicators: item.indicators,
      chartSettings: normalizeChartSettings(
        item.chartSettings,
      ),
    },
  );

  const primaryFallback: WorkspacePaneState = {
    symbol: item.symbol,
    timeframe: item.timeframe,
    visual: legacyVisual,
  };

  const rawPanes =
    item.panes && typeof item.panes === "object"
      ? item.panes
      : undefined;

  const primary =
    normalizePane(
      rawPanes?.primary,
      primaryFallback,
      legacyVisual,
    ) ?? primaryFallback;
  const secondary =
    normalizePane(
      rawPanes?.secondary,
      null,
      legacyVisual,
    );
  const third =
    normalizePane(
      rawPanes?.third,
      null,
      legacyVisual,
    );
  const fourth =
    normalizePane(
      rawPanes?.fourth,
      null,
      legacyVisual,
    );

  const layoutMode = validLayoutMode(item.layoutMode)
    ? item.layoutMode
    : secondary
      ? "split"
      : "single";

  return {
    id: item.id,
    name: item.name.slice(0, 80),
    symbol: primary.symbol,
    timeframe: primary.timeframe,
    chartView: item.chartView,
    indicators: item.indicators,
    drawings: item.drawings,
    version:
      item.version === 5
        ? 5
        : item.version === 4
          ? 4
          : item.version === 3
            ? 3
            : item.version === 2
              ? 2
              : undefined,
    layoutMode,
    chartSyncEnabled:
      typeof item.chartSyncEnabled === "boolean"
        ? item.chartSyncEnabled
        : true,
    paneLinks:
      normalizePaneLinkSettings(
        item.paneLinks,
        {
          range:
            typeof item.chartSyncEnabled === "boolean"
              ? item.chartSyncEnabled
              : true,
          symbol: false,
          timeframe: false,
          crosshair: false,
        },
      ),
    chartSettings: item.chartSettings
      ? normalizeChartSettings(item.chartSettings)
      : undefined,
    customIndicators: Array.isArray(item.customIndicators)
      ? item.customIndicators.slice(0, 20)
      : undefined,
    panes: {
      primary,
      secondary,
      third,
      fourth,
    },
    savedAt: item.savedAt,
  };
}

export function loadWorkspaces(): SavedWorkspace[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(WORKSPACES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeSavedWorkspace)
      .filter((item): item is SavedWorkspace => item !== null)
      .slice(0, MAX_WORKSPACES);
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: SavedWorkspace[]) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      WORKSPACES_KEY,
      JSON.stringify(
        workspaces
          .map(normalizeSavedWorkspace)
          .filter((item): item is SavedWorkspace => item !== null)
          .slice(0, MAX_WORKSPACES),
      ),
    );
  } catch {
    // Ignore restricted storage environments.
  }
}

export function createWorkspace(
  input: Omit<SavedWorkspace, "id" | "savedAt">,
): SavedWorkspace {
  const workspace: SavedWorkspace = {
    ...input,
    id: id(),
    savedAt: Date.now(),
  };

  return normalizeSavedWorkspace(workspace) ?? workspace;
}

export function loadWatchlist(fallback: MarketSymbol[]): MarketSymbol[] {
  const store = storage();
  if (!store) return fallback;

  try {
    const raw = store.getItem(WATCHLIST_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as MarketSymbol[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    const deduplicated = new Map<string, MarketSymbol>();
    for (const symbol of parsed) {
      if (validSymbol(symbol)) deduplicated.set(symbol.id, symbol);
    }

    return [...deduplicated.values()].slice(0, 50);
  } catch {
    return fallback;
  }
}

export function saveWatchlist(symbols: MarketSymbol[]) {
  const store = storage();
  if (!store) return;

  try {
    const deduplicated = [
      ...new Map(
        symbols
          .filter(validSymbol)
          .map((symbol) => [symbol.id, symbol]),
      ).values(),
    ];

    store.setItem(WATCHLIST_KEY, JSON.stringify(deduplicated.slice(0, 50)));
  } catch {
    // Ignore restricted storage environments.
  }
}
