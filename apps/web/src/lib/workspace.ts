import type { MarketSymbol, Timeframe } from "@marketos/market-core";
import type { ChartDrawing } from "./drawings";
import type { IndicatorSelection } from "./indicators";

export type WorkspaceChartView = "candles" | "line" | "area";

export type SavedWorkspace = {
  id: string;
  name: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  chartView: WorkspaceChartView;
  indicators: IndicatorSelection;
  drawings: ChartDrawing[];
  savedAt: number;
};

const WORKSPACES_KEY = "marketos:workspaces";
const WATCHLIST_KEY = "marketos:watchlist";

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

export function loadWorkspaces(): SavedWorkspace[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedWorkspace[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.symbol &&
        typeof item.symbol.id === "string" &&
        typeof item.timeframe === "string" &&
        ["candles", "line", "area"].includes(item.chartView),
      )
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: SavedWorkspace[]) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(WORKSPACES_KEY, JSON.stringify(workspaces.slice(0, 12)));
  } catch {
    // Ignore restricted storage environments.
  }
}

export function createWorkspace(input: Omit<SavedWorkspace, "id" | "savedAt">): SavedWorkspace {
  return {
    ...input,
    id: id(),
    savedAt: Date.now(),
  };
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
      if (symbol && typeof symbol.id === "string" && typeof symbol.ticker === "string") {
        deduplicated.set(symbol.id, symbol);
      }
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
    const deduplicated = [...new Map(symbols.map((symbol) => [symbol.id, symbol])).values()];
    store.setItem(WATCHLIST_KEY, JSON.stringify(deduplicated.slice(0, 50)));
  } catch {
    // Ignore restricted storage environments.
  }
}
