import { useMemo, useState } from "react";
import type { MarketSymbol, Timeframe } from "@marketos/market-core";
import MarketChart, { type ChartView } from "./components/MarketChart";

const symbols: MarketSymbol[] = [
  { id: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:TSLA", ticker: "TSLA", name: "Tesla", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
  { id: "TADAWUL:2222", ticker: "2222", name: "Saudi Aramco", exchange: "TADAWUL", assetClass: "stock", currency: "SAR" },
  { id: "TADAWUL:1120", ticker: "1120", name: "Al Rajhi Bank", exchange: "TADAWUL", assetClass: "stock", currency: "SAR" },
  { id: "FX:EURUSD", ticker: "EURUSD", name: "Euro / U.S. Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
  { id: "CRYPTO:BTCUSD", ticker: "BTCUSD", name: "Bitcoin", exchange: "CRYPTO", assetClass: "crypto", currency: "USD" },
  { id: "COMEX:GC", ticker: "GC", name: "Gold Futures", exchange: "COMEX", assetClass: "future", currency: "USD" },
];

const changes = [1.24, 2.87, -1.12, -0.42, 0.64, 0.18, 3.31, 0.91];
const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

function readSaved<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (window.localStorage.getItem(key) as T | null) ?? fallback;
}

export default function App() {
  const [activeId, setActiveId] = useState(() => readSaved("marketos:symbol", symbols[0].id));
  const [timeframe, setTimeframe] = useState<Timeframe>(() => readSaved("marketos:timeframe", "1h"));
  const [chartView, setChartView] = useState<ChartView>(() => readSaved("marketos:chart-view", "candles"));
  const [query, setQuery] = useState("");
  const [showSma, setShowSma] = useState(true);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const active = useMemo(
    () => symbols.find((symbol) => symbol.id === activeId) ?? symbols[0],
    [activeId],
  );

  const filteredSymbols = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return symbols;
    return symbols.filter((symbol) =>
      [symbol.ticker, symbol.name, symbol.exchange].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query]);

  const chooseSymbol = (id: string) => {
    setActiveId(id);
    window.localStorage.setItem("marketos:symbol", id);
    setAiResult(null);
  };

  const chooseTimeframe = (value: Timeframe) => {
    setTimeframe(value);
    window.localStorage.setItem("marketos:timeframe", value);
    setAiResult(null);
  };

  const chooseChartView = (value: ChartView) => {
    setChartView(value);
    window.localStorage.setItem("marketos:chart-view", value);
  };

  const runDemoAnalysis = () => {
    setAiResult(
      `تحليل تجريبي لـ ${active.ticker} على فريم ${timeframe}: الاتجاه الحالي يحتاج تأكيد من حركة السعر والحجم. سيتم استبدال هذا النص بتحليل AI مبني على بيانات السوق الفعلية بعد اختيار مزود البيانات.`,
    );
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">MarketOS <span>alpha</span></div>
          <div className="tagline">Professional charts, market intelligence, AI-native workflow</div>
        </div>
        <div className="top-actions">
          <div className="status-pill"><span className="status-dot" /> Demo data</div>
          <button className="ghost-button">تخطيط جديد</button>
        </div>
      </header>

      <section className="market-strip" dir="ltr">
        <span>S&amp;P 500 <b className="positive">+0.62%</b></span>
        <span>NASDAQ <b className="positive">+0.91%</b></span>
        <span>TASI <b className="negative">-0.24%</b></span>
        <span>GOLD <b className="positive">+0.38%</b></span>
        <span>BTC <b className="positive">+1.84%</b></span>
      </section>

      <section className="workspace">
        <aside className="watchlist panel">
          <div className="watchlist-head">
            <div className="panel-title">قائمة المتابعة</div>
            <button title="إضافة رمز">+</button>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن سهم أو سوق"
            />
          </div>

          <div className="symbol-list">
            {filteredSymbols.map((symbol, index) => {
              const change = changes[index % changes.length];
              return (
                <button
                  className={`symbol-row ${symbol.id === active.id ? "active" : ""}`}
                  key={symbol.id}
                  onClick={() => chooseSymbol(symbol.id)}
                >
                  <span className="symbol-meta">
                    <strong>{symbol.ticker}</strong>
                    <small>{symbol.exchange} · {symbol.currency}</small>
                  </span>
                  <span className={change >= 0 ? "positive" : "negative"}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="chart-area panel">
          <div className="instrument-bar">
            <div className="instrument-id">
              <div className="instrument-icon">{active.ticker.slice(0, 1)}</div>
              <div>
                <strong>{active.name}</strong>
                <span>{active.exchange}:{active.ticker} · {active.currency}</span>
              </div>
            </div>

            <div className="quote">
              <strong>{active.exchange === "TADAWUL" ? "28.74" : "214.53"}</strong>
              <span className="positive">+1.24%</span>
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
              <button
                className={chartView === "candles" ? "selected" : ""}
                onClick={() => chooseChartView("candles")}
              >
                شموع
              </button>
              <button
                className={chartView === "line" ? "selected" : ""}
                onClick={() => chooseChartView("line")}
              >
                خط
              </button>
              <button
                className={chartView === "area" ? "selected" : ""}
                onClick={() => chooseChartView("area")}
              >
                مساحة
              </button>
              <button className={showSma ? "selected" : ""} onClick={() => setShowSma((value) => !value)}>
                SMA 20
              </button>
            </div>
          </div>

          <div className="chart-stage">
            <div className="drawing-rail">
              <button title="المؤشر">＋</button>
              <button title="خط الاتجاه">╱</button>
              <button title="خط أفقي">―</button>
              <button title="فيبوناتشي">≋</button>
              <button title="نص">T</button>
              <button title="قياس">↕</button>
            </div>
            <MarketChart
              symbol={active}
              timeframe={timeframe}
              chartView={chartView}
              showSma={showSma}
            />
          </div>
        </section>

        <aside className="ai-panel panel">
          <div className="panel-title">MarketOS AI</div>
          <div className="ai-card">
            <span className="eyebrow">CHART CONTEXT</span>
            <h2>اسأل الشارت</h2>
            <p>
              يفهم الرمز والفريم والشموع والمؤشرات الظاهرة. لاحقًا يقدر يضيف مناطق وخطوط مباشرة فوق الشارت.
            </p>
          </div>

          <div className="quick-prompts">
            <button onClick={runDemoAnalysis}>حلل الاتجاه</button>
            <button onClick={runDemoAnalysis}>حدد المناطق</button>
            <button onClick={runDemoAnalysis}>اشرح الحركة</button>
          </div>

          <div className="prompt-box">
            <textarea defaultValue={"حلل الحركة الحالية وحدد أهم المناطق على الشارت"} />
            <button onClick={runDemoAnalysis}>تحليل الشارت <span>↗</span></button>
          </div>

          {aiResult ? <div className="ai-result">{aiResult}</div> : null}

          <div className="context-grid">
            <div><span>الرمز</span><strong>{active.ticker}</strong></div>
            <div><span>الفريم</span><strong>{timeframe.toUpperCase()}</strong></div>
            <div><span>الشارت</span><strong>{chartView}</strong></div>
            <div><span>SMA</span><strong>{showSma ? "ON" : "OFF"}</strong></div>
          </div>

          <div className="notice">
            الأسعار الحالية تجريبية فقط. ربط بيانات السوق الحقيقي سيكون بطبقة مستقلة بعد اختيار المزود المرخص.
          </div>
        </aside>
      </section>
    </main>
  );
}
