import { useEffect, useMemo } from "react";
import type {
  MarketEvent,
  MarketOverviewItem,
  MarketSymbol,
} from "@marketos/market-core";
import type { AlertInboxEvent } from "../lib/alertInboxApi";
import {
  buildDashboardModel,
} from "../lib/dashboard";
import type { SavedWorkspace } from "../lib/workspace";

type Props = {
  open: boolean;
  autoOpenEnabled: boolean;
  activeSymbol: MarketSymbol;
  overview: MarketOverviewItem[];
  overviewLoading: boolean;
  overviewProvider: string;
  overviewUpdatedAt: number | null;
  events: MarketEvent[];
  eventsLoading: boolean;
  alertEvents: AlertInboxEvent[];
  signedIn: boolean;
  workspaces: SavedWorkspace[];
  planName: string;
  sessionLabel: string;
  onClose: () => void;
  onToggleAutoOpen: (enabled: boolean) => void;
  onSelectSymbol: (symbol: MarketSymbol) => void;
  onOpenMarket: () => void;
  onOpenAlerts: () => void;
  onOpenInbox: () => void;
  onOpenEvents: () => void;
  onRestoreWorkspace: (workspace: SavedWorkspace) => void;
  onOpenCommandPalette: () => void;
};

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.abs(value) < 10 ? 3 : 2,
    maximumFractionDigits: Math.abs(value) < 10 ? 5 : 2,
  }).format(value);
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatEventDate(event: MarketEvent) {
  const date = new Date(`${event.date}T${event.time ?? "12:00:00"}`);
  if (!Number.isFinite(date.getTime())) return event.date;
  return new Intl.DateTimeFormat("ar-SA", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatAlertTime(value: number) {
  return new Date(value).toLocaleString("ar-SA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomeDashboard({
  open,
  autoOpenEnabled,
  activeSymbol,
  overview,
  overviewLoading,
  overviewProvider,
  overviewUpdatedAt,
  events,
  eventsLoading,
  alertEvents,
  signedIn,
  workspaces,
  planName,
  sessionLabel,
  onClose,
  onToggleAutoOpen,
  onSelectSymbol,
  onOpenMarket,
  onOpenAlerts,
  onOpenInbox,
  onOpenEvents,
  onRestoreWorkspace,
  onOpenCommandPalette,
}: Props) {
  const model = useMemo(
    () =>
      buildDashboardModel(
        overview,
        events,
        alertEvents,
        workspaces,
      ),
    [overview, events, alertEvents, workspaces],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () =>
      window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const breadthTotal =
    model.advancers +
    model.decliners +
    model.unchanged;

  return (
    <div
      className="home-dashboard-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="MarketOS Home"
    >
      <button
        className="home-dashboard-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section className="home-dashboard-panel" dir="rtl">
        <header className="home-dashboard-header">
          <div>
            <span className="home-dashboard-eyebrow">
              MARKETOS HOME
            </span>
            <h1>لوحة البداية</h1>
            <p>
              {sessionLabel} · {planName} ·{" "}
              <b dir="ltr">{activeSymbol.ticker}</b>
            </p>
          </div>

          <div className="home-dashboard-header-actions">
            <button
              className="home-dashboard-command"
              onClick={onOpenCommandPalette}
            >
              ⌕ البحث والأوامر
              <kbd>⌘K</kbd>
            </button>
            <button
              className="home-dashboard-close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="home-dashboard-summary">
          <button onClick={onOpenMarket}>
            <span>حركة القائمة</span>
            <strong
              className={
                model.averageMove > 0
                  ? "positive"
                  : model.averageMove < 0
                    ? "negative"
                    : ""
              }
            >
              {formatPercent(model.averageMove)}
            </strong>
            <small>
              {breadthTotal > 0
                ? `${model.advancers} صاعد · ${model.decliners} هابط`
                : "بانتظار لقطة السوق"}
            </small>
          </button>

          <button onClick={onOpenAlerts}>
            <span>التنبيهات</span>
            <strong>
              {alertEvents.filter((event) => !event.readAt).length}
            </strong>
            <small>غير مقروءة في السجل</small>
          </button>

          <button onClick={onOpenEvents}>
            <span>الأحداث</span>
            <strong>{events.length}</strong>
            <small>
              {eventsLoading ? "جاري التحديث…" : "ضمن الفترة الحالية"}
            </small>
          </button>

          <button>
            <span>Workspaces</span>
            <strong>{workspaces.length}</strong>
            <small>تخطيطات محفوظة</small>
          </button>
        </div>

        <div className="home-dashboard-grid">
          <section className="home-dashboard-card home-dashboard-movers">
            <div className="home-dashboard-card-head">
              <div>
                <span>WATCHLIST PULSE</span>
                <strong>أعلى حركة</strong>
              </div>
              <button onClick={onOpenMarket}>
                السوق ←
              </button>
            </div>

            <div className="home-dashboard-list">
              {model.movers.map((item) => {
                const move = item.quote.percentChange ?? 0;
                return (
                  <button
                    className="home-dashboard-mover"
                    key={item.symbol.id}
                    onClick={() => {
                      onSelectSymbol(item.symbol);
                      onClose();
                    }}
                  >
                    <span className="home-dashboard-symbol">
                      <strong>{item.symbol.ticker}</strong>
                      <small>{item.symbol.exchange}</small>
                    </span>
                    <span className="home-dashboard-price" dir="ltr">
                      <b>{formatPrice(item.quote.price)}</b>
                      <em
                        className={
                          move > 0
                            ? "positive"
                            : move < 0
                              ? "negative"
                              : ""
                        }
                      >
                        {formatPercent(move)}
                      </em>
                    </span>
                  </button>
                );
              })}

              {!overviewLoading && model.movers.length === 0 ? (
                <div className="home-dashboard-empty">
                  ما فيه أسعار جاهزة حتى الآن.
                </div>
              ) : null}

              {overviewLoading && model.movers.length === 0 ? (
                <div className="home-dashboard-loading">
                  جاري تحديث Watchlist…
                </div>
              ) : null}
            </div>

            <footer>
              <span>
                {overviewProvider === "demo"
                  ? "Preview"
                  : overviewProvider}
              </span>
              <span>
                {overviewUpdatedAt
                  ? new Date(overviewUpdatedAt).toLocaleTimeString(
                      "ar-SA",
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : "—"}
              </span>
            </footer>
          </section>

          <section className="home-dashboard-card">
            <div className="home-dashboard-card-head">
              <div>
                <span>ALERT INBOX</span>
                <strong>آخر التنبيهات</strong>
              </div>
              <button onClick={onOpenInbox}>
                السجل ←
              </button>
            </div>

            <div className="home-dashboard-list">
              {model.unreadAlerts.map((event) => (
                <button
                  className="home-dashboard-alert"
                  key={event.id}
                  onClick={() => {
                    onSelectSymbol(event.symbol);
                    onClose();
                  }}
                >
                  <span>
                    <strong>{event.symbol.ticker}</strong>
                    <small>{event.timeframe.toUpperCase()}</small>
                  </span>
                  <time>{formatAlertTime(event.triggeredAt)}</time>
                </button>
              ))}

              {model.unreadAlerts.length === 0 ? (
                <div className="home-dashboard-empty">
                  {signedIn
                    ? "ما عندك تنبيهات جديدة."
                    : "سجّل الدخول لعرض Alert Inbox."}
                </div>
              ) : null}
            </div>
          </section>

          <section className="home-dashboard-card">
            <div className="home-dashboard-card-head">
              <div>
                <span>MARKET EVENTS</span>
                <strong>الأحداث القادمة</strong>
              </div>
              <button onClick={onOpenEvents}>
                الكل ←
              </button>
            </div>

            <div className="home-dashboard-list">
              {model.nextEvents.map((event) => (
                <button
                  className="home-dashboard-event"
                  key={event.id}
                  onClick={() => {
                    onOpenEvents();
                  }}
                >
                  <span className="home-dashboard-event-date">
                    {formatEventDate(event)}
                  </span>
                  <span className="home-dashboard-event-main">
                    <strong>{event.symbol ?? event.title}</strong>
                    <small>{event.name ?? event.title}</small>
                  </span>
                  <b className={`importance-${event.importance ?? "medium"}`}>
                    {event.time ?? "—"}
                  </b>
                </button>
              ))}

              {!eventsLoading && model.nextEvents.length === 0 ? (
                <div className="home-dashboard-empty">
                  ما فيه أحداث جاهزة لهذه الفترة.
                </div>
              ) : null}

              {eventsLoading && model.nextEvents.length === 0 ? (
                <div className="home-dashboard-loading">
                  جاري تحميل الأحداث…
                </div>
              ) : null}
            </div>
          </section>

          <section className="home-dashboard-card">
            <div className="home-dashboard-card-head">
              <div>
                <span>WORKSPACES</span>
                <strong>آخر التخطيطات</strong>
              </div>
            </div>

            <div className="home-dashboard-list">
              {model.recentWorkspaces.map((workspace) => (
                <button
                  className="home-dashboard-workspace"
                  key={workspace.id}
                  onClick={() => {
                    onRestoreWorkspace(workspace);
                    onClose();
                  }}
                >
                  <span>
                    <strong>{workspace.name}</strong>
                    <small>
                      {workspace.symbol.ticker} ·{" "}
                      {workspace.timeframe.toUpperCase()}
                    </small>
                  </span>
                  <b>
                    {workspace.layoutMode === "quad"
                      ? "4×"
                      : workspace.layoutMode === "split"
                        ? "2×"
                        : "1×"}
                  </b>
                </button>
              ))}

              {model.recentWorkspaces.length === 0 ? (
                <div className="home-dashboard-empty">
                  ما عندك تخطيطات محفوظة إلى الآن.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="home-dashboard-footer">
          <label>
            <input
              type="checkbox"
              checked={autoOpenEnabled}
              onChange={(event) =>
                onToggleAutoOpen(event.target.checked)
              }
            />
            <span>فتح لوحة البداية تلقائيًا عند تشغيل MarketOS</span>
          </label>

          <button
            className="home-dashboard-enter"
            onClick={onClose}
          >
            دخول الشارت
          </button>
        </footer>
      </section>
    </div>
  );
}
