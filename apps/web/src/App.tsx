import { useMemo, useState } from "react";
import type { MarketSymbol } from "@marketos/market-core";
import MarketChart from "./components/MarketChart";

const symbols: MarketSymbol[] = [
  { id: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA", exchange: "NASDAQ", assetClass: "stock", currency: "USD" },
  { id: "TADAWUL:2222", ticker: "2222", name: "Saudi Aramco", exchange: "TADAWUL", assetClass: "stock", currency: "SAR" },
  { id: "FX:EURUSD", ticker: "EURUSD", name: "Euro / U.S. Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
  { id: "CRYPTO:BTCUSD", ticker: "BTCUSD", name: "Bitcoin", exchange: "CRYPTO", assetClass: "crypto", currency: "USD" }
];

export default function App() {
  const [activeId, setActiveId] = useState(symbols[0].id);
  const active = useMemo(() => symbols.find((symbol) => symbol.id === activeId) ?? symbols[0], [activeId]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">MarketOS</div>
          <div className="tagline">Charts + Market Intelligence + AI</div>
        </div>
        <div className="status-pill"><span className="status-dot" /> Demo market feed</div>
      </header>

      <section className="workspace">
        <aside className="watchlist panel">
          <div className="panel-title">قائمة المتابعة</div>
          <div className="symbol-list">
            {symbols.map((symbol, index) => {
              const change = [1.24, 2.87, -0.42, 0.18, 3.31][index];
              return (
                <button
                  className={`symbol-row ${symbol.id === active.id ? "active" : ""}`}
                  key={symbol.id}
                  onClick={() => setActiveId(symbol.id)}
                >
                  <span>
                    <strong>{symbol.ticker}</strong>
                    <small>{symbol.exchange}</small>
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
          <div className="chart-header">
            <div>
              <strong>{active.name}</strong>
              <span>{active.exchange}:{active.ticker}</span>
            </div>
            <div className="timeframes">
              {["1m", "5m", "15m", "1H", "4H", "1D"].map((tf) => (
                <button className={tf === "1H" ? "selected" : ""} key={tf}>{tf}</button>
              ))}
            </div>
          </div>
          <MarketChart symbol={active} />
        </section>

        <aside className="ai-panel panel">
          <div className="panel-title">MarketOS AI</div>
          <div className="ai-card">
            <span className="eyebrow">سياق الشارت</span>
            <h2>اسأل الشارت مباشرة</h2>
            <p>
              طبقة الـAI مصممة لتستقبل الرمز، الفريم، بيانات الشموع والمؤشرات والرسمات الحالية بدون ربطها بمزود AI واحد.
            </p>
          </div>
          <div className="prompt-box">
            <textarea defaultValue={"حلل الحركة الحالية وحدد أهم المناطق على الشارت"} />
            <button>تحليل الشارت</button>
          </div>
          <div className="notice">
            النموذج الحالي يستخدم بيانات تجريبية فقط إلى أن نختار مزود Market Data مرخص.
          </div>
        </aside>
      </section>
    </main>
  );
}
