import { useMemo, useState } from "react";
import type { CompanyRelease } from "@marketos/market-core";

type Props = {
  open: boolean;
  releases: CompanyRelease[];
  provider: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  const deltaMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const absolute = Math.abs(deltaMinutes);

  if (absolute < 60) {
    return new Intl.RelativeTimeFormat("ar", { numeric: "auto" })
      .format(deltaMinutes, "minute");
  }

  const hours = Math.round(deltaMinutes / 60);
  if (Math.abs(hours) < 48) {
    return new Intl.RelativeTimeFormat("ar", { numeric: "auto" })
      .format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  return new Intl.RelativeTimeFormat("ar", { numeric: "auto" })
    .format(days, "day");
}

export default function CompanyFeedPanel({
  open,
  releases,
  provider,
  loading,
  error,
  onRefresh,
  onClose,
  onSelectSymbol,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, CompanyRelease[]>();

    for (const release of releases) {
      const current = map.get(release.symbol) ?? [];
      current.push(release);
      map.set(release.symbol, current);
    }

    return [...map.entries()]
      .sort(([, a], [, b]) =>
        (b[0]?.datetime ?? "").localeCompare(a[0]?.datetime ?? ""),
      );
  }, [releases]);

  if (!open) return null;

  return (
    <div className="company-feed-overlay" role="dialog" aria-modal="true" aria-label="Company Feed">
      <button className="company-feed-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="company-feed-panel" dir="rtl">
        <header className="company-feed-header">
          <div>
            <span className="company-feed-eyebrow">MARKETOS COMPANY FEED</span>
            <h2>إعلانات الشركات</h2>
            <p>
              بيانات صحفية وإعلانات شركات مرتبطة بقائمة المتابعة · المصدر: {provider}
            </p>
          </div>

          <div className="company-feed-header-actions">
            <button onClick={onRefresh} disabled={loading}>
              {loading ? "تحميل…" : "تحديث"}
            </button>
            <button className="company-feed-close" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="company-feed-toolbar">
          <span>آخر الشركات</span>
          <strong>{grouped.length}</strong>
          <span>الإعلانات</span>
          <strong>{releases.length}</strong>
          <span className="company-feed-cost-note">
            التحديث يدوي لتقليل استهلاك مزود البيانات
          </span>
        </div>

        {error ? <div className="company-feed-warning">{error}</div> : null}

        <div className="company-feed-content">
          {loading && releases.length === 0 ? (
            <div className="company-feed-empty">جاري تحميل إعلانات الشركات…</div>
          ) : releases.length === 0 ? (
            <div className="company-feed-empty">
              لا توجد إعلانات مرتبطة بقائمة المتابعة حاليًا.
            </div>
          ) : (
            grouped.map(([symbol, items]) => (
              <section className="company-feed-symbol-group" key={symbol}>
                <div className="company-feed-symbol-head">
                  <button onClick={() => onSelectSymbol(symbol)}>
                    <strong>{symbol}</strong>
                    <span>{items[0]?.name ?? items[0]?.exchange ?? ""}</span>
                  </button>
                  <small>{items.length} إعلان</small>
                </div>

                <div className="company-release-list">
                  {items.map((release) => {
                    const expanded = expandedId === release.id;
                    return (
                      <article
                        className={expanded ? "company-release-card expanded" : "company-release-card"}
                        key={release.id}
                      >
                        <button
                          className="company-release-summary"
                          onClick={() => setExpandedId(expanded ? null : release.id)}
                        >
                          <span className="company-release-meta">
                            <b>{release.symbol}</b>
                            <span>{release.exchange ?? release.micCode ?? "—"}</span>
                          </span>

                          <span className="company-release-main">
                            <strong>{release.title}</strong>
                            <small>
                              {formatDateTime(release.datetime)}
                              {relativeTime(release.datetime)
                                ? ` · ${relativeTime(release.datetime)}`
                                : ""}
                            </small>
                          </span>

                          <span className="company-release-languages">
                            {release.languages.length > 0
                              ? release.languages.join(" · ")
                              : "—"}
                          </span>

                          <span className="company-release-chevron">
                            {expanded ? "⌃" : "⌄"}
                          </span>
                        </button>

                        {expanded ? (
                          <div className="company-release-details">
                            <p>{release.bodyText || "لا يوجد نص متاح لهذا الإعلان."}</p>
                            <div className="company-release-actions">
                              <span>Source: {release.source}</span>
                              <button onClick={() => onSelectSymbol(release.symbol)}>
                                فتح {release.symbol} في الشارت
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
