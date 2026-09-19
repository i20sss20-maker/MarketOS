import { useEffect } from "react";
import type { MarketSymbol } from "@marketos/market-core";
import type { AlertInboxEvent } from "../lib/alertInboxApi";

type Props = {
  open: boolean;
  events: AlertInboxEvent[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearRead: () => void;
  onSelectSymbol: (symbol: MarketSymbol) => void;
};

function formatTriggeredAt(value: number) {
  return new Date(value).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function snapshotText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof snapshot.price === "number") {
    parts.push(`السعر ${snapshot.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`);
  }
  if (typeof snapshot.changePercent === "number") {
    const prefix = snapshot.changePercent >= 0 ? "+" : "";
    parts.push(`التغير ${prefix}${snapshot.changePercent.toFixed(2)}%`);
  }
  if (typeof snapshot.rsi14 === "number") {
    parts.push(`RSI ${snapshot.rsi14.toFixed(1)}`);
  }
  if (typeof snapshot.volume === "number") {
    parts.push(`الحجم ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(snapshot.volume)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function AlertInboxPanel({
  open,
  events,
  loading,
  error,
  onClose,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onClearRead,
  onSelectSymbol,
}: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const unreadCount = events.filter((event) => !event.readAt).length;
  const hasRead = events.some((event) => event.readAt);

  return (
    <div className="alert-inbox-overlay" role="dialog" aria-modal="true" aria-label="Alert Inbox">
      <button className="alert-inbox-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="alert-inbox-panel" dir="rtl">
        <header className="alert-inbox-header">
          <div>
            <span className="alert-inbox-eyebrow">MARKETOS ALERT INBOX</span>
            <h2>سجل التنبيهات</h2>
            <p>
              {unreadCount > 0
                ? `${unreadCount} تنبيه جديد`
                : "ما عندك تنبيهات جديدة"}
            </p>
          </div>
          <div className="alert-inbox-header-actions">
            <button onClick={onRefresh} disabled={loading}>
              {loading ? "تحديث…" : "تحديث"}
            </button>
            <button className="alert-inbox-close" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="alert-inbox-actions">
          <button onClick={onMarkAllRead} disabled={unreadCount === 0 || loading}>
            تحديد الكل كمقروء
          </button>
          <button onClick={onClearRead} disabled={!hasRead || loading}>
            مسح المقروء
          </button>
        </div>

        {error ? <div className="alert-inbox-error">{error}</div> : null}

        <div className="alert-inbox-list">
          {events.map((event) => {
            const snapshot = snapshotText(event.snapshot);
            return (
              <article
                className={event.readAt ? "alert-inbox-card" : "alert-inbox-card unread"}
                key={event.id}
              >
                <div className="alert-inbox-card-main">
                  <div className="alert-inbox-symbol">
                    <span>{event.symbol.ticker.slice(0, 2)}</span>
                    <div>
                      <strong>{event.symbol.ticker}</strong>
                      <small>{event.symbol.name}</small>
                    </div>
                  </div>

                  <div className="alert-inbox-meta">
                    <span>{event.timeframe.toUpperCase()}</span>
                    <span>
                      {event.source === "background" ? "فحص خلفي" : "فحص سحابي"}
                    </span>
                    <time>{formatTriggeredAt(event.triggeredAt)}</time>
                  </div>

                  {snapshot ? <p>{snapshot}</p> : null}
                </div>

                <div className="alert-inbox-card-actions">
                  {!event.readAt ? (
                    <button onClick={() => onMarkRead(event.id)}>
                      مقروء
                    </button>
                  ) : null}
                  <button
                    className="primary"
                    onClick={() => {
                      if (!event.readAt) onMarkRead(event.id);
                      onSelectSymbol(event.symbol);
                    }}
                  >
                    فتح الشارت
                  </button>
                </div>
              </article>
            );
          })}

          {!loading && events.length === 0 ? (
            <div className="alert-inbox-empty">
              <span>✓</span>
              <strong>السجل فاضي</strong>
              <small>
                أي تنبيه يتفعّل من الفحص السحابي أو الـBackground Worker بيظهر هنا.
              </small>
            </div>
          ) : null}
        </div>

        <footer className="alert-inbox-footer">
          السجل محفوظ في حسابك السحابي ومحدود بآخر 100 تفعيل.
        </footer>
      </section>
    </div>
  );
}
