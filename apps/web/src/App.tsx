import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applySmartScreener,
  parseSmartScreenerQuery,
} from "@marketos/screener-core";
import type {
  Candle,
  ChartAnalysisResponse,
  CompanyRelease,
  MarketDataStatus,
  MarketEvent,
  MarketOverviewItem,
  MarketSymbol,
  MultiTimeframeAnalysisResponse,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import MarketChart, { type ChartView } from "./components/MarketChart";
import AdvancedAlertsPanel from "./components/AdvancedAlertsPanel";
import CompanyFeedPanel from "./components/CompanyFeedPanel";
import IndicatorLab from "./components/IndicatorLab";
import MarketEventsPanel from "./components/MarketEventsPanel";
import StrategyTester from "./components/StrategyTester";
import SystemPanel from "./components/SystemPanel";
import { analyzeChart, analyzeMultipleTimeframes } from "./lib/aiApi";
import { createDemoCandles, createDemoQuote } from "./lib/demoData";
import { createBrowserDemoFeed } from "./lib/demoFeed";
import { createBrowserDemoEvents, localDateRange } from "./lib/demoEvents";
import { getCompanyFeed } from "./lib/feedApi";
import { getMarketEvents } from "./lib/eventsApi";
import { getSystemHealth, type SystemHealth } from "./lib/systemApi";
import {
  loadCustomIndicators,
  saveCustomIndicators,
  type CustomIndicatorDefinition,
} from "./lib/customIndicators";
import type { ChartDrawing, DrawingPoint, DrawingTool } from "./lib/drawings";
import {
  createDrawingId,
  drawingDetail,
  drawingName,
  loadDrawings,
  saveDrawings,
  withDrawingMeta,
} from "./lib/drawings";
import {
  canRedoDrawings,
  canUndoDrawings,
  commitDrawingHistory,
  createDrawingHistory,
  redoDrawingHistory,
  undoDrawingHistory,
} from "./lib/drawingHistory";
import {
  describeAdvancedAlert,
  evaluateAdvancedAlerts,
  type AdvancedAlert,
  type AdvancedAlertCondition,
  type AlertLogic,
} from "@marketos/alert-core";
import {
  createAdvancedAlert,
  loadAlerts,
  rearmAlert,
  saveAlerts,
  toggleAlertEnabled,
} from "./lib/alerts";
import type { IndicatorId, IndicatorSelection } from "./lib/indicators";
import {
  indicatorCatalog,
  loadIndicatorSelection,
  saveIndicatorSelection,
} from "./lib/indicators";
import {
  createWorkspace,
  loadWatchlist,
  loadWorkspaces,
  saveWatchlist,
  saveWorkspaces,
  type SavedWorkspace,
} from "./lib/workspace";
import {
  getMarketCandles,
  getMarketOverview,
  getMarketQuote,
  getMarketStatus,
  searchMarketSymbols,
} from "./lib/marketApi";

const initialSymbols: MarketSymbol[] = [
  { id: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:TSLA", ticker: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "XSAU:2222", ticker: "2222", name: "Saudi Aramco", exchange: "Saudi Exchange", micCode: "XSAU", country: "Saudi Arabia", assetClass: "stock", currency: "SAR" },
  { id: "XSAU:1120", ticker: "1120", name: "Al Rajhi Bank", exchange: "Saudi Exchange", micCode: "XSAU", country: "Saudi Arabia", assetClass: "stock", currency: "SAR" },
  { id: "FX:EURUSD", ticker: "EUR/USD", providerSymbol: "EUR/USD", name: "Euro / U.S. Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
  { id: "CRYPTO:BTCUSD", ticker: "BTC/USD", providerSymbol: "BTC/USD", name: "Bitcoin / U.S. Dollar", exchange: "Crypto", assetClass: "crypto", currency: "USD" },
  { id: "COMEX:GC", ticker: "GC", name: "Gold Futures", exchange: "COMEX", assetClass: "future", currency: "USD" },
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

type ChartLayoutMode = "single" | "split";
type ScreenerMode = "heatmap" | "table";
type ScreenerFilter = "all" | "equities" | "forex" | "crypto" | "futures";
type WatchlistFilter = "all" | "equities" | "forex" | "crypto" | "futures";
type WatchlistSort = "manual" | "change-desc" | "change-asc" | "symbol";

function readSaved<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return (window.localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function readSavedSymbol(): MarketSymbol {
  if (typeof window === "undefined") return initialSymbols[0];
  try {
    const saved = window.localStorage.getItem("marketos:symbol-object");
    if (!saved) return initialSymbols[0];
    const parsed = JSON.parse(saved) as MarketSymbol;
    if (!parsed?.ticker || !parsed?.id) return initialSymbols[0];
    return parsed;
  } catch {
    const legacyId = readSaved("marketos:symbol", initialSymbols[0].id);
    return initialSymbols.find((symbol) => symbol.id === legacyId) ?? initialSymbols[0];
  }
}

function saveSetting(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in restricted webviews or privacy modes.
  }
}

function localSearch(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return initialSymbols;
  return initialSymbols.filter((symbol) =>
    [symbol.ticker, symbol.name, symbol.exchange, symbol.country ?? ""]
      .some((value) => value.toLowerCase().includes(needle)),
  );
}

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value < 10 ? 3 : 2,
    maximumFractionDigits: value < 10 ? 5 : 2,
  }).format(value);
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVolume(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function overviewMatchesFilter(item: MarketOverviewItem, filter: ScreenerFilter) {
  if (filter === "all") return true;
  if (filter === "equities") {
    return item.symbol.assetClass === "stock" ||
      item.symbol.assetClass === "index" ||
      item.symbol.assetClass === "etf";
  }
  if (filter === "forex") return item.symbol.assetClass === "forex";
  if (filter === "crypto") return item.symbol.assetClass === "crypto";
  return item.symbol.assetClass === "future" || item.symbol.assetClass === "commodity";
}

function watchlistMatchesFilter(
  symbol: MarketSymbol,
  filter: WatchlistFilter,
) {
  if (filter === "all") return true;
  if (filter === "equities") {
    return symbol.assetClass === "stock" ||
      symbol.assetClass === "index" ||
      symbol.assetClass === "etf";
  }
  if (filter === "forex") return symbol.assetClass === "forex";
  if (filter === "crypto") return symbol.assetClass === "crypto";
  return symbol.assetClass === "future" || symbol.assetClass === "commodity";
}

export default function App() {
  const [active, setActive] = useState<MarketSymbol>(() => readSavedSymbol());
  const [timeframe, setTimeframe] = useState<Timeframe>(() => readSaved("marketos:timeframe", "1h"));
  const [chartView, setChartView] = useState<ChartView>(() => readSaved("marketos:chart-view", "candles"));
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [watchlist, setWatchlist] = useState<MarketSymbol[]>(() => loadWatchlist(initialSymbols));
  const [watchlistOverview, setWatchlistOverview] = useState<MarketOverviewItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistProvider, setWatchlistProvider] = useState("demo");
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<number | null>(null);
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilter>(
    () => readSaved<WatchlistFilter>("marketos:watchlist-filter", "all"),
  );
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>(
    () => readSaved<WatchlistSort>("marketos:watchlist-sort", "manual"),
  );
  const watchlistInitialLoadRef = useRef(false);
  const [showScreener, setShowScreener] = useState(false);
  const [showCompanyFeed, setShowCompanyFeed] = useState(false);
  const [companyReleases, setCompanyReleases] = useState<CompanyRelease[]>([]);
  const [companyFeedProvider, setCompanyFeedProvider] = useState("demo-company-feed");
  const [companyFeedLoading, setCompanyFeedLoading] = useState(false);
  const [companyFeedError, setCompanyFeedError] = useState<string | null>(null);
  const [showStrategyTester, setShowStrategyTester] = useState(false);
  const [showSystemPanel, setShowSystemPanel] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const [eventsProvider, setEventsProvider] = useState("demo-events");
  const [eventsRangeDays, setEventsRangeDays] = useState(7);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [screenerMode, setScreenerMode] = useState<ScreenerMode>("heatmap");
  const [screenerFilter, setScreenerFilter] = useState<ScreenerFilter>("all");
  const [smartScreenerQuery, setSmartScreenerQuery] = useState("");
  const [appliedSmartScreenerQuery, setAppliedSmartScreenerQuery] = useState("");
  const [overview, setOverview] = useState<MarketOverviewItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewProvider, setOverviewProvider] = useState("demo");
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspace[]>(() => loadWorkspaces());
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showDrawingMenu, setShowDrawingMenu] = useState(false);
  const [showComparisonMenu, setShowComparisonMenu] = useState(false);
  const [comparisonSymbol, setComparisonSymbol] = useState<MarketSymbol | null>(null);
  const [comparisonCandles, setComparisonCandles] = useState<Candle[]>([]);
  const [layoutMode, setLayoutMode] = useState<ChartLayoutMode>(() =>
    readSaved("marketos:chart-layout", "single"),
  );
  const [replayActive, setReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  const [alerts, setAlerts] = useState<AdvancedAlert[]>(() => loadAlerts(timeframe));
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [alertsChecking, setAlertsChecking] = useState(false);
  const [alertCheckMessage, setAlertCheckMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Pick<ChartAnalysisResponse, "summary" | "observations" | "engine"> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [multiTimeframeLoading, setMultiTimeframeLoading] = useState(false);
  const [multiTimeframeResult, setMultiTimeframeResult] = useState<MultiTimeframeAnalysisResponse | null>(null);
  const [multiTimeframeError, setMultiTimeframeError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("اقرأ الحركة الحالية ووضح أهم ما يظهر في الشارت");

  const [indicators, setIndicators] = useState<IndicatorSelection>(() => loadIndicatorSelection());
  const [customIndicators, setCustomIndicators] = useState<CustomIndicatorDefinition[]>(
    () => loadCustomIndicators(),
  );
  const [showIndicatorLab, setShowIndicatorLab] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [drawingHistory, setDrawingHistory] = useState(
    () => createDrawingHistory(loadDrawings(active.id)),
  );
  const drawings = drawingHistory.present;
  const [textAnchor, setTextAnchor] = useState<DrawingPoint | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>(() => createDemoCandles(initialSymbols[0].ticker, "1h"));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    () => readSaved<"on" | "off">("marketos:auto-refresh", "off") === "on",
  );
  const [providerStatus, setProviderStatus] = useState<MarketDataStatus | null>(null);
  const [dataState, setDataState] = useState<"loading" | "provider" | "fallback">("fallback");
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MarketSymbol[]>(initialSymbols);
  const [searchLoading, setSearchLoading] = useState(false);

  const refreshQuote = useCallback(async (showLoading = false) => {
    if (replayActive) return;

    if (showLoading) setQuoteRefreshing(true);
    try {
      const response = await getMarketQuote(active);
      setQuote(response.quote);
      if (response.provider !== "demo") setDataState("provider");
    } catch {
      // Keep the last successful quote; market-data fallback is handled by the main load flow.
    } finally {
      if (showLoading) setQuoteRefreshing(false);
    }
  }, [active, replayActive]);

  useEffect(() => {
    const controller = new AbortController();

    getMarketStatus(controller.signal)
      .then((status) => {
        setProviderStatus(status);
        if (status.mode === "demo") setDataState((current) => current === "loading" ? "loading" : "fallback");
      })
      .catch(() => {
        setProviderStatus({
          provider: "web-demo",
          configured: true,
          mode: "demo",
          supportsSearch: true,
          supportsQuotes: true,
          supportsCandles: true,
          message: "API is unavailable; using browser demo fallback.",
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled || replayActive) return;

    const intervalMs =
      quote?.isMarketOpen === false && !quote?.isExtendedHours
        ? 60_000
        : 30_000;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshQuote(false);
      }
    };

    const interval = window.setInterval(refreshIfVisible, intervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    autoRefreshEnabled,
    replayActive,
    quote?.isMarketOpen,
    quote?.isExtendedHours,
    refreshQuote,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const fallbackCandles = createDemoCandles(active.id, timeframe);
    setDataState("loading");
    setDataError(null);

    Promise.all([
      getMarketCandles(active, timeframe, 300, controller.signal),
      getMarketQuote(active, controller.signal),
    ])
      .then(([candleResponse, quoteResponse]) => {
        if (candleResponse.candles.length === 0) {
          throw new Error("The market data provider returned no candles for this symbol.");
        }

        setCandles(candleResponse.candles);
        setQuote(quoteResponse.quote);
        setDataState(candleResponse.provider === "demo" ? "fallback" : "provider");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCandles(fallbackCandles);
        setQuote(createDemoQuote(active.ticker, active.currency, fallbackCandles));
        setDataState("fallback");
        setDataError(error instanceof Error ? error.message : "Market data request failed.");
      });

    return () => controller.abort();
  }, [active, timeframe]);

  useEffect(() => {
    if (!comparisonSymbol || comparisonSymbol.id === active.id) {
      setComparisonCandles([]);
      return;
    }

    const controller = new AbortController();
    getMarketCandles(comparisonSymbol, timeframe, 300, controller.signal)
      .then((response) => setComparisonCandles(response.candles))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setComparisonCandles(createDemoCandles(comparisonSymbol.id, timeframe, 300));
      });

    return () => controller.abort();
  }, [comparisonSymbol, active.id, timeframe]);

  useEffect(() => {
    if (replayActive) return;

    const hasRelevantAlert = alerts.some(
      (alert) =>
        alert.enabled &&
        !alert.triggeredAt &&
        alert.symbol.id === active.id &&
        alert.timeframe === timeframe,
    );
    if (!hasRelevantAlert) return;

    const result = evaluateAdvancedAlerts(alerts, {
      symbol: active,
      timeframe,
      candles,
      quote,
    });

    setAlerts(result.alerts);
    saveAlerts(result.alerts);

    if (result.triggered.length === 0) return;

    const latest = result.triggered[result.triggered.length - 1].alert;
    setAlertMessage(
      `تنبيه ${latest.symbol.ticker} · ${latest.timeframe.toUpperCase()}: ${describeAdvancedAlert(latest)}`,
    );

    const timer = window.setTimeout(() => setAlertMessage(null), 7000);
    return () => window.clearTimeout(timer);
  }, [
    quote?.price,
    quote?.percentChange,
    quote?.volume,
    candles,
    active,
    timeframe,
    replayActive,
  ]);

  useEffect(() => {
    if (!replayActive || !replayPlaying || candles.length === 0) return;

    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const index = current ?? Math.max(20, candles.length - 60);
        if (index >= candles.length - 1) {
          setReplayPlaying(false);
          return candles.length - 1;
        }
        return index + 1;
      });
    }, 650);

    return () => window.clearInterval(timer);
  }, [replayActive, replayPlaying, candles.length]);

  useEffect(() => {
    if (!replayActive || candles.length === 0) return;
    setReplayIndex((current) => {
      if (current === null) return Math.max(20, candles.length - 60);
      return Math.min(current, candles.length - 1);
    });
  }, [replayActive, candles.length]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearchResults(initialSymbols);
      setSearchLoading(false);
      return;
    }

    if (trimmed.length < 2) {
      setSearchResults(localSearch(trimmed));
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    const timer = window.setTimeout(() => {
      searchMarketSymbols(trimmed, controller.signal)
        .then((response) => {
          setSearchResults(response.symbols.length > 0 ? response.symbols : localSearch(trimmed));
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setSearchResults(localSearch(trimmed));
        })
        .finally(() => setSearchLoading(false));
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const watchlistQuoteMap = useMemo(
    () => new Map(watchlistOverview.map((item) => [item.symbol.id, item.quote])),
    [watchlistOverview],
  );

  const filteredWatchlist = useMemo(
    () => watchlist.filter((symbol) => watchlistMatchesFilter(symbol, watchlistFilter)),
    [watchlist, watchlistFilter],
  );

  const sortedWatchlist = useMemo(() => {
    if (watchlistSort === "manual") return filteredWatchlist;

    const nextSymbols = [...filteredWatchlist];
    if (watchlistSort === "symbol") {
      return nextSymbols.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return nextSymbols.sort((a, b) => {
      const aChange = watchlistQuoteMap.get(a.id)?.percentChange;
      const bChange = watchlistQuoteMap.get(b.id)?.percentChange;
      const aValue = typeof aChange === "number" ? aChange : -Infinity;
      const bValue = typeof bChange === "number" ? bChange : -Infinity;

      return watchlistSort === "change-desc"
        ? bValue - aValue
        : aValue - bValue;
    });
  }, [filteredWatchlist, watchlistSort, watchlistQuoteMap]);

  const visibleSymbols = useMemo(
    () => query.trim() ? searchResults : sortedWatchlist,
    [query, searchResults, sortedWatchlist],
  );

  const safeReplayIndex = replayActive
    ? Math.min(replayIndex ?? candles.length - 1, Math.max(0, candles.length - 1))
    : candles.length - 1;

  const displayCandles = useMemo(
    () => replayActive ? candles.slice(0, safeReplayIndex + 1) : candles,
    [candles, replayActive, safeReplayIndex],
  );

  const replayCutoff = displayCandles[displayCandles.length - 1]?.time;
  const displayComparisonCandles = useMemo(
    () =>
      replayActive && replayCutoff !== undefined
        ? comparisonCandles.filter((candle) => candle.time <= replayCutoff)
        : comparisonCandles,
    [comparisonCandles, replayActive, replayCutoff],
  );

  const activeIndicatorItems = useMemo(
    () => indicatorCatalog.filter((item) => indicators[item.id]),
    [indicators],
  );

  const activeCustomIndicators = useMemo(
    () => customIndicators.filter((indicator) => indicator.enabled),
    [customIndicators],
  );

  const updateCustomIndicators = useCallback((next: CustomIndicatorDefinition[]) => {
    setCustomIndicators(next);
    saveCustomIndicators(next);
  }, []);

  const toggleCustomIndicator = (id: string) => {
    updateCustomIndicators(
      customIndicators.map((indicator) =>
        indicator.id === id
          ? { ...indicator, enabled: !indicator.enabled }
          : indicator,
      ),
    );
  };

  const lastCandle = displayCandles[displayCandles.length - 1];
  const previousDisplayedCandle = displayCandles[displayCandles.length - 2];
  const inspectedCandle = hoverCandle ?? lastCandle;
  const isActiveWatchlisted = watchlist.some((symbol) => symbol.id === active.id);
  const displayedPrice = replayActive ? lastCandle?.close : quote?.price ?? lastCandle?.close;
  const displayedPercent = replayActive && lastCandle && previousDisplayedCandle
    ? ((lastCandle.close - previousDisplayedCandle.close) / previousDisplayedCandle.close) * 100
    : quote?.percentChange;
  const providerLabel =
    dataState === "loading"
      ? "Loading data"
      : dataState === "provider"
        ? providerStatus?.provider ?? quote?.source ?? "Provider"
        : "Demo fallback";

  const sessionLabel = replayActive
    ? "Replay"
    : quote?.isExtendedHours
      ? "جلسة ممتدة"
      : quote?.isMarketOpen === true
        ? "السوق مفتوح"
        : quote?.isMarketOpen === false
          ? "السوق مغلق"
          : providerStatus?.mode === "demo"
            ? "جلسة تجريبية"
            : "حالة الجلسة غير متاحة";

  const sessionState = replayActive
    ? "replay"
    : quote?.isMarketOpen === true || quote?.isExtendedHours
      ? "open"
      : quote?.isMarketOpen === false
        ? "closed"
        : "unknown";

  const quoteTimeLabel = quote
    ? new Date(quote.timestamp * 1000).toLocaleTimeString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((current) => {
      const next = !current;
      saveSetting("marketos:auto-refresh", next ? "on" : "off");
      return next;
    });
  };

  const addToWatchlist = useCallback((symbol: MarketSymbol) => {
    setWatchlist((current) => {
      if (current.some((item) => item.id === symbol.id)) return current;
      const next = [symbol, ...current].slice(0, 50);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const fallbackOverview = useCallback((symbols: MarketSymbol[]) => {
    return symbols.slice(0, 25).map((symbol) => {
      const demoCandles = createDemoCandles(symbol.id, "1m", 2);
      return {
        symbol,
        quote: createDemoQuote(symbol.ticker, symbol.currency, demoCandles),
      };
    });
  }, []);

  const refreshWatchlistOverview = useCallback(async (showLoading = true) => {
    const symbols = watchlist.slice(0, 25);
    if (symbols.length === 0) {
      setWatchlistOverview([]);
      setWatchlistError(null);
      setWatchlistUpdatedAt(Date.now());
      return;
    }

    if (showLoading) setWatchlistLoading(true);
    setWatchlistError(null);

    try {
      const response = await getMarketOverview(symbols);
      const returnedIds = new Set(response.items.map((item) => item.symbol.id));
      const missing = symbols.filter((symbol) => !returnedIds.has(symbol.id));
      const items = missing.length > 0
        ? [...response.items, ...fallbackOverview(missing)]
        : response.items;

      setWatchlistOverview(items);
      setWatchlistProvider(response.provider);
      setWatchlistUpdatedAt(Date.now());
    } catch {
      setWatchlistOverview(fallbackOverview(symbols));
      setWatchlistProvider("browser-demo");
      setWatchlistUpdatedAt(Date.now());
      setWatchlistError("تعذر تحديث الأسعار المباشرة، تظهر لقطة Demo مؤقتًا.");
    } finally {
      if (showLoading) setWatchlistLoading(false);
    }
  }, [watchlist, fallbackOverview]);

  useEffect(() => {
    if (watchlistInitialLoadRef.current) return;
    watchlistInitialLoadRef.current = true;
    void refreshWatchlistOverview(false);
  }, [refreshWatchlistOverview]);

  useEffect(() => {
    if (!autoRefreshEnabled || replayActive) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshWatchlistOverview(false);
      }
    };

    refreshIfVisible();
    const interval = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [autoRefreshEnabled, replayActive, refreshWatchlistOverview]);

  const refreshScreener = useCallback(async () => {
    const symbols = watchlist.slice(0, 25);
    if (symbols.length === 0) {
      setOverview([]);
      setOverviewError(null);
      return;
    }

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const response = await getMarketOverview(symbols);
      const returnedIds = new Set(response.items.map((item) => item.symbol.id));
      const missing = symbols.filter((symbol) => !returnedIds.has(symbol.id));
      const items = missing.length > 0
        ? [...response.items, ...fallbackOverview(missing)]
        : response.items;

      setOverview(items);
      setOverviewProvider(response.provider);
    } catch {
      setOverview(fallbackOverview(symbols));
      setOverviewProvider("browser-demo");
      setOverviewError("تعذر جلب لقطة السوق المباشرة، لذلك تم تشغيل بيانات العرض التجريبية.");
    } finally {
      setOverviewLoading(false);
    }
  }, [watchlist, fallbackOverview]);

  const openScreener = () => {
    setShowScreener(true);
    void refreshScreener();
  };

  const refreshEvents = useCallback(async (rangeDays = eventsRangeDays) => {
    const { startDate, endDate } = localDateRange(rangeDays);
    const symbols = watchlist.map((symbol) => symbol.ticker).slice(0, 50);
    setEventsLoading(true);
    setEventsError(null);

    try {
      const result = await getMarketEvents(startDate, endDate, symbols);
      setMarketEvents(result.events);
      setEventsProvider(result.provider);
    } catch {
      setMarketEvents(createBrowserDemoEvents(watchlist, rangeDays));
      setEventsProvider("browser-demo-events");
      setEventsError("تعذر الوصول لمصدر الأحداث، لذلك تظهر بيانات Sample للتجربة فقط.");
    } finally {
      setEventsLoading(false);
    }
  }, [eventsRangeDays, watchlist]);

  const openEvents = () => {
    setShowEvents(true);
    void refreshEvents(eventsRangeDays);
  };

  const refreshCompanyFeed = useCallback(async () => {
    const symbols = watchlist.slice(0, 8);
    if (symbols.length === 0) {
      setCompanyReleases([]);
      setCompanyFeedError("أضف رموزًا إلى قائمة المتابعة لعرض إعلانات الشركات.");
      return;
    }

    setCompanyFeedLoading(true);
    setCompanyFeedError(null);

    try {
      const result = await getCompanyFeed(symbols, 3);
      setCompanyReleases(result.releases);
      setCompanyFeedProvider(result.provider);
    } catch {
      setCompanyReleases(createBrowserDemoFeed(symbols, 2));
      setCompanyFeedProvider("browser-demo-company-feed");
      setCompanyFeedError(
        "تعذر الوصول لمصدر إعلانات الشركات، لذلك تظهر بيانات Sample للتجربة فقط.",
      );
    } finally {
      setCompanyFeedLoading(false);
    }
  }, [watchlist]);

  const openCompanyFeed = () => {
    setShowCompanyFeed(true);
    void refreshCompanyFeed();
  };

  const openCompanyFeedSymbol = (ticker: string) => {
    const normalized = ticker.replace(/\s+/g, "").toUpperCase();
    const symbol = watchlist.find(
      (item) =>
        item.ticker.replace(/\s+/g, "").toUpperCase() === normalized ||
        (item.providerSymbol ?? "").replace(/\s+/g, "").toUpperCase() === normalized,
    );

    setShowCompanyFeed(false);

    if (symbol) {
      chooseSymbol(symbol);
      return;
    }

    setQuery(ticker);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const refreshSystemHealth = useCallback(async () => {
    setSystemHealthLoading(true);
    setSystemHealthError(null);

    try {
      const health = await getSystemHealth();
      setSystemHealth(health);
    } catch {
      setSystemHealth(null);
      setSystemHealthError(
        "تعذر الوصول إلى MarketOS API. في النسخة المحلية أو قبل نشر Azure قد يكون الـBackend غير متصل.",
      );
    } finally {
      setSystemHealthLoading(false);
    }
  }, []);

  const openSystemPanel = () => {
    setShowSystemPanel(true);
    void refreshSystemHealth();
  };

  const changeEventsRange = (days: number) => {
    setEventsRangeDays(days);
    void refreshEvents(days);
  };

  const openEventSymbol = (ticker: string) => {
    const normalized = ticker.replace(/\s+/g, "").toUpperCase();
    const symbol = watchlist.find(
      (item) =>
        item.ticker.replace(/\s+/g, "").toUpperCase() === normalized ||
        (item.providerSymbol ?? "").replace(/\s+/g, "").toUpperCase() === normalized,
    );

    setShowEvents(false);
    if (symbol) {
      chooseSymbol(symbol);
      return;
    }

    setQuery(ticker);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const toggleActiveWatchlist = () => {
    setWatchlist((current) => {
      const exists = current.some((item) => item.id === active.id);
      const next = exists
        ? current.filter((item) => item.id !== active.id)
        : [active, ...current].slice(0, 50);
      saveWatchlist(next);
      return next;
    });
  };

  const chooseSymbol = (symbol: MarketSymbol) => {
    setActive(symbol);
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    if (comparisonSymbol?.id === symbol.id) {
      setComparisonSymbol(null);
      setComparisonCandles([]);
    }
    addToWatchlist(symbol);
    saveSetting("marketos:symbol", symbol.id);
    saveSetting("marketos:symbol-object", JSON.stringify(symbol));
    setDrawingHistory(createDrawingHistory(loadDrawings(symbol.id)));
    setDrawingTool("cursor");
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setHoverCandle(null);
    setQuery("");
    setAiResult(null);
  };

  const chooseTimeframe = (value: Timeframe) => {
    setTimeframe(value);
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    saveSetting("marketos:timeframe", value);
    setDrawingTool("cursor");
    setHoverCandle(null);
    setAiResult(null);
  };

  const chooseChartView = (value: ChartView) => {
    setChartView(value);
    saveSetting("marketos:chart-view", value);
  };

  const toggleIndicator = (id: IndicatorId) => {
    setIndicators((current) => {
      const next = { ...current, [id]: !current[id] };
      saveIndicatorSelection(next);
      return next;
    });
  };

  const commitDrawingChange = useCallback((
    updater: ChartDrawing[] | ((current: ChartDrawing[]) => ChartDrawing[]),
  ) => {
    setDrawingHistory((currentHistory) => {
      const current = currentHistory.present;
      const nextDrawings =
        typeof updater === "function"
          ? updater(current)
          : updater;
      const nextHistory = commitDrawingHistory(currentHistory, nextDrawings);
      saveDrawings(active.id, nextHistory.present);
      return nextHistory;
    });
  }, [active.id]);

  const handleDrawingCreated = useCallback((drawing: ChartDrawing) => {
    commitDrawingChange((current) => [
      ...current,
      withDrawingMeta(drawing),
    ]);
  }, [commitDrawingChange]);

  const deleteDrawing = (id: string) => {
    commitDrawingChange((current) =>
      current.filter((drawing) => drawing.id !== id || drawing.locked),
    );
  };

  const toggleDrawingHidden = (id: string) => {
    commitDrawingChange((current) =>
      current.map((drawing) =>
        drawing.id === id
          ? { ...drawing, hidden: !drawing.hidden }
          : drawing,
      ),
    );
  };

  const toggleDrawingLocked = (id: string) => {
    commitDrawingChange((current) =>
      current.map((drawing) =>
        drawing.id === id
          ? { ...drawing, locked: !drawing.locked }
          : drawing,
      ),
    );
  };

  const clearDrawings = () => {
    commitDrawingChange((current) => current.filter((drawing) => drawing.locked));
    setDrawingTool("cursor");
    setTextAnchor(null);
    setEditingTextId(null);
  };

  const undoDrawings = useCallback(() => {
    setDrawingHistory((current) => {
      const next = undoDrawingHistory(current);
      saveDrawings(active.id, next.present);
      return next;
    });
  }, [active.id]);

  const redoDrawings = useCallback(() => {
    setDrawingHistory((current) => {
      const next = redoDrawingHistory(current);
      saveDrawings(active.id, next.present);
      return next;
    });
  }, [active.id]);

  const requestTextAnchor = useCallback((point: DrawingPoint) => {
    setTextAnchor(point);
    setTextDraft("");
    setEditingTextId(null);
  }, []);

  const editTextDrawing = (drawing: ChartDrawing) => {
    if (drawing.type !== "text" || drawing.locked) return;
    setTextAnchor(drawing.point);
    setTextDraft(drawing.text);
    setEditingTextId(drawing.id);
  };

  const saveTextDrawing = () => {
    const text = textDraft.trim();
    if (!text || !textAnchor) return;

    if (editingTextId) {
      commitDrawingChange((current) =>
        current.map((drawing) =>
          drawing.id === editingTextId && drawing.type === "text" && !drawing.locked
            ? { ...drawing, text }
            : drawing,
        ),
      );
    } else {
      handleDrawingCreated({
        id: createDrawingId(),
        type: "text",
        point: textAnchor,
        text,
      });
    }

    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setDrawingTool("cursor");
  };

  const cancelTextDrawing = () => {
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setDrawingTool("cursor");
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        setDrawingTool("cursor");
        setTextAnchor(null);
        setTextDraft("");
        setEditingTextId(null);
        return;
      }

      if (
        editable ||
        showScreener ||
        showEvents ||
        showSystemPanel ||
        showStrategyTester ||
        showIndicatorLab ||
        showCompanyFeed
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDrawings();
        else undoDrawings();
        return;
      }

      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDrawings();
        return;
      }

      if (modifier || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "v") setDrawingTool("cursor");
      if (key === "l") setDrawingTool("trend");
      if (key === "h") setDrawingTool("horizontal");
      if (key === "m") setDrawingTool("measure");
      if (key === "n") setDrawingTool("text");
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    redoDrawings,
    undoDrawings,
    showScreener,
    showEvents,
    showSystemPanel,
    showStrategyTester,
    showIndicatorLab,
    showCompanyFeed,
  ]);

  const chooseComparison = (symbol: MarketSymbol) => {
    if (symbol.id === active.id) return;
    setComparisonSymbol(symbol);
    setShowComparisonMenu(false);
  };

  const chooseLayoutMode = (mode: ChartLayoutMode) => {
    if (mode === "split" && !comparisonSymbol) return;
    setLayoutMode(mode);
    saveSetting("marketos:chart-layout", mode);
  };

  const startReplay = () => {
    if (candles.length < 25) return;
    setReplayActive(true);
    setReplayPlaying(false);
    setReplayIndex(Math.max(20, candles.length - 60));
    setHoverCandle(null);
  };

  const exitReplay = () => {
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    setHoverCandle(null);
  };

  const stepReplay = (delta: number) => {
    setReplayIndex((current) => {
      const base = current ?? Math.max(20, candles.length - 60);
      return Math.min(Math.max(20, base + delta), Math.max(20, candles.length - 1));
    });
  };

  const addAdvancedAlert = (
    alertTimeframe: Timeframe,
    logic: AlertLogic,
    conditions: AdvancedAlertCondition[],
  ) => {
    const alert = createAdvancedAlert(
      active,
      alertTimeframe,
      logic,
      conditions,
    );

    setAlerts((current) => {
      const next = [alert, ...current].slice(0, 100);
      saveAlerts(next);
      return next;
    });
    setAlertCheckMessage(
      `تم إنشاء تنبيه ${active.ticker} على ${alertTimeframe.toUpperCase()}.`,
    );
  };

  const deleteAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.filter((alert) => alert.id !== id);
      saveAlerts(next);
      return next;
    });
  };

  const rearmAdvancedAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.map((alert) =>
        alert.id === id ? rearmAlert(alert) : alert,
      );
      saveAlerts(next);
      return next;
    });
  };

  const toggleAdvancedAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.map((alert) =>
        alert.id === id ? toggleAlertEnabled(alert) : alert,
      );
      saveAlerts(next);
      return next;
    });
  };

  const checkAllAdvancedAlerts = async () => {
    if (alertsChecking) return;

    const pending = alerts.filter(
      (alert) => alert.enabled && !alert.triggeredAt,
    );
    if (pending.length === 0) {
      setAlertCheckMessage("لا توجد تنبيهات نشطة للفحص.");
      return;
    }

    const groups = new Map<string, {
      symbol: MarketSymbol;
      timeframe: Timeframe;
    }>();

    for (const alert of pending) {
      const key = `${alert.symbol.id}|${alert.timeframe}`;
      if (!groups.has(key)) {
        groups.set(key, {
          symbol: alert.symbol,
          timeframe: alert.timeframe,
        });
      }
    }

    const entries = [...groups.values()].slice(0, 20);
    setAlertsChecking(true);
    setAlertCheckMessage(null);

    const snapshots = await Promise.allSettled(
      entries.map(async (entry) => {
        const [candleResponse, quoteResponse] = await Promise.all([
          getMarketCandles(entry.symbol, entry.timeframe, 220),
          getMarketQuote(entry.symbol),
        ]);
        return {
          ...entry,
          candles: candleResponse.candles,
          quote: quoteResponse.quote,
        };
      }),
    );

    let nextAlerts = alerts;
    let triggeredCount = 0;
    let failedCount = 0;

    for (const snapshot of snapshots) {
      if (snapshot.status === "rejected") {
        failedCount += 1;
        continue;
      }

      const result = evaluateAdvancedAlerts(nextAlerts, {
        symbol: snapshot.value.symbol,
        timeframe: snapshot.value.timeframe,
        candles: snapshot.value.candles,
        quote: snapshot.value.quote,
      });
      nextAlerts = result.alerts;
      triggeredCount += result.triggered.length;
    }

    setAlerts(nextAlerts);
    saveAlerts(nextAlerts);
    setAlertsChecking(false);

    const skipped = groups.size > entries.length
      ? groups.size - entries.length
      : 0;

    setAlertCheckMessage(
      [
        `تم فحص ${entries.length} مجموعة رمز/فريم`,
        `تفعّل ${triggeredCount}`,
        failedCount > 0 ? `تعذر ${failedCount}` : "",
        skipped > 0 ? `مؤجل ${skipped}` : "",
      ].filter(Boolean).join(" · "),
    );

    if (triggeredCount > 0) {
      const latest = nextAlerts.find((alert) => alert.triggeredAt);
      if (latest) {
        setAlertMessage(
          `تنبيه ${latest.symbol.ticker} · ${latest.timeframe.toUpperCase()}: ${describeAdvancedAlert(latest)}`,
        );
        window.setTimeout(() => setAlertMessage(null), 7000);
      }
    }
  };

  const saveCurrentWorkspace = () => {
    const workspace = createWorkspace({
      name: `تخطيط ${savedWorkspaces.length + 1}`,
      symbol: active,
      timeframe,
      chartView,
      indicators,
      drawings,
    });

    setSavedWorkspaces((current) => {
      const next = [workspace, ...current].slice(0, 12);
      saveWorkspaces(next);
      return next;
    });
    setShowWorkspaceMenu(true);
  };

  const restoreWorkspace = (workspace: SavedWorkspace) => {
    setActive(workspace.symbol);
    setTimeframe(workspace.timeframe);
    setChartView(workspace.chartView);
    setIndicators(workspace.indicators);
    setDrawingHistory(createDrawingHistory(workspace.drawings));
    setDrawingTool("cursor");
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setHoverCandle(null);
    setAiResult(null);
    addToWatchlist(workspace.symbol);

    saveSetting("marketos:symbol", workspace.symbol.id);
    saveSetting("marketos:symbol-object", JSON.stringify(workspace.symbol));
    saveSetting("marketos:timeframe", workspace.timeframe);
    saveSetting("marketos:chart-view", workspace.chartView);
    saveIndicatorSelection(workspace.indicators);
    saveDrawings(workspace.symbol.id, workspace.drawings);
    setShowWorkspaceMenu(false);
  };

  const deleteWorkspace = (id: string) => {
    setSavedWorkspaces((current) => {
      const next = current.filter((workspace) => workspace.id !== id);
      saveWorkspaces(next);
      return next;
    });
  };

  const runMultiTimeframeReading = async () => {
    if (multiTimeframeLoading) return;

    setMultiTimeframeLoading(true);
    setMultiTimeframeError(null);
    setMultiTimeframeResult(null);

    try {
      const result = await analyzeMultipleTimeframes(
        active,
        ["15m", "1h", "4h", "1d"],
        [
          ...activeIndicatorItems.map((item) => item.id),
          ...activeCustomIndicators.map((item) => `custom:${item.name}`),
        ],
        aiPrompt,
      );
      setMultiTimeframeResult(result);
    } catch (error) {
      setMultiTimeframeError(
        error instanceof Error
          ? error.message
          : "تعذر تشغيل التحليل متعدد الفريمات.",
      );
    } finally {
      setMultiTimeframeLoading(false);
    }
  };

  const runChartReading = async (promptOverride?: string) => {
    if (displayCandles.length < 20 || aiLoading) {
      if (displayCandles.length < 20) {
        setAiResult({
          engine: "browser-fallback",
          summary: "لا توجد شموع كافية لقراءة الشارت حاليًا.",
          observations: [],
        });
      }
      return;
    }

    const requestedPrompt = promptOverride ?? aiPrompt;
    setAiLoading(true);
    setAiResult(null);

    try {
      const analysis = await analyzeChart({
        symbol: active,
        timeframe,
        visibleCandles: displayCandles.slice(-300),
        quote,
        indicators: [
          ...activeIndicatorItems.map((item) => item.id),
          ...activeCustomIndicators.map((indicator) => `custom:${indicator.name}`),
        ],
        userDrawings: drawings
          .filter((drawing) => !drawing.hidden)
          .map((drawing) => {
            if (drawing.type === "horizontal") {
              return { type: "horizontal" as const, price: drawing.price };
            }
            if (drawing.type === "text") {
              return {
                type: "text" as const,
                point: drawing.point,
                text: drawing.text,
              };
            }
            return {
              type: drawing.type,
              points: drawing.points,
            };
          }),
        prompt: requestedPrompt,
      });

      setAiResult({
        engine: analysis.engine,
        summary: analysis.summary,
        observations: analysis.observations,
      });
    } catch {
      const recent = displayCandles.slice(-20);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const high = Math.max(...recent.map((candle) => candle.high));
      const low = Math.min(...recent.map((candle) => candle.low));
      const sma20 = recent.reduce((sum, candle) => sum + candle.close, 0) / recent.length;
      const move = ((last.close - first.open) / first.open) * 100;
      const relativeToSma = last.close >= sma20 ? "فوق" : "تحت";
      const indicatorNames = [
        ...activeIndicatorItems.map((item) => item.name),
        ...activeCustomIndicators.map((indicator) => indicator.name),
      ];
      const indicatorText = indicatorNames.length
        ? indicatorNames.join("، ")
        : "بدون مؤشرات إضافية";

      setAiResult({
        engine: "browser-fallback",
        summary: `${active.ticker} على ${timeframe.toUpperCase()}: قراءة محلية لأن API غير متاح حاليًا.`,
        observations: [
          `آخر سعر ${formatPrice(last.close)}، وحركة آخر 20 شمعة ${formatPercent(move)}.`,
          `النطاق الأخير ${formatPrice(low)} – ${formatPrice(high)}، والسعر ${relativeToSma} متوسط 20 شمعة.`,
          `المؤشرات النشطة: ${indicatorText}. الرسومات المحفوظة: ${drawings.length}.`,
        ],
      });
    } finally {
      setAiLoading(false);
    }
  };

  const drawingHint =
    drawingTool === "trend"
      ? "أداة الترند: انقر نقطتين على الشارت"
      : drawingTool === "horizontal"
        ? "الخط الأفقي: انقر على مستوى السعر"
        : drawingTool === "zone"
          ? "منطقة السعر: انقر زاويتين للمستطيل"
          : drawingTool === "fibonacci"
            ? "Fibonacci: اختر البداية ثم النهاية"
            : drawingTool === "measure"
              ? "القياس: اختر نقطة البداية ثم النهاية"
              : drawingTool === "text"
                ? "الملاحظة: انقر مكان النص على الشارت"
                : null;

  const manualFilteredOverview = useMemo(
    () => overview.filter((item) => overviewMatchesFilter(item, screenerFilter)),
    [overview, screenerFilter],
  );

  const smartScreenerParsed = useMemo(
    () => parseSmartScreenerQuery(appliedSmartScreenerQuery),
    [appliedSmartScreenerQuery],
  );

  const smartScreenerActive =
    appliedSmartScreenerQuery.trim().length > 0 &&
    smartScreenerParsed.recognized.length > 0;

  const filteredOverview = useMemo(
    () =>
      smartScreenerActive
        ? applySmartScreener(manualFilteredOverview, smartScreenerParsed.rule)
        : manualFilteredOverview,
    [manualFilteredOverview, smartScreenerActive, smartScreenerParsed.rule],
  );

  const sortedOverview = useMemo(
    () =>
      smartScreenerActive && smartScreenerParsed.rule.sortBy
        ? filteredOverview
        : [...filteredOverview].sort(
            (a, b) => (b.quote.percentChange ?? 0) - (a.quote.percentChange ?? 0),
          ),
    [filteredOverview, smartScreenerActive, smartScreenerParsed.rule.sortBy],
  );

  const applySmartQuery = () => {
    const trimmed = smartScreenerQuery.trim();
    setAppliedSmartScreenerQuery(trimmed);
  };

  const clearSmartQuery = () => {
    setSmartScreenerQuery("");
    setAppliedSmartScreenerQuery("");
  };

  const screenerAdvancers = filteredOverview.filter((item) => (item.quote.percentChange ?? 0) > 0).length;
  const screenerDecliners = filteredOverview.filter((item) => (item.quote.percentChange ?? 0) < 0).length;
  const screenerAverageMove = filteredOverview.length
    ? filteredOverview.reduce((sum, item) => sum + (item.quote.percentChange ?? 0), 0) / filteredOverview.length
    : 0;

  const activeAlerts = alerts.filter(
    (alert) => alert.enabled && !alert.triggeredAt,
  );

  const watchlistAlertCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of activeAlerts) {
      counts.set(
        alert.symbol.id,
        (counts.get(alert.symbol.id) ?? 0) + 1,
      );
    }
    return counts;
  }, [activeAlerts]);
  const replayDateLabel = replayActive && lastCandle
    ? new Date(lastCandle.time * 1000).toLocaleString("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const ignoreDrawingCreated = useCallback((_drawing: ChartDrawing) => undefined, []);

  const primaryChartNode = (
    <div className="chart-host primary-chart-host">
      {inspectedCandle ? (
        <div className="ohlc-legend" dir="ltr">
          <span>O <b>{formatPrice(inspectedCandle.open)}</b></span>
          <span>H <b>{formatPrice(inspectedCandle.high)}</b></span>
          <span>L <b>{formatPrice(inspectedCandle.low)}</b></span>
          <span>C <b className={inspectedCandle.close >= inspectedCandle.open ? "positive" : "negative"}>
            {formatPrice(inspectedCandle.close)}
          </b></span>
          {inspectedCandle.volume !== undefined ? (
            <span>V <b>{Math.round(inspectedCandle.volume).toLocaleString("en-US")}</b></span>
          ) : null}
        </div>
      ) : null}
      <MarketChart
        candles={displayCandles}
        timeframe={timeframe}
        chartView={chartView}
        indicators={indicators}
        customIndicators={customIndicators}
        drawings={drawings}
        drawingTool={drawingTool}
        onDrawingCreated={handleDrawingCreated}
        onTextAnchorRequested={requestTextAnchor}
        onCrosshairCandle={setHoverCandle}
        comparison={
          layoutMode === "single" && comparisonSymbol && displayComparisonCandles.length > 0
            ? { symbol: comparisonSymbol, candles: displayComparisonCandles }
            : null
        }
      />
      {textAnchor ? (
        <div className="text-note-composer" dir="rtl">
          <div className="text-note-title">
            {editingTextId ? "تعديل الملاحظة" : "ملاحظة جديدة"}
          </div>
          <input
            autoFocus
            value={textDraft}
            maxLength={120}
            onChange={(event) => setTextDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTextDrawing();
              if (event.key === "Escape") cancelTextDrawing();
            }}
            placeholder="اكتب ملاحظتك على الشارت"
          />
          <div className="text-note-actions">
            <button onClick={cancelTextDrawing}>إلغاء</button>
            <button className="primary" onClick={saveTextDrawing} disabled={!textDraft.trim()}>
              حفظ
            </button>
          </div>
        </div>
      ) : null}
      {dataState === "loading" && !replayActive ? <div className="chart-state">تحميل بيانات السوق…</div> : null}
      {dataState === "fallback" ? <div className="chart-mode">DEMO</div> : <div className="chart-mode live">DATA</div>}
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
      {drawingHint ? <div className="drawing-hint">{drawingHint}</div> : null}
    </div>
  );

  const secondaryChartNode = comparisonSymbol && displayComparisonCandles.length > 0 ? (
    <div className="chart-host secondary-chart-host">
      <div className="secondary-chart-label" dir="ltr">
        <strong>{comparisonSymbol.ticker}</strong>
        <span>{comparisonSymbol.exchange}</span>
      </div>
      <MarketChart
        candles={displayComparisonCandles}
        timeframe={timeframe}
        chartView={chartView}
        indicators={indicators}
        customIndicators={customIndicators}
        drawings={[]}
        drawingTool="cursor"
        onDrawingCreated={ignoreDrawingCreated}
        comparison={null}
      />
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
    </div>
  ) : null;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">MarketOS <span>alpha</span></div>
          <div className="tagline">Professional charts, market intelligence, AI-native workflow</div>
        </div>
        <div className="top-actions">
          <div className="status-pill" title={providerStatus?.message}>
            <span className={`status-dot ${dataState}`} />
            {providerLabel}
          </div>

          <button className="ghost-button market-button" onClick={openScreener}>
            السوق
          </button>

          <button className="ghost-button events-button" onClick={openEvents}>
            الأحداث {marketEvents.length > 0 ? `(${marketEvents.length})` : ""}
          </button>

          <button className="ghost-button company-feed-button" onClick={openCompanyFeed}>
            الشركات {companyReleases.length > 0 ? `(${companyReleases.length})` : ""}
          </button>

          <button className="ghost-button strategy-button" onClick={() => setShowStrategyTester(true)}>
            الاختبار
          </button>

          <button className="ghost-button system-button" onClick={openSystemPanel}>
            النظام
          </button>

          <div className="alert-menu-wrap">
            <button
              className={activeAlerts.length > 0 ? "ghost-button alerts-v2-button active" : "ghost-button alerts-v2-button"}
              onClick={() => setShowAlertMenu(true)}
            >
              التنبيهات {activeAlerts.length > 0 ? `(${activeAlerts.length})` : ""}
            </button>
          </div>

          <div className="workspace-menu-wrap">
            <button className="ghost-button" onClick={() => setShowWorkspaceMenu((value) => !value)}>
              التخطيطات {savedWorkspaces.length > 0 ? `(${savedWorkspaces.length})` : ""}
            </button>

            {showWorkspaceMenu ? (
              <div className="workspace-popover" dir="rtl">
                <button className="save-workspace-button" onClick={saveCurrentWorkspace}>
                  + حفظ التخطيط الحالي
                </button>
                <div className="workspace-list">
                  {savedWorkspaces.map((workspace) => (
                    <div className="workspace-row" key={workspace.id}>
                      <button className="workspace-open" onClick={() => restoreWorkspace(workspace)}>
                        <strong>{workspace.name}</strong>
                        <small>{workspace.symbol.ticker} · {workspace.timeframe.toUpperCase()}</small>
                      </button>
                      <button className="workspace-delete" onClick={() => deleteWorkspace(workspace.id)} title="حذف">×</button>
                    </div>
                  ))}
                  {savedWorkspaces.length === 0 ? (
                    <div className="workspace-empty">ما عندك تخطيطات محفوظة إلى الآن</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <IndicatorLab
        open={showIndicatorLab}
        indicators={customIndicators}
        onChange={updateCustomIndicators}
        onClose={() => setShowIndicatorLab(false)}
      />

      <StrategyTester
        open={showStrategyTester}
        candles={displayCandles}
        symbol={active}
        timeframe={timeframe}
        onClose={() => setShowStrategyTester(false)}
      />

      <CompanyFeedPanel
        open={showCompanyFeed}
        releases={companyReleases}
        provider={companyFeedProvider}
        loading={companyFeedLoading}
        error={companyFeedError}
        onRefresh={() => void refreshCompanyFeed()}
        onClose={() => setShowCompanyFeed(false)}
        onSelectSymbol={openCompanyFeedSymbol}
      />

      <AdvancedAlertsPanel
        open={showAlertMenu}
        symbol={active}
        currentTimeframe={timeframe}
        currentPrice={displayedPrice}
        alerts={alerts}
        checking={alertsChecking}
        checkMessage={alertCheckMessage}
        onCreate={addAdvancedAlert}
        onDelete={deleteAlert}
        onRearm={rearmAdvancedAlert}
        onToggleEnabled={toggleAdvancedAlert}
        onCheckAll={() => void checkAllAdvancedAlerts()}
        onClose={() => setShowAlertMenu(false)}
      />

      <SystemPanel
        open={showSystemPanel}
        health={systemHealth}
        loading={systemHealthLoading}
        error={systemHealthError}
        onRefresh={() => void refreshSystemHealth()}
        onClose={() => setShowSystemPanel(false)}
      />

      {showEvents ? (
        <MarketEventsPanel
          events={marketEvents}
          provider={eventsProvider}
          rangeDays={eventsRangeDays}
          loading={eventsLoading}
          error={eventsError}
          onRangeChange={changeEventsRange}
          onRefresh={() => void refreshEvents(eventsRangeDays)}
          onClose={() => setShowEvents(false)}
          onSelectSymbol={openEventSymbol}
        />
      ) : null}

      {showScreener ? (
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Market Screener">
          <button
            className="scanner-backdrop"
            aria-label="إغلاق"
            onClick={() => setShowScreener(false)}
          />
          <section className="scanner-panel" dir="rtl">
            <header className="scanner-header">
              <div>
                <span className="scanner-eyebrow">MARKETOS SCREENER</span>
                <h2>خريطة السوق</h2>
                <p>لقطة مجمعة من قائمة متابعتك · المصدر: {overviewProvider}</p>
              </div>
              <div className="scanner-header-actions">
                <button onClick={() => void refreshScreener()} disabled={overviewLoading}>
                  {overviewLoading ? "تحديث…" : "تحديث"}
                </button>
                <button className="scanner-close" onClick={() => setShowScreener(false)}>×</button>
              </div>
            </header>

            <div className="smart-screener-box">
              <div className="smart-screener-head">
                <div>
                  <span className="smart-screener-eyebrow">SMART SCREENER</span>
                  <strong>اسأل السوق</strong>
                </div>
                {smartScreenerActive ? (
                  <button className="smart-screener-clear" onClick={clearSmartQuery}>
                    مسح
                  </button>
                ) : null}
              </div>

              <div className="smart-screener-input-row">
                <input
                  value={smartScreenerQuery}
                  onChange={(event) => setSmartScreenerQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySmartQuery();
                  }}
                  placeholder="مثال: الأسهم الصاعدة أكثر من 2% والحجم فوق 1M"
                />
                <button onClick={applySmartQuery} disabled={!smartScreenerQuery.trim()}>
                  تطبيق
                </button>
              </div>

              <div className="smart-screener-examples">
                {[
                  "الأسهم الصاعدة أكثر من 2%",
                  "crypto down below -3%",
                  "الحجم فوق 1M أعلى 5",
                  "السعر تحت 100 والحجم فوق 500K",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setSmartScreenerQuery(example);
                      setAppliedSmartScreenerQuery(example);
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>

              {appliedSmartScreenerQuery.trim() ? (
                <div className={smartScreenerActive ? "smart-screener-summary active" : "smart-screener-summary"}>
                  <span>
                    {smartScreenerActive
                      ? smartScreenerParsed.summary
                      : "ما تعرفت على فلتر واضح. جرّب نسبة تغير أو سعر أو حجم أو نوع سوق."}
                  </span>
                  <b>{filteredOverview.length} نتيجة</b>
                </div>
              ) : null}
            </div>

            <div className="scanner-controls">
              <div className="scanner-filter-row">
                {([
                  ["all", "الكل"],
                  ["equities", "الأسهم"],
                  ["forex", "فوركس"],
                  ["crypto", "كريبتو"],
                  ["futures", "عقود وسلع"],
                ] as Array<[ScreenerFilter, string]>).map(([id, label]) => (
                  <button
                    className={screenerFilter === id ? "selected" : ""}
                    key={id}
                    onClick={() => setScreenerFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="scanner-mode-toggle">
                <button
                  className={screenerMode === "heatmap" ? "selected" : ""}
                  onClick={() => setScreenerMode("heatmap")}
                >
                  Heatmap
                </button>
                <button
                  className={screenerMode === "table" ? "selected" : ""}
                  onClick={() => setScreenerMode("table")}
                >
                  جدول
                </button>
              </div>
            </div>

            <div className="scanner-breadth">
              <div>
                <span>المتابعة</span>
                <strong>{filteredOverview.length}</strong>
              </div>
              <div>
                <span>صاعد</span>
                <strong className="positive">{screenerAdvancers}</strong>
              </div>
              <div>
                <span>هابط</span>
                <strong className="negative">{screenerDecliners}</strong>
              </div>
              <div>
                <span>متوسط الحركة</span>
                <strong className={screenerAverageMove >= 0 ? "positive" : "negative"}>
                  {formatPercent(screenerAverageMove)}
                </strong>
              </div>
            </div>

            {overviewError ? <div className="scanner-warning">{overviewError}</div> : null}

            <div className="scanner-content">
              {overviewLoading && overview.length === 0 ? (
                <div className="scanner-loading">جاري قراءة السوق…</div>
              ) : screenerMode === "heatmap" ? (
                <div className="heatmap-grid">
                  {sortedOverview.map((item) => {
                    const movement = item.quote.percentChange ?? 0;
                    const intensity =
                      Math.abs(movement) >= 3
                        ? "strong"
                        : Math.abs(movement) >= 1
                          ? "medium"
                          : "soft";
                    const direction = movement > 0 ? "gain" : movement < 0 ? "loss" : "flat";

                    return (
                      <button
                        className={`heatmap-tile ${direction} ${intensity}`}
                        key={item.symbol.id}
                        onClick={() => {
                          chooseSymbol(item.symbol);
                          setShowScreener(false);
                        }}
                      >
                        <span className="heatmap-symbol">{item.symbol.ticker}</span>
                        <span className="heatmap-price">{formatPrice(item.quote.price)}</span>
                        <strong>{formatPercent(movement)}</strong>
                        <small>{item.symbol.exchange}</small>
                      </button>
                    );
                  })}
                  {sortedOverview.length === 0 ? (
                    <div className="scanner-empty">لا توجد رموز لهذا الفلتر.</div>
                  ) : null}
                </div>
              ) : (
                <div className="scanner-table-wrap">
                  <table className="scanner-table">
                    <thead>
                      <tr>
                        <th>الرمز</th>
                        <th>السوق</th>
                        <th>السعر</th>
                        <th>التغير</th>
                        <th>الحجم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOverview.map((item) => {
                        const movement = item.quote.percentChange ?? 0;
                        return (
                          <tr
                            key={item.symbol.id}
                            onClick={() => {
                              chooseSymbol(item.symbol);
                              setShowScreener(false);
                            }}
                          >
                            <td>
                              <strong>{item.symbol.ticker}</strong>
                              <small>{item.symbol.name}</small>
                            </td>
                            <td>{item.symbol.exchange}</td>
                            <td dir="ltr">{formatPrice(item.quote.price)}</td>
                            <td className={movement >= 0 ? "positive" : "negative"} dir="ltr">
                              {formatPercent(movement)}
                            </td>
                            <td dir="ltr">{formatVolume(item.quote.volume)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {alertMessage ? <div className="alert-toast">{alertMessage}</div> : null}

      <section className="market-strip" dir="ltr">
        <span>MARKET DATA <b>{providerStatus?.provider ?? "detecting"}</b></span>
        <span>SESSION <b className={sessionState === "open" ? "positive" : sessionState === "closed" ? "negative" : ""}>{sessionLabel}</b></span>
        <span>AUTO <b>{autoRefreshEnabled && !replayActive ? "ON" : "OFF"}</b></span>
        <span>US EQUITIES</span>
        <span>SAUDI EXCHANGE</span>
        <span>FOREX</span>
        <span>CRYPTO</span>
        <span>FUTURES</span>
      </section>

      <section className="workspace">
        <aside className="watchlist panel">
          <div className="watchlist-head">
            <div className="panel-title">{query.trim() ? "نتائج البحث" : "قائمة المتابعة"}</div>
            <div className="watchlist-head-actions">
              <button
                title="تحديث أسعار القائمة"
                onClick={() => void refreshWatchlistOverview(true)}
                disabled={watchlistLoading || replayActive}
              >
                {watchlistLoading ? "…" : "↻"}
              </button>
              <button title="بحث وإضافة رمز" onClick={() => searchInputRef.current?.focus()}>+</button>
            </div>
          </div>

          <div className="search-box">
            <span>{searchLoading ? "…" : "⌕"}</span>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن سهم أو سوق"
            />
          </div>

          {!query.trim() ? (
            <div className="watchlist-controls">
              <select
                value={watchlistFilter}
                onChange={(event) => {
                  const value = event.target.value as WatchlistFilter;
                  setWatchlistFilter(value);
                  saveSetting("marketos:watchlist-filter", value);
                }}
                aria-label="فلتر قائمة المتابعة"
              >
                <option value="all">الكل</option>
                <option value="equities">أسهم</option>
                <option value="forex">فوركس</option>
                <option value="crypto">كريبتو</option>
                <option value="futures">عقود/سلع</option>
              </select>

              <select
                value={watchlistSort}
                onChange={(event) => {
                  const value = event.target.value as WatchlistSort;
                  setWatchlistSort(value);
                  saveSetting("marketos:watchlist-sort", value);
                }}
                aria-label="ترتيب قائمة المتابعة"
              >
                <option value="manual">ترتيب القائمة</option>
                <option value="change-desc">الأعلى حركة</option>
                <option value="change-asc">الأقل حركة</option>
                <option value="symbol">الرمز A-Z</option>
              </select>
            </div>
          ) : null}

          <div className="symbol-list watchlist-v2-list">
            {visibleSymbols.map((symbol) => {
              const rowQuote =
                watchlistQuoteMap.get(symbol.id) ??
                (symbol.id === active.id ? quote ?? undefined : undefined);
              const movement = rowQuote?.percentChange;
              const alertCount = watchlistAlertCounts.get(symbol.id) ?? 0;

              return (
                <button
                  className={`symbol-row watchlist-v2-row ${symbol.id === active.id ? "active" : ""}`}
                  key={symbol.id}
                  onClick={() => chooseSymbol(symbol)}
                >
                  <span className="symbol-meta">
                    <strong>
                      {symbol.ticker}
                      {alertCount > 0 ? (
                        <em className="watchlist-alert-count" title={`${alertCount} تنبيه نشط`}>
                          {alertCount}
                        </em>
                      ) : null}
                    </strong>
                    <small>{symbol.exchange}</small>
                    <small className="watchlist-asset-label">{symbol.assetClass}</small>
                  </span>

                  <span className="watchlist-quote-cell" dir="ltr">
                    <strong>{formatPrice(rowQuote?.price)}</strong>
                    <small className={
                      movement === undefined
                        ? ""
                        : movement >= 0
                          ? "positive"
                          : "negative"
                    }>
                      {formatPercent(movement)}
                    </small>
                  </span>
                </button>
              );
            })}
            {visibleSymbols.length === 0 ? <div className="empty-search">لا توجد نتائج</div> : null}
          </div>

          {!query.trim() ? (
            <div className="watchlist-footer">
              <span>{watchlistProvider}</span>
              <span>
                {watchlistUpdatedAt
                  ? new Date(watchlistUpdatedAt).toLocaleTimeString("ar-SA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
              {watchlistError ? <small>{watchlistError}</small> : null}
            </div>
          ) : null}
        </aside>

        <section className="chart-area panel">
          <div className="instrument-bar">
            <div className="instrument-id">
              <button
                className={isActiveWatchlisted ? "watch-star active" : "watch-star"}
                onClick={toggleActiveWatchlist}
                title={isActiveWatchlisted ? "إزالة من قائمة المتابعة" : "إضافة إلى قائمة المتابعة"}
              >
                {isActiveWatchlisted ? "★" : "☆"}
              </button>
              <div className="instrument-icon">{active.ticker.slice(0, 1)}</div>
              <div>
                <strong>{active.name}</strong>
                <span>{active.exchange}:{active.ticker}{active.currency ? ` · ${active.currency}` : ""}</span>
              </div>
            </div>

            <div className="quote-cluster">
              <div className="instrument-live-controls">
                <span className={`session-pill ${sessionState}`}>{sessionLabel}</span>
                <button
                  className="quote-refresh"
                  onClick={() => void refreshQuote(true)}
                  disabled={replayActive || quoteRefreshing}
                  title="تحديث السعر الآن"
                >
                  {quoteRefreshing ? "…" : "↻"}
                </button>
                <button
                  className={autoRefreshEnabled ? "auto-refresh-toggle active" : "auto-refresh-toggle"}
                  onClick={toggleAutoRefresh}
                  disabled={replayActive}
                  title="تحديث تلقائي كل 30 ثانية تقريبًا أثناء فتح الصفحة"
                >
                  Auto
                </button>
              </div>
              <div className="quote">
                <strong>{formatPrice(displayedPrice)}</strong>
                <span className={(displayedPercent ?? 0) >= 0 ? "positive" : "negative"}>
                  {formatPercent(displayedPercent)}
                </span>
                <small>{replayActive ? "REPLAY" : quote?.source ?? "fallback"} · {timeframe.toUpperCase()}</small>
                <small>آخر بيانات: {replayActive ? replayDateLabel ?? "—" : quoteTimeLabel}</small>
              </div>
            </div>
          </div>

          <div className="chart-toolbar">
            <div className="timeframes">
              {timeframes.map((tf) => (
                <button
                  className={tf === timeframe ? "selected" : ""}
                  key={tf}
                  onClick={() => chooseTimeframe(tf)}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="chart-tools">
              <button className={chartView === "candles" ? "selected" : ""} onClick={() => chooseChartView("candles")}>شموع</button>
              <button className={chartView === "line" ? "selected" : ""} onClick={() => chooseChartView("line")}>خط</button>
              <button className={chartView === "area" ? "selected" : ""} onClick={() => chooseChartView("area")}>مساحة</button>

              <div className="compare-menu-wrap">
                <button
                  className={comparisonSymbol ? "selected comparison-button" : "comparison-button"}
                  onClick={() => setShowComparisonMenu((value) => !value)}
                >
                  {comparisonSymbol ? `مقارنة: ${comparisonSymbol.ticker}` : "مقارنة"}
                </button>
                {comparisonSymbol ? (
                  <button className="comparison-clear" onClick={() => {
                    setComparisonSymbol(null);
                    setComparisonCandles([]);
                    setLayoutMode("single");
                    saveSetting("marketos:chart-layout", "single");
                  }}>×</button>
                ) : null}

                {showComparisonMenu ? (
                  <div className="compare-popover" dir="rtl">
                    <div className="indicator-popover-title">قارن مع</div>
                    {watchlist
                      .filter((symbol) => symbol.id !== active.id)
                      .slice(0, 12)
                      .map((symbol) => (
                        <button className="indicator-row" key={symbol.id} onClick={() => chooseComparison(symbol)}>
                          <span>
                            <strong>{symbol.ticker}</strong>
                            <small>{symbol.name}</small>
                          </span>
                          <b>+</b>
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>

              <div className="drawing-menu-wrap">
                <button
                  className={drawings.length > 0 ? "selected" : ""}
                  onClick={() => setShowDrawingMenu((value) => !value)}
                >
                  الرسومات {drawings.length > 0 ? `(${drawings.length})` : ""}
                </button>
                {showDrawingMenu ? (
                  <div className="drawing-popover" dir="rtl">
                    <div className="indicator-popover-title">إدارة الرسومات</div>
                    {drawings.map((drawing) => (
                      <div
                        className={[
                          "drawing-row",
                          drawing.hidden ? "hidden" : "",
                          drawing.locked ? "locked" : "",
                        ].filter(Boolean).join(" ")}
                        key={drawing.id}
                      >
                        <span className="drawing-row-info">
                          <strong>
                            {drawingName(drawing)}
                            {drawing.locked ? " · مقفل" : ""}
                          </strong>
                          <small>{drawingDetail(drawing)}</small>
                        </span>
                        <div className="drawing-row-actions">
                          <button
                            onClick={() => toggleDrawingHidden(drawing.id)}
                            title={drawing.hidden ? "إظهار" : "إخفاء"}
                          >
                            {drawing.hidden ? "○" : "◉"}
                          </button>
                          <button
                            onClick={() => toggleDrawingLocked(drawing.id)}
                            title={drawing.locked ? "فتح القفل" : "قفل"}
                          >
                            {drawing.locked ? "🔒" : "🔓"}
                          </button>
                          {drawing.type === "text" ? (
                            <button
                              onClick={() => editTextDrawing(drawing)}
                              disabled={drawing.locked}
                              title="تعديل النص"
                            >
                              ✎
                            </button>
                          ) : null}
                          <button
                            onClick={() => deleteDrawing(drawing.id)}
                            disabled={drawing.locked}
                            title={drawing.locked ? "افتح القفل أولًا" : "حذف"}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {drawings.length === 0 ? <div className="workspace-empty">لا توجد رسومات</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="indicator-menu-wrap">
                <button
                  className={
                    activeIndicatorItems.length + activeCustomIndicators.length > 0
                      ? "selected"
                      : ""
                  }
                  onClick={() => setShowIndicatorMenu((value) => !value)}
                >
                  المؤشرات {
                    activeIndicatorItems.length + activeCustomIndicators.length > 0
                      ? `(${activeIndicatorItems.length + activeCustomIndicators.length})`
                      : ""
                  }
                </button>

                {showIndicatorMenu ? (
                  <div className="indicator-popover" dir="rtl">
                    <div className="indicator-popover-title">المؤشرات</div>
                    {indicatorCatalog.map((item) => (
                      <button
                        key={item.id}
                        className={indicators[item.id] ? "indicator-row enabled" : "indicator-row"}
                        onClick={() => toggleIndicator(item.id)}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.description}</small>
                        </span>
                        <b>{indicators[item.id] ? "✓" : "+"}</b>
                      </button>
                    ))}

                    {customIndicators.length > 0 ? (
                      <>
                        <div className="indicator-popover-title custom-title">مخصص</div>
                        {customIndicators.slice(0, 8).map((indicator) => (
                          <button
                            key={indicator.id}
                            className={indicator.enabled ? "indicator-row enabled" : "indicator-row"}
                            onClick={() => toggleCustomIndicator(indicator.id)}
                          >
                            <span>
                              <strong>{indicator.name}</strong>
                              <small dir="ltr">{indicator.formula}</small>
                            </span>
                            <b>{indicator.enabled ? "✓" : "+"}</b>
                          </button>
                        ))}
                      </>
                    ) : null}

                    <button
                      className="indicator-lab-launch"
                      onClick={() => {
                        setShowIndicatorMenu(false);
                        setShowIndicatorLab(true);
                      }}
                    >
                      <span>⚗ معمل المؤشرات</span>
                      <b>→</b>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={replayActive ? "replay-toolbar active" : "replay-toolbar"}>
            <div className="replay-main-actions">
              <button
                className={replayActive ? "replay-toggle active" : "replay-toggle"}
                onClick={replayActive ? exitReplay : startReplay}
              >
                {replayActive ? "خروج Replay" : "Replay"}
              </button>

              <div className="layout-toggle" title="تخطيط الشارت">
                <button
                  className={layoutMode === "single" ? "selected" : ""}
                  onClick={() => chooseLayoutMode("single")}
                >
                  1×
                </button>
                <button
                  className={layoutMode === "split" ? "selected" : ""}
                  onClick={() => chooseLayoutMode("split")}
                  disabled={!comparisonSymbol}
                  title={comparisonSymbol ? "شارتان جنبًا إلى جنب" : "اختر أصلًا للمقارنة أولًا"}
                >
                  2×
                </button>
              </div>
            </div>

            {replayActive ? (
              <div className="replay-controls" dir="ltr">
                <button onClick={() => stepReplay(-1)} disabled={safeReplayIndex <= 20}>‹</button>
                <button
                  className={replayPlaying ? "selected" : ""}
                  onClick={() => setReplayPlaying((value) => !value)}
                >
                  {replayPlaying ? "Ⅱ" : "▶"}
                </button>
                <button
                  onClick={() => stepReplay(1)}
                  disabled={safeReplayIndex >= candles.length - 1}
                >
                  ›
                </button>
                <input
                  type="range"
                  min={20}
                  max={Math.max(20, candles.length - 1)}
                  value={Math.max(20, safeReplayIndex)}
                  onChange={(event) => {
                    setReplayPlaying(false);
                    setReplayIndex(Number(event.target.value));
                    setHoverCandle(null);
                  }}
                />
                <span className="replay-progress">
                  {Math.min(candles.length, safeReplayIndex + 1)} / {candles.length}
                </span>
                <span className="replay-date">{replayDateLabel}</span>
              </div>
            ) : (
              <div className="replay-idle-note">إعادة تشغيل تاريخية من نفس بيانات الشارت</div>
            )}
          </div>

          <div className="chart-stage">
            <div className="drawing-rail">
              <button
                title="تراجع · Ctrl/Cmd+Z"
                onClick={undoDrawings}
                disabled={!canUndoDrawings(drawingHistory)}
              >
                ↶
              </button>
              <button
                title="إعادة · Ctrl/Cmd+Shift+Z"
                onClick={redoDrawings}
                disabled={!canRedoDrawings(drawingHistory)}
              >
                ↷
              </button>
              <span className="drawing-rail-separator" />
              <button
                className={drawingTool === "cursor" ? "selected" : ""}
                title="المؤشر والتحريك · V"
                onClick={() => setDrawingTool("cursor")}
              >
                ↖
              </button>
              <button
                className={drawingTool === "trend" ? "selected" : ""}
                title="خط الاتجاه · L"
                onClick={() => setDrawingTool("trend")}
              >
                ╱
              </button>
              <button
                className={drawingTool === "horizontal" ? "selected" : ""}
                title="خط أفقي · H"
                onClick={() => setDrawingTool("horizontal")}
              >
                ―
              </button>
              <button
                className={drawingTool === "zone" ? "selected" : ""}
                title="منطقة سعر"
                onClick={() => setDrawingTool("zone")}
              >
                ▭
              </button>
              <button
                className={drawingTool === "fibonacci" ? "selected" : ""}
                title="Fibonacci"
                onClick={() => setDrawingTool("fibonacci")}
              >
                ƒ
              </button>
              <button
                className={drawingTool === "measure" ? "selected" : ""}
                title="قياس · M"
                onClick={() => setDrawingTool("measure")}
              >
                ↕
              </button>
              <button
                className={drawingTool === "text" ? "selected" : ""}
                title="ملاحظة نصية · N"
                onClick={() => setDrawingTool("text")}
              >
                T
              </button>
              <span className="drawing-rail-separator" />
              <button
                title="مسح الرسومات غير المقفلة"
                onClick={clearDrawings}
                disabled={!drawings.some((drawing) => !drawing.locked)}
              >
                ⌫
              </button>
            </div>

            {layoutMode === "split" && secondaryChartNode ? (
              <div className="multi-chart-grid">
                {primaryChartNode}
                {secondaryChartNode}
              </div>
            ) : primaryChartNode}
          </div>
        </section>

        <aside className="ai-panel panel">
          <div className="panel-title">MarketOS AI</div>
          <div className="ai-card">
            <span className="eyebrow">CHART CONTEXT</span>
            <h2>اسأل الشارت</h2>
            <p>
              سياق الشارت يشمل OHLCV والفريم والمؤشرات النشطة والرسومات المحفوظة. هذي نفس الطبقة اللي بنوصلها بمحرك AI الفعلي.
            </p>
          </div>

          <div className="quick-prompts">
            <button onClick={() => runChartReading("اقرأ الاتجاه الحالي بشكل وصفي")}>اقرأ الاتجاه</button>
            <button onClick={() => runChartReading("حدد نطاق آخر 20 شمعة والمستويات المرسومة")}>حدد النطاق</button>
            <button onClick={() => runChartReading("اشرح الحركة والحجم والمؤشرات النشطة")}>اشرح الحركة</button>
          </div>

          <button
            className="multi-timeframe-button"
            onClick={() => void runMultiTimeframeReading()}
            disabled={multiTimeframeLoading}
          >
            <span>Multi‑Timeframe AI</span>
            <small>15m · 1h · 4h · 1d</small>
            <b>{multiTimeframeLoading ? "…" : "↗"}</b>
          </button>

          <div className="prompt-box">
            <textarea
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              maxLength={1200}
            />
            <button onClick={() => runChartReading()} disabled={aiLoading}>
              {aiLoading ? "جاري قراءة السياق…" : "قراءة الشارت"} <span>↗</span>
            </button>
          </div>

          {aiResult ? (
            <div className="ai-result">
              <strong>{aiResult.summary}</strong>
              {aiResult.observations.length > 0 ? (
                <ul>
                  {aiResult.observations.map((observation, index) => (
                    <li key={`${index}-${observation.slice(0, 12)}`}>{observation}</li>
                  ))}
                </ul>
              ) : null}
              <small>Engine: {aiResult.engine}</small>
            </div>
          ) : null}

          {multiTimeframeError ? (
            <div className="multi-timeframe-error">{multiTimeframeError}</div>
          ) : null}

          {multiTimeframeResult ? (
            <div className="multi-timeframe-result">
              <div className="multi-timeframe-summary">
                <span className={`multi-alignment ${multiTimeframeResult.alignment}`}>
                  {multiTimeframeResult.alignment === "up"
                    ? "توافق صاعد"
                    : multiTimeframeResult.alignment === "down"
                      ? "توافق هابط"
                      : multiTimeframeResult.alignment === "sideways"
                        ? "توافق جانبي"
                        : "توافق مختلط"}
                </span>
                <strong>{multiTimeframeResult.summary}</strong>
                <small>
                  النطاق المركب: {formatPrice(multiTimeframeResult.rangeLow)} – {formatPrice(multiTimeframeResult.rangeHigh)}
                </small>
              </div>

              <div className="multi-timeframe-grid">
                {multiTimeframeResult.items.map((item) => (
                  <article className={`multi-timeframe-card ${item.trend}`} key={item.timeframe}>
                    <div>
                      <strong>{item.timeframe.toUpperCase()}</strong>
                      <span>
                        {item.trend === "up" ? "صاعد" : item.trend === "down" ? "هابط" : "جانبي"}
                      </span>
                    </div>
                    <b className={item.analysis.metrics.change20 >= 0 ? "positive" : "negative"}>
                      {formatPercent(item.analysis.metrics.change20)}
                    </b>
                    <small>
                      SMA20 {item.analysis.metrics.distanceFromSma20 >= 0 ? "+" : ""}
                      {item.analysis.metrics.distanceFromSma20.toFixed(2)}%
                    </small>
                  </article>
                ))}
              </div>

              {multiTimeframeResult.failures.length > 0 ? (
                <div className="multi-timeframe-failures">
                  تعذر: {multiTimeframeResult.failures.map((item) => item.timeframe.toUpperCase()).join("، ")}
                </div>
              ) : null}

              <small className="multi-timeframe-engine">
                Engine: {multiTimeframeResult.engine}
              </small>
            </div>
          ) : null}

          <div className="context-grid">
            <div><span>الرمز</span><strong>{active.ticker}</strong></div>
            <div><span>الفريم</span><strong>{timeframe.toUpperCase()}</strong></div>
            <div><span>المؤشرات</span><strong>{activeIndicatorItems.length + activeCustomIndicators.length}</strong></div>
            <div><span>الرسومات</span><strong>{drawings.length}</strong></div>
            <div><span>المقارنة</span><strong>{comparisonSymbol?.ticker ?? "—"}</strong></div>
            <div><span>التنبيهات</span><strong>{activeAlerts.length}</strong></div>
            <div><span>الشموع</span><strong>{displayCandles.length}</strong></div>
            <div><span>المصدر</span><strong>{quote?.source ?? "fallback"}</strong></div>
          </div>

          <div className="notice">
            {dataError
              ? "وضع البيانات التجريبية نشط مؤقتًا لأن مصدر البيانات المباشر غير متصل."
              : providerStatus?.mode === "demo"
                ? "وضع البيانات التجريبية نشط للتطوير. عند ربط مزود السوق ستظهر البيانات من المصدر مباشرة."
                : providerStatus?.message ?? "Market Data V1 active."}
          </div>

          <div className="chart-attribution">
            Charts powered by{" "}
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              TradingView Lightweight Charts™
            </a>
          </div>
        </aside>
      </section>
    </main>
  );
}
