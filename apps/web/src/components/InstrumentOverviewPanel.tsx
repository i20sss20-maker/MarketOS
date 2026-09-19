import { useEffect, useMemo } from "react";
import {
  calculateInstrumentStats,
} from "@marketos/market-stats-core";
import type {
  Candle,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";

type Props = {
  open: boolean;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  candles: Candle[];
  quote?: Quote | null;
  replayMode: boolean;
  onClose: () => void;
};

function formatPrice(
  value: number | null | undefined,
  currency?: string,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.abs(value) < 10 ? 3 : 2,
    maximumFractionDigits: Math.abs(value) < 10 ? 5 : 2,
  }).format(value);

  return currency ? `${formatted} ${currency}` : formatted;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  detail?: string;
}) {
  return (
    <div className="instrument-stat-card">
      <span>{label}</span>
      <strong className={tone && tone !== "neutral" ? tone : ""}>
        {value}
      </strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export default function InstrumentOverviewPanel({
  open,
  symbol,
  timeframe,
  candles,
  quote,
  replayMode,
  onClose,
}: Props) {
  const stats = useMemo(
    () => calculateInstrumentStats(candles, replayMode ? null : quote),
    [candles, quote, replayMode],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const lastPerformance = stats.performance;
  const rangePosition = stats.rangePosition20Percent ?? 0;
  const movementTone =
    (stats.quoteChangePercent ?? 0) > 0
      ? "positive"
      : (stats.quoteChangePercent ?? 0) < 0
        ? "negative"
        : "neutral";

  return (
    <div
      className="instrument-overview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Instrument Overview"
    >
      <button
        className="instrument-overview-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section className="instrument-overview-panel" dir="rtl">
        <header className="instrument-overview-header">
          <div className="instrument-overview-title">
            <div className="instrument-overview-icon">
              {symbol.ticker.slice(0, 1)}
            </div>
            <div>
              <span className="instrument-overview-eyebrow">
                MARKETOS INSTRUMENT
              </span>
              <h2>{symbol.name}</h2>
              <p dir="ltr">
                {symbol.exchange}:{symbol.ticker} · {timeframe.toUpperCase()}
                {replayMode ? " · REPLAY" : ""}
              </p>
            </div>
          </div>
          <button
            className="instrument-overview-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="instrument-overview-content">
          <section className="instrument-overview-price">
            <div>
              <span>آخر سعر</span>
              <strong dir="ltr">
                {formatPrice(stats.lastPrice, symbol.currency)}
              </strong>
              <b className={movementTone}>
                {formatPercent(stats.quoteChangePercent)}
              </b>
            </div>

            <div className="instrument-overview-session-grid">
              <MetricCard
                label="Open"
                value={formatPrice(stats.open)}
              />
              <MetricCard
                label="High"
                value={formatPrice(stats.high)}
              />
              <MetricCard
                label="Low"
                value={formatPrice(stats.low)}
              />
              <MetricCard
                label="Prev Close"
                value={formatPrice(stats.previousClose)}
              />
            </div>
          </section>

          <section className="instrument-overview-section">
            <div className="instrument-overview-section-title">
              الأداء حسب عدد الشموع
            </div>
            <div className="instrument-performance-grid">
              {lastPerformance.map((item) => {
                const tone =
                  (item.changePercent ?? 0) > 0
                    ? "positive"
                    : (item.changePercent ?? 0) < 0
                      ? "negative"
                      : "neutral";

                return (
                  <MetricCard
                    key={item.bars}
                    label={`${item.bars} Bars`}
                    value={formatPercent(item.changePercent)}
                    tone={tone}
                    detail={
                      item.high !== null && item.low !== null
                        ? `${formatPrice(item.low)} – ${formatPrice(item.high)}`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>

          <section className="instrument-overview-section">
            <div className="instrument-overview-section-title">
              الاتجاه والمتوسطات
            </div>
            <div className="instrument-overview-metrics">
              <MetricCard
                label="SMA 20"
                value={formatPrice(stats.sma20)}
                detail={
                  stats.distanceFromSma20Percent === null
                    ? undefined
                    : `المسافة ${formatPercent(stats.distanceFromSma20Percent)}`
                }
              />
              <MetricCard
                label="SMA 50"
                value={formatPrice(stats.sma50)}
                detail={
                  stats.distanceFromSma50Percent === null
                    ? undefined
                    : `المسافة ${formatPercent(stats.distanceFromSma50Percent)}`
                }
              />
              <MetricCard
                label="شموع صاعدة / 20"
                value={String(stats.upBars20)}
                tone="positive"
                detail={`هابطة ${stats.downBars20} · ثابتة ${stats.unchangedBars20}`}
              />
            </div>
          </section>

          <section className="instrument-overview-section">
            <div className="instrument-overview-section-title">
              النطاق والمخاطر الوصفية
            </div>
            <div className="instrument-overview-metrics">
              <MetricCard
                label="ATR 14"
                value={formatPrice(stats.atr14)}
                detail={
                  stats.atr14Percent === null
                    ? undefined
                    : `${stats.atr14Percent.toFixed(2)}% من السعر`
                }
              />
              <MetricCard
                label="Realized Volatility / 20"
                value={
                  stats.realizedVolatility20Percent === null
                    ? "—"
                    : `${stats.realizedVolatility20Percent.toFixed(2)}%`
                }
                detail="انحراف معياري للعوائد لكل شمعة"
              />
            </div>

            <div className="instrument-range-position">
              <div>
                <span>موقع السعر داخل نطاق آخر 20 شمعة</span>
                <strong>
                  {stats.rangePosition20Percent === null
                    ? "—"
                    : `${stats.rangePosition20Percent.toFixed(1)}%`}
                </strong>
              </div>
              <div className="instrument-range-track">
                <i
                  style={{
                    width: `${Math.max(0, Math.min(100, rangePosition))}%`,
                  }}
                />
              </div>
              <div className="instrument-range-labels">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </section>

          <section className="instrument-overview-section">
            <div className="instrument-overview-section-title">
              الحجم
            </div>
            <div className="instrument-overview-metrics">
              <MetricCard
                label="Latest Volume"
                value={formatCompact(stats.volume)}
              />
              <MetricCard
                label="Average Volume / 20"
                value={formatCompact(stats.averageVolume20)}
              />
              <MetricCard
                label="Volume Ratio"
                value={
                  stats.latestVolumeRatio === null
                    ? "—"
                    : `${stats.latestVolumeRatio.toFixed(2)}×`
                }
                detail="آخر حجم ÷ متوسط 20"
              />
            </div>
          </section>

          <div className="instrument-overview-note">
            القيم محسوبة من بيانات الشارت المحمّلة حاليًا. في Replay
            يتم استخدام الشموع الظاهرة حتى نقطة الإعادة فقط. هذه
            إحصاءات وصفية وليست توصية أو توقعًا لسعر الأصل.
          </div>
        </div>
      </section>
    </div>
  );
}
