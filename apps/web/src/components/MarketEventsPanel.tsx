import { useMemo } from "react";
import type { MarketEvent } from "@marketos/market-core";

type Props = {
  events: MarketEvent[];
  provider: string;
  rangeDays: number;
  loading: boolean;
  error: string | null;
  onRangeChange: (days: number) => void;
  onRefresh: () => void;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
};

function formatDate(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dateText;
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export default function MarketEventsPanel({
  events,
  provider,
  rangeDays,
  loading,
  error,
  onRangeChange,
  onRefresh,
  onClose,
  onSelectSymbol,
}: Props) {
  const groups = useMemo(() => {
    const grouped = new Map<string, MarketEvent[]>();
    for (const event of events) {
      const current = grouped.get(event.date) ?? [];
      current.push(event);
      grouped.set(event.date, current);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <div className="events-overlay" role="dialog" aria-modal="true" aria-label="Market Events">
      <button className="events-backdrop" aria-label="إغلاق" onClick={onClose} />
      <section className="events-panel" dir="rtl">
        <header className="events-header">
          <div>
            <span className="events-eyebrow">MARKETOS EVENTS</span>
            <h2>أحداث السوق</h2>
            <p>أرباح الشركات المرتبطة بقائمة متابعتك · المصدر: {provider}</p>
          </div>
          <div className="events-header-actions">
            <button onClick={onRefresh} disabled={loading}>{loading ? "تحميل…" : "تحديث"}</button>
            <button className="events-close" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="events-toolbar">
          <span>الفترة</span>
          {[7, 14].map((days) => (
            <button
              key={days}
              className={rangeDays === days ? "selected" : ""}
              onClick={() => onRangeChange(days)}
            >
              {days} أيام
            </button>
          ))}
          <span className="events-cost-note">التحديث يدوي لتقليل استهلاك مزود البيانات</span>
        </div>

        {error ? <div className="events-warning">{error}</div> : null}

        <div className="events-content">
          {loading && events.length === 0 ? (
            <div className="events-empty">جاري تحميل الأحداث…</div>
          ) : groups.length === 0 ? (
            <div className="events-empty">لا توجد أحداث مرتبطة بقائمة المتابعة في هذه الفترة.</div>
          ) : (
            groups.map(([date, items]) => (
              <section className="event-day" key={date}>
                <div className="event-day-title">
                  <strong>{formatDate(date)}</strong>
                  <span>{date}</span>
                </div>
                <div className="event-list">
                  {items.map((event) => (
                    <button
                      className="event-row"
                      key={event.id}
                      onClick={() => event.symbol && onSelectSymbol(event.symbol)}
                      disabled={!event.symbol}
                    >
                      <span className={`event-importance ${event.importance ?? "medium"}`} />
                      <span className="event-time">{event.time ?? "—"}</span>
                      <span className="event-main">
                        <strong>{event.symbol ?? event.title}</strong>
                        <small>{event.name ?? event.title}</small>
                      </span>
                      <span className="event-exchange">{event.exchange ?? event.country ?? "—"}</span>
                      <span className="event-metric">
                        <small>EPS Est.</small>
                        <strong>{formatNumber(event.epsEstimate)}</strong>
                      </span>
                      <span className="event-metric">
                        <small>EPS Actual</small>
                        <strong>{formatNumber(event.epsActual)}</strong>
                      </span>
                      <span className={
                        event.surprisePercent === undefined
                          ? "event-surprise"
                          : event.surprisePercent >= 0
                            ? "event-surprise positive"
                            : "event-surprise negative"
                      }>
                        {event.surprisePercent === undefined ? "—" : `${event.surprisePercent.toFixed(1)}%`}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
