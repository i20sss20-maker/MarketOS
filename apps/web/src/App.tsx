import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Candle,
  ChartAnalysisResponse,
  MarketDataStatus,
  MarketOverviewItem,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import MarketChart, { type ChartView } from "./components/MarketChart";
import { analyzeChart } from "./lib/aiApi";
import { createDemoCandles, createDemoQuote } from "./lib/demoData";
import type { ChartDrawing, DrawingTool } from "./lib/drawings";
import {
  drawingDetail,
  drawingName,
  loadDrawings,
  saveDrawings,
} from "./lib/drawings";
import type { AlertCondition, PriceAlert } from "./lib/alerts";
import {
  createPriceAlert,
  evaluateAlerts,
  loadAlerts,
  saveAlerts,
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

export default function App() {
  const [active, setActive] = useState<MarketSymbol>(() => readSavedSymbol());
  const [timeframe, setTimeframe] = useState<Timeframe>(() => readSaved("marketos:timeframe", "1h"));
  const [chartView, setChartView] = useState<ChartView>(() => readSaved("marketos:chart-view", "candles"));
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [watchlist, setWatchlist] = useState<MarketSymbol[]>(() => loadWatchlist(initialSymbols));
  const [showScreener, setShowScreener] = useState(false);
  const [screenerMode, setScreenerMode] = useState<ScreenerMode>("heatmap");
  const [screenerFilter, setScreenerFilter] = useState<ScreenerFilter>("all");
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

  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadAlerts());
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [alertCondition, setAlertCondition] = useState<AlertCondition>("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Pick<ChartAnalysisResponse, "summary" | "observations" | "engine"> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("اقرأ الحركة الحالية ووضح أهم ما يظهر في الشارت");

  const [indicators, setIndicators] = useState<IndicatorSelection>(() => loadIndicatorSelection());
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => loadDrawings(active.id));

  const [candles, setCandles] = useState<Candle[]>(() => createDemoCandles(initialSymbols[0].ticker, "1h"));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [providerStatus, setProviderStatus] = useState<MarketDataStatus | null>(null);
  const [dataState, setDataState] = useState<"loading" | "provider" | "fallback">("fallback");
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MarketSymbol[]>(initialSymbols);
  const [searchLoading, setSearchLoading] = useState(false);

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

    const price = quote?.price ?? candles[candles.length - 1]?.close;
    if (!Number.isFinite(price)) return;

    const result = evaluateAlerts(alerts, active, price as number);
    if (result.triggered.length === 0) return;

    setAlerts(result.alerts);
    saveAlerts(result.alerts);
    const latest = result.triggered[result.triggered.length - 1];
    setAlertMessage(
      `تنبيه ${latest.symbol.ticker}: السعر ${latest.condition === "above" ? "وصل أو تجاوز" : "وصل أو نزل تحت"} ${formatPrice(latest.price)}`,
    );

    const timer = window.setTimeout(() => setAlertMessage(null), 7000);
    return () => window.clearTimeout(timer);
  }, [quote?.price, candles, active, replayActive]);

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

  const visibleSymbols = useMemo(
    () => query.trim() ? searchResults : watchlist,
    [query, searchResults, watchlist],
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

  const addToWatchlist = useCallback((symbol: MarketSymbol) => {
    setWatchlist((current) => {
      if (current.some((item) => item.id === symbol.id)) return current;
      const next = [symbol, ...current].slice(0, 50);
      saveWatchlist(next);
      return next;
    });
  }, []);

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
    setDrawings(loadDrawings(symbol.id));
    setDrawingTool("cursor");
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

  const handleDrawingCreated = useCallback((drawing: ChartDrawing) => {
    setDrawings((current) => {
      const next = [...current, drawing];
      saveDrawings(active.id, next);
      return next;
    });
  }, [active.id]);

  const deleteDrawing = (id: string) => {
    setDrawings((current) => {
      const next = current.filter((drawing) => drawing.id !== id);
      saveDrawings(active.id, next);
      return next;
    });
  };

  const clearDrawings = () => {
    setDrawings([]);
    saveDrawings(active.id, []);
    setDrawingTool("cursor");
  };

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

  const addAlert = () => {
    const price = Number(alertPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    const alert = createPriceAlert(active, alertCondition, price);
    setAlerts((current) => {
      const next = [alert, ...current].slice(0, 100);
      saveAlerts(next);
      return next;
    });
    setAlertPrice("");
  };

  const deleteAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.filter((alert) => alert.id !== id);
      saveAlerts(next);
      return next;
    });
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
    setDrawings(workspace.drawings);
    setDrawingTool("cursor");
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
        indicators: activeIndicatorItems.map((item) => item.id),
        userDrawings: drawings.map((drawing) =>
          drawing.type === "horizontal"
            ? { type: "horizontal", price: drawing.price }
            : { type: drawing.type, points: drawing.points },
        ),
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
      const indicatorText = activeIndicatorItems.length
        ? activeIndicatorItems.map((item) => item.name).join("، ")
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
            : null;

  const activeAlerts = alerts.filter((alert) => !alert.triggeredAt);
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
        drawings={drawings}
        drawingTool={drawingTool}
        onDrawingCreated={handleDrawingCreated}
        onCrosshairCandle={setHoverCandle}
        comparison={
          layoutMode === "single" && comparisonSymbol && displayComparisonCandles.length > 0
            ? { symbol: comparisonSymbol, candles: displayComparisonCandles }
            : null
        }
      />
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

          <div className="alert-menu-wrap">
            <button className="ghost-button" onClick={() => setShowAlertMenu((value) => !value)}>
              التنبيهات {activeAlerts.length > 0 ? `(${activeAlerts.length})` : ""}
            </button>

            {showAlertMenu ? (
              <div className="alert-popover" dir="rtl">
                <div className="alert-title">تنبيه سعر لـ {active.ticker}</div>
                <div className="alert-condition">
                  <button
                    className={alertCondition === "above" ? "selected" : ""}
                    onClick={() => setAlertCondition("above")}
                  >
                    أعلى من
                  </button>
                  <button
                    className={alertCondition === "below" ? "selected" : ""}
                    onClick={() => setAlertCondition("below")}
                  >
                    أقل من
                  </button>
                </div>
                <div className="alert-create">
                  <input
                    inputMode="decimal"
                    value={alertPrice}
                    onChange={(event) => setAlertPrice(event.target.value)}
                    placeholder={formatPrice(displayedPrice)}
                  />
                  <button onClick={addAlert}>إضافة</button>
                </div>
                <div className="alert-note">يتم فحص التنبيه أثناء فتح MarketOS وعند تحديث السعر.</div>
                <div className="alert-list">
                  {alerts.slice(0, 12).map((alert) => (
                    <div className={alert.triggeredAt ? "alert-row triggered" : "alert-row"} key={alert.id}>
                      <span>
                        <strong>{alert.symbol.ticker} · {alert.condition === "above" ? "≥" : "≤"} {formatPrice(alert.price)}</strong>
                        <small>{alert.triggeredAt ? "تم التفعيل" : "نشط"}</small>
                      </span>
                      <button onClick={() => deleteAlert(alert.id)} title="حذف">×</button>
                    </div>
                  ))}
                  {alerts.length === 0 ? <div className="workspace-empty">لا توجد تنبيهات</div> : null}
                </div>
              </div>
            ) : null}
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

      {alertMessage ? <div className="alert-toast">{alertMessage}</div> : null}

      <section className="market-strip" dir="ltr">
        <span>MARKET DATA <b>{providerStatus?.provider ?? "detecting"}</b></span>
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
            <button title="بحث وإضافة رمز" onClick={() => searchInputRef.current?.focus()}>+</button>
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

          <div className="symbol-list">
            {visibleSymbols.map((symbol) => (
              <button
                className={`symbol-row ${symbol.id === active.id ? "active" : ""}`}
                key={symbol.id}
                onClick={() => chooseSymbol(symbol)}
              >
                <span className="symbol-meta">
                  <strong>{symbol.ticker}</strong>
                  <small>{symbol.name}</small>
                  <small>{symbol.exchange}{symbol.currency ? ` · ${symbol.currency}` : ""}</small>
                </span>
                <span className="asset-badge">{symbol.assetClass}</span>
              </button>
            ))}
            {visibleSymbols.length === 0 ? <div className="empty-search">لا توجد نتائج</div> : null}
          </div>
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

            <div className="quote">
              <strong>{formatPrice(displayedPrice)}</strong>
              <span className={(displayedPercent ?? 0) >= 0 ? "positive" : "negative"}>
                {formatPercent(displayedPercent)}
              </span>
              <small>{replayActive ? "REPLAY" : quote?.source ?? "fallback"} · {timeframe.toUpperCase()}</small>
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
                      <div className="drawing-row" key={drawing.id}>
                        <span>
                          <strong>{drawingName(drawing)}</strong>
                          <small>{drawingDetail(drawing)}</small>
                        </span>
                        <button onClick={() => deleteDrawing(drawing.id)} title="حذف">×</button>
                      </div>
                    ))}
                    {drawings.length === 0 ? <div className="workspace-empty">لا توجد رسومات</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="indicator-menu-wrap">
                <button
                  className={activeIndicatorItems.length > 0 ? "selected" : ""}
                  onClick={() => setShowIndicatorMenu((value) => !value)}
                >
                  المؤشرات {activeIndicatorItems.length > 0 ? `(${activeIndicatorItems.length})` : ""}
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
                className={drawingTool === "cursor" ? "selected" : ""}
                title="المؤشر والتحريك"
                onClick={() => setDrawingTool("cursor")}
              >
                ↖
              </button>
              <button
                className={drawingTool === "trend" ? "selected" : ""}
                title="خط الاتجاه"
                onClick={() => setDrawingTool("trend")}
              >
                ╱
              </button>
              <button
                className={drawingTool === "horizontal" ? "selected" : ""}
                title="خط أفقي"
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
              <button title="مسح الرسومات" onClick={clearDrawings} disabled={drawings.length === 0}>⌫</button>
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

          <div className="context-grid">
            <div><span>الرمز</span><strong>{active.ticker}</strong></div>
            <div><span>الفريم</span><strong>{timeframe.toUpperCase()}</strong></div>
            <div><span>المؤشرات</span><strong>{activeIndicatorItems.length}</strong></div>
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
