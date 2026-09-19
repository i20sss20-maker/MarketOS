import { useState } from "react";
import type {
  ChartAnalysisResponse,
  MultiTimeframeAnalysisResponse,
  Timeframe,
} from "@marketos/market-core";
import type { DataWindowSnapshot } from "../lib/dataWindow";

type AiResult = Pick<ChartAnalysisResponse, "summary" | "observations" | "engine">;

type Props = {
  open: boolean;
  prompt: string;
  aiLoading: boolean;
  multiTimeframeLoading: boolean;
  multiTimeframeEnabled: boolean;
  aiResult: AiResult | null;
  multiTimeframeResult: MultiTimeframeAnalysisResponse | null;
  multiTimeframeError: string | null;
  ticker: string;
  timeframe: Timeframe;
  indicatorCount: number;
  drawingCount: number;
  comparisonTicker?: string | null;
  alertCount: number;
  candleCount: number;
  source: string;
  dataWindow: DataWindowSnapshot | null;
  dataError: string | null;
  previewMode: boolean;
  providerMessage?: string | null;
  onClose: () => void;
  onPromptChange: (value: string) => void;
  onRead: (prompt?: string) => void;
  onMultiTimeframe: () => void;
  formatPrice: (value?: number) => string;
  formatPercent: (value?: number) => string;
  formatVolume: (value?: number) => string;
};

export default function CommercialAiPanel({
  open,
  prompt,
  aiLoading,
  multiTimeframeLoading,
  multiTimeframeEnabled,
  aiResult,
  multiTimeframeResult,
  multiTimeframeError,
  ticker,
  timeframe,
  indicatorCount,
  drawingCount,
  comparisonTicker,
  alertCount,
  candleCount,
  source,
  dataWindow,
  dataError,
  previewMode,
  providerMessage,
  onClose,
  onPromptChange,
  onRead,
  onMultiTimeframe,
  formatPrice,
  formatPercent,
  formatVolume,
}: Props) {
  const [tab, setTab] = useState<"ai" | "data">("ai");

  return (
    <aside className={open ? "ai-panel panel commercial-ai-panel" : "ai-panel panel commercial-ai-panel panel-collapsed"}>
      <div className="commercial-panel-head ai-panel-head">
        <div>
          <div className="panel-title">MarketOS</div>
          <small>{tab === "ai" ? "Chart-aware assistant" : "Crosshair data"}</small>
        </div>
        <button className="commercial-panel-close" title="إغلاق اللوحة" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="commercial-panel-tabs">
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>
          AI
        </button>
        <button className={tab === "data" ? "active" : ""} onClick={() => setTab("data")}>
          Data Window
        </button>
      </div>

      {tab === "ai" ? (
        <>
      <div className="ai-card">
        <span className="eyebrow">CHART CONTEXT</span>
        <h2>اسأل الشارت</h2>
        <p>
          يقرأ الرمز والفريم والشموع والمؤشرات والرسومات الظاهرة بدون ما يغير الشارت من نفسه.
        </p>
      </div>

      <div className="quick-prompts">
        <button onClick={() => onRead("اقرأ الاتجاه الحالي بشكل وصفي")}>اقرأ الاتجاه</button>
        <button onClick={() => onRead("حدد نطاق آخر 20 شمعة والمستويات المرسومة")}>حدد النطاق</button>
        <button onClick={() => onRead("اشرح الحركة والحجم والمؤشرات النشطة")}>اشرح الحركة</button>
      </div>

      <button
        className={multiTimeframeEnabled ? "multi-timeframe-button" : "multi-timeframe-button locked"}
        onClick={onMultiTimeframe}
        disabled={multiTimeframeLoading}
        title={multiTimeframeEnabled ? "تحليل متعدد الفريمات" : "يتطلب MarketOS Pro"}
      >
        <span>Multi‑Timeframe AI</span>
        <small>
          {multiTimeframeEnabled
            ? "15m · 1h · 4h · 1d"
            : "يتطلب Pro"}
        </small>
        <b>
          {multiTimeframeLoading
            ? "…"
            : multiTimeframeEnabled
              ? "↗"
              : "🔒"}
        </b>
      </button>

      <div className="prompt-box">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          maxLength={1200}
          placeholder="اكتب سؤالك عن الشارت…"
        />
        <button onClick={() => onRead()} disabled={aiLoading}>
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
        <div><span>الرمز</span><strong>{ticker}</strong></div>
        <div><span>الفريم</span><strong>{timeframe.toUpperCase()}</strong></div>
        <div><span>المؤشرات</span><strong>{indicatorCount}</strong></div>
        <div><span>الرسومات</span><strong>{drawingCount}</strong></div>
        <div><span>المقارنة</span><strong>{comparisonTicker ?? "—"}</strong></div>
        <div><span>التنبيهات</span><strong>{alertCount}</strong></div>
        <div><span>الشموع</span><strong>{candleCount}</strong></div>
        <div><span>المصدر</span><strong>{source}</strong></div>
      </div>

        </>
      ) : null}

      {tab === "data" ? (
        dataWindow ? (
        <section className="data-window">
          <div className="data-window-head">
            <div>
              <span className="data-window-eyebrow">DATA WINDOW</span>
              <strong>القيم عند المؤشر</strong>
            </div>
            <small dir="ltr">
              {new Date(dataWindow.time * 1000).toLocaleString("en-GB", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </small>
          </div>

          <div className="data-window-ohlcv">
            <div><span>O</span><strong>{formatPrice(dataWindow.candle.open)}</strong></div>
            <div><span>H</span><strong>{formatPrice(dataWindow.candle.high)}</strong></div>
            <div><span>L</span><strong>{formatPrice(dataWindow.candle.low)}</strong></div>
            <div><span>C</span><strong>{formatPrice(dataWindow.candle.close)}</strong></div>
            <div className="data-window-volume">
              <span>VOL</span>
              <strong>{formatVolume(dataWindow.candle.volume)}</strong>
            </div>
          </div>

          {dataWindow.rows.length > 0 ? (
            <div className="data-window-indicators">
              {dataWindow.rows.map((row) => (
                <div className="data-window-row" key={row.id}>
                  <span>{row.label}</span>
                  <strong dir="ltr">
                    {row.value === null ? "—" : formatPrice(row.value)}
                  </strong>
                  {row.secondaryLabel ? (
                    <>
                      <small>{row.secondaryLabel}</small>
                      <b dir="ltr">
                        {row.secondaryValue === null || row.secondaryValue === undefined
                          ? "—"
                          : formatPrice(row.secondaryValue)}
                      </b>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="data-window-empty">
              فعّل مؤشرات لعرض قيمها عند نفس الشمعة.
            </div>
          )}
        </section>
        ) : (
          <div className="commercial-empty-data">
            <span>＋</span>
            <strong>حرّك المؤشر فوق الشارت</strong>
            <small>تظهر هنا قيم الشمعة والمؤشرات عند نفس النقطة.</small>
          </div>
        )
      ) : null}

      <div className="notice">
        {dataError
          ? "تعذر تحديث مصدر البيانات الحالي؛ يتم عرض آخر بيانات متاحة."
          : previewMode
            ? "البيانات الحالية في وضع المعاينة حتى يتم ربط مصدر السوق المباشر."
            : providerMessage ?? "مصدر بيانات السوق متصل."}
      </div>

      <div className="chart-attribution">
        Charts powered by{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
      </div>
    </aside>
  );
}
