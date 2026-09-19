import type {
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";

export type ChartTabView =
  | "candles"
  | "line"
  | "area";

export type ChartTab = {
  id: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  chartView: ChartTabView;
  createdAt: number;
  updatedAt: number;
};

export type RecentSymbol = {
  symbol: MarketSymbol;
  lastUsedAt: number;
};

export const MAX_CHART_TABS = 8;
export const MAX_RECENT_SYMBOLS = 12;

const TABS_KEY = "marketos:chart-tabs";
const ACTIVE_TAB_KEY =
  "marketos:active-chart-tab";
const RECENT_KEY =
  "marketos:recent-symbols";

function storage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function id() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `chart-tab-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function validTimeframe(
  value: unknown,
): value is Timeframe {
  return [
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
    "1w",
    "1M",
  ].includes(String(value));
}

function validView(
  value: unknown,
): value is ChartTabView {
  return (
    value === "candles" ||
    value === "line" ||
    value === "area"
  );
}

function validSymbol(
  value: unknown,
): value is MarketSymbol {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const symbol =
    value as Partial<MarketSymbol>;

  return (
    typeof symbol.id === "string" &&
    typeof symbol.ticker === "string" &&
    typeof symbol.name === "string" &&
    typeof symbol.exchange === "string" &&
    typeof symbol.assetClass === "string" &&
    typeof symbol.currency === "string"
  );
}

export function normalizeChartTab(
  value: unknown,
): ChartTab | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const item =
    value as Partial<ChartTab>;

  if (
    typeof item.id !== "string" ||
    !validSymbol(item.symbol) ||
    !validTimeframe(item.timeframe) ||
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

  return {
    id: item.id.slice(0, 120),
    symbol: item.symbol,
    timeframe: item.timeframe,
    chartView: item.chartView,
    createdAt,
    updatedAt,
  };
}

export function createChartTab(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  chartView: ChartTabView,
): ChartTab {
  const now = Date.now();

  return {
    id: id(),
    symbol,
    timeframe,
    chartView,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadChartTabs(
  fallback: Omit<
    ChartTab,
    "id" | "createdAt" | "updatedAt"
  >,
): ChartTab[] {
  const store = storage();

  if (store) {
    try {
      const raw =
        store.getItem(TABS_KEY);

      if (raw) {
        const parsed =
          JSON.parse(raw) as unknown;

        if (Array.isArray(parsed)) {
          const tabs = parsed
            .map(normalizeChartTab)
            .filter(
              (
                tab,
              ): tab is ChartTab =>
                tab !== null,
            )
            .slice(0, MAX_CHART_TABS);

          if (tabs.length > 0) {
            return tabs;
          }
        }
      }
    } catch {
      // Fall through.
    }
  }

  return [
    createChartTab(
      fallback.symbol,
      fallback.timeframe,
      fallback.chartView,
    ),
  ];
}

export function saveChartTabs(
  tabs: ChartTab[],
) {
  const store = storage();
  if (!store) return;

  try {
    const normalized = tabs
      .map(normalizeChartTab)
      .filter(
        (
          tab,
        ): tab is ChartTab =>
          tab !== null,
      )
      .slice(0, MAX_CHART_TABS);

    store.setItem(
      TABS_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore restricted storage.
  }
}

export function loadActiveChartTabId(
  tabs: ChartTab[],
) {
  const store = storage();

  if (store) {
    try {
      const saved =
        store.getItem(ACTIVE_TAB_KEY);

      if (
        saved &&
        tabs.some(
          (tab) => tab.id === saved,
        )
      ) {
        return saved;
      }
    } catch {
      // Fall through.
    }
  }

  return tabs[0]?.id ?? null;
}

export function saveActiveChartTabId(
  id: string | null,
) {
  const store = storage();
  if (!store) return;

  try {
    if (!id) {
      store.removeItem(
        ACTIVE_TAB_KEY,
      );
      return;
    }

    store.setItem(
      ACTIVE_TAB_KEY,
      id,
    );
  } catch {
    // Ignore restricted storage.
  }
}

export function updateChartTab(
  tabs: ChartTab[],
  id: string,
  patch: Partial<
    Pick<
      ChartTab,
      "symbol" | "timeframe" | "chartView"
    >
  >,
): ChartTab[] {
  const now = Date.now();

  return tabs.map((tab) =>
    tab.id === id
      ? {
          ...tab,
          ...patch,
          updatedAt: now,
        }
      : tab,
  );
}

export function closeChartTab(
  tabs: ChartTab[],
  id: string,
): {
  tabs: ChartTab[];
  nextActiveId: string | null;
} {
  if (tabs.length <= 1) {
    return {
      tabs,
      nextActiveId:
        tabs[0]?.id ?? null,
    };
  }

  const index =
    tabs.findIndex(
      (tab) => tab.id === id,
    );

  if (index < 0) {
    return {
      tabs,
      nextActiveId:
        tabs[0]?.id ?? null,
    };
  }

  const next =
    tabs.filter(
      (tab) => tab.id !== id,
    );

  const candidate =
    next[
      Math.min(
        index,
        next.length - 1,
      )
    ] ??
    next[index - 1] ??
    next[0] ??
    null;

  return {
    tabs: next,
    nextActiveId:
      candidate?.id ?? null,
  };
}

function normalizeRecent(
  value: unknown,
): RecentSymbol | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const item =
    value as Partial<RecentSymbol>;

  if (!validSymbol(item.symbol)) {
    return null;
  }

  return {
    symbol: item.symbol,
    lastUsedAt:
      typeof item.lastUsedAt ===
        "number" &&
      Number.isFinite(
        item.lastUsedAt,
      )
        ? Math.floor(
            item.lastUsedAt,
          )
        : Date.now(),
  };
}

export function loadRecentSymbols():
RecentSymbol[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw =
      store.getItem(RECENT_KEY);

    if (!raw) return [];

    const parsed =
      JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeRecent)
      .filter(
        (
          item,
        ): item is RecentSymbol =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b.lastUsedAt -
          a.lastUsedAt,
      )
      .slice(
        0,
        MAX_RECENT_SYMBOLS,
      );
  } catch {
    return [];
  }
}

export function recordRecentSymbol(
  current: RecentSymbol[],
  symbol: MarketSymbol,
): RecentSymbol[] {
  const now = Date.now();

  return [
    {
      symbol,
      lastUsedAt: now,
    },
    ...current.filter(
      (item) =>
        item.symbol.id !==
        symbol.id,
    ),
  ].slice(
    0,
    MAX_RECENT_SYMBOLS,
  );
}

export function saveRecentSymbols(
  recent: RecentSymbol[],
) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      RECENT_KEY,
      JSON.stringify(
        recent
          .map(normalizeRecent)
          .filter(
            (
              item,
            ): item is RecentSymbol =>
              item !== null,
          )
          .slice(
            0,
            MAX_RECENT_SYMBOLS,
          ),
      ),
    );
  } catch {
    // Ignore restricted storage.
  }
}
