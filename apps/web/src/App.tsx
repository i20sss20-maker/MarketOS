import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Candle,
  MarketDataStatus,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import MarketChart, { type ChartView } from "./components/MarketChart";
import { createDemoCandles, createDemoQuote } from "./lib/demoData";
import type { ChartDrawing, DrawingTool } from "./lib/drawings";
import { loadDrawings, saveDrawings } from "./lib/drawings";
import type { IndicatorId, IndicatorSelection } from "./lib/indicators";
import {
  indicatorCatalog,
  loadIndicatorSelection,
  saveIndicatorSelection,
} from "./lib/indicators";
import {
  getMarketCandles,
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
  const [aiResult, setAiResult] = useState<string | null>(null);

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
    () => query.trim() ? searchResults : initialSymbols,
    [query, searchResults],
  );

  const activeIndicatorItems = useMemo(
    () => indicatorCatalog.filter((item) => indicators[item.id]),
    [indicators],
  );

  const lastCandle = candles[candles.length - 1];
  const displayedPrice = quote?.price ?? lastCandle?.close;
  const displayedPercent = quote?.percentChange;
  const providerLabel =
    dataState === "loading"
      ? "Loading data"
      : dataState === "provider"
        ? providerStatus?.provider ?? quote?.source ?? "Provider"
        : "Demo fallback";

  const chooseSymbol = (symbol: MarketSymbol) => {
    setActive(symbol);
    saveSetting("marketos:symbol", symbol.id);
    saveSetting("marketos:symbol-object", JSON.stringify(symbol));
    setDrawings(loadDrawings(symbol.id));
    setDrawingTool("cursor");
    setQuery("");
    setAiResult(null);
  };

  const chooseTimeframe = (value: Timeframe) => {
    setTimeframe(value);
    saveSetting("marketos:timeframe", value);
    setDrawingTool("cursor");
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

  const clearDrawings = () => {
    setDrawings([]);
    saveDrawings(active.id, []);
    setDrawingTool("cursor");
  };

  const runChartReading = () => {
    if (candles.length < 20) {
      setAiResult("لا توجد شموع كافية لقراءة الشارت حاليًا.");
      return;
    }

    const recent = candles.slice(-20);
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

    setAiResult(
      `قراءة وصفية لـ ${active.ticker} على ${timeframe.toUpperCase()}: آخر سعر ${formatPrice(last.close)}، حركة آخر 20 شمعة ${formatPercent(move)}، والنطاق ${formatPrice(low)} – ${formatPrice(high)}. السعر حاليًا ${relativeToSma} متوسط 20 شمعة. المؤشرات النشطة: ${indicatorText}. الرسومات المحفوظة: ${drawings.length}.`,
    );
  };

  const drawingHint =
    drawingTool === "trend"
      ? "أداة الترند: انقر نقطتين على الشارت"
      : drawingTool === "horizontal"
        ? "الخط الأفقي: انقر على مستوى السعر"
        : null;

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
          <button className="ghost-button">تخطيط جديد</button>
        </div>
      </header>

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
            <button title="إضافة رمز">+</button>
          </div>

          <div className="search-box">
            <span>{searchLoading ? "…" : "⌕"}</span>
            <input
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
              <small>{quote?.source ?? "fallback"} · {timeframe.toUpperCase()}</small>
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
              <button className="disabled-tool" title="فيبوناتشي — قريبًا" disabled>≋</button>
              <button className="disabled-tool" title="نص — قريبًا" disabled>T</button>
              <button title="مسح الرسومات" onClick={clearDrawings} disabled={drawings.length === 0}>⌫</button>
            </div>

            <div className="chart-host">
              <MarketChart
                candles={candles}
                timeframe={timeframe}
                chartView={chartView}
                indicators={indicators}
                drawings={drawings}
                drawingTool={drawingTool}
                onDrawingCreated={handleDrawingCreated}
              />
              {dataState === "loading" ? <div className="chart-state">تحميل بيانات السوق…</div> : null}
              {dataState === "fallback" ? <div className="chart-mode">DEMO</div> : <div className="chart-mode live">DATA</div>}
              {drawingHint ? <div className="drawing-hint">{drawingHint}</div> : null}
            </div>
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
            <button onClick={runChartReading}>اقرأ الاتجاه</button>
            <button onClick={runChartReading}>حدد النطاق</button>
            <button onClick={runChartReading}>اشرح الحركة</button>
          </div>

          <div className="prompt-box">
            <textarea defaultValue={"اقرأ الحركة الحالية ووضح أهم ما يظهر في الشارت"} />
            <button onClick={runChartReading}>قراءة الشارت <span>↗</span></button>
          </div>

          {aiResult ? <div className="ai-result">{aiResult}</div> : null}

          <div className="context-grid">
            <div><span>الرمز</span><strong>{active.ticker}</strong></div>
            <div><span>الفريم</span><strong>{timeframe.toUpperCase()}</strong></div>
            <div><span>المؤشرات</span><strong>{activeIndicatorItems.length}</strong></div>
            <div><span>الرسومات</span><strong>{drawings.length}</strong></div>
            <div><span>الشموع</span><strong>{candles.length}</strong></div>
            <div><span>المصدر</span><strong>{quote?.source ?? "fallback"}</strong></div>
          </div>

          <div className="notice">
            {dataError
              ? `تعذر الوصول للـAPI وتم تشغيل Demo fallback: ${dataError}`
              : providerStatus?.message ?? "Market Data V1 active."}
          </div>
        </aside>
      </section>
    </main>
  );
}
