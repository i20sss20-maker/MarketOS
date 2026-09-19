import { useState, type ReactNode } from "react";

type Props = {
  previewMode: boolean;
  connected: boolean;
  sessionLabel: string;
  alertCount: number;
  eventCount: number;
  companyCount: number;
  watchlistOpen: boolean;
  aiOpen: boolean;
  onToggleWatchlist: () => void;
  onToggleAi: () => void;
  onMarket: () => void;
  onAlerts: () => void;
  onCorrelation: () => void;
  onEvents: () => void;
  onCompanyFeed: () => void;
  onStrategy: () => void;
  onSystem: () => void;
  workspaceSlot: ReactNode;
};

type IconName =
  | "menu"
  | "watchlist"
  | "sparkles"
  | "market"
  | "alert"
  | "more"
  | "calendar"
  | "company"
  | "correlation"
  | "strategy"
  | "system";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "menu") {
    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  }
  if (name === "watchlist") {
    return <svg {...common}><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
  }
  if (name === "sparkles") {
    return <svg {...common}><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
  }
  if (name === "market") {
    return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
  }
  if (name === "alert") {
    return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><path d="M5 4h14v16H5z" /><path d="M8 2v4M16 2v4M5 9h14" /></svg>;
  }
  if (name === "company") {
    return <svg {...common}><path d="M4 21V7l8-4 8 4v14" /><path d="M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3" /></svg>;
  }
  if (name === "correlation") {
    return <svg {...common}><path d="M4 17 9 12l4 4 7-9" /><path d="M16 7h4v4" /></svg>;
  }
  if (name === "strategy") {
    return <svg {...common}><path d="M5 18h14M7 15l3-4 3 2 4-6" /><circle cx="7" cy="15" r="1" /><circle cx="10" cy="11" r="1" /><circle cx="13" cy="13" r="1" /><circle cx="17" cy="7" r="1" /></svg>;
  }
  if (name === "system") {
    return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
  }
  return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
}

export default function CommercialTopBar({
  previewMode,
  connected,
  sessionLabel,
  alertCount,
  eventCount,
  companyCount,
  watchlistOpen,
  aiOpen,
  onToggleWatchlist,
  onToggleAi,
  onMarket,
  onAlerts,
  onCorrelation,
  onEvents,
  onCompanyFeed,
  onStrategy,
  onSystem,
  workspaceSlot,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <header className="commercial-topbar" dir="rtl">
      <div className="commercial-brand-block">
        <div className="commercial-logo-mark">M</div>
        <div>
          <div className="commercial-brand-name">MarketOS</div>
          <div className="commercial-brand-meta">
            <span className={connected ? "commercial-live-dot online" : "commercial-live-dot"} />
            <span>{previewMode ? "Preview workspace" : sessionLabel}</span>
          </div>
        </div>
      </div>

      <nav className="commercial-primary-actions" aria-label="أدوات MarketOS الرئيسية">
        <button
          className={watchlistOpen ? "commercial-icon-button active" : "commercial-icon-button"}
          onClick={onToggleWatchlist}
          title="قائمة المتابعة"
        >
          <Icon name="watchlist" />
          <span>المتابعة</span>
        </button>

        <button className="commercial-icon-button" onClick={onMarket} title="السوق">
          <Icon name="market" />
          <span>السوق</span>
        </button>

        <button
          className={alertCount > 0 ? "commercial-icon-button active has-badge" : "commercial-icon-button"}
          onClick={onAlerts}
          title="التنبيهات"
        >
          <Icon name="alert" />
          <span>التنبيهات</span>
          {alertCount > 0 ? <b>{alertCount}</b> : null}
        </button>

        <button
          className={aiOpen ? "commercial-icon-button ai active" : "commercial-icon-button ai"}
          onClick={onToggleAi}
          title="MarketOS AI"
        >
          <Icon name="sparkles" />
          <span>AI</span>
        </button>
      </nav>

      <div className="commercial-topbar-end">
        {workspaceSlot}

        <div className="commercial-more-wrap">
          <button
            className={moreOpen ? "commercial-icon-button active compact" : "commercial-icon-button compact"}
            onClick={() => setMoreOpen((value) => !value)}
            title="المزيد"
          >
            <Icon name="more" />
          </button>

          {moreOpen ? (
            <div className="commercial-more-menu">
              <button onClick={() => { onCorrelation(); setMoreOpen(false); }}>
                <Icon name="correlation" />
                <span>مصفوفة الارتباط</span>
              </button>
              <button onClick={() => { onEvents(); setMoreOpen(false); }}>
                <Icon name="calendar" />
                <span>أحداث السوق</span>
                {eventCount > 0 ? <b>{eventCount}</b> : null}
              </button>
              <button onClick={() => { onCompanyFeed(); setMoreOpen(false); }}>
                <Icon name="company" />
                <span>إفصاحات الشركات</span>
                {companyCount > 0 ? <b>{companyCount}</b> : null}
              </button>
              <button onClick={() => { onStrategy(); setMoreOpen(false); }}>
                <Icon name="strategy" />
                <span>Strategy Tester</span>
              </button>
              <button onClick={() => { onSystem(); setMoreOpen(false); }}>
                <Icon name="system" />
                <span>حالة النظام</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
