import type { SystemHealth } from "../lib/systemApi";

type Props = {
  open: boolean;
  health: SystemHealth | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
};

function StatusDot({ mode }: { mode: string }) {
  const state =
    mode === "provider"
      ? "provider"
      : mode === "local"
        ? "local"
        : "demo";

  return <span className={`system-status-dot ${state}`} />;
}

export default function SystemPanel({
  open,
  health,
  loading,
  error,
  onRefresh,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="system-overlay" role="dialog" aria-modal="true" aria-label="MarketOS System Health">
      <button className="system-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="system-panel" dir="rtl">
        <header className="system-header">
          <div>
            <span className="system-eyebrow">MARKETOS SYSTEM</span>
            <h2>حالة النظام</h2>
            <p>فحص آمن للمزودات والبيئة بدون عرض أي مفاتيح أو أسرار.</p>
          </div>
          <div className="system-header-actions">
            <button onClick={onRefresh} disabled={loading}>
              {loading ? "فحص…" : "تحديث"}
            </button>
            <button className="system-close" onClick={onClose}>×</button>
          </div>
        </header>

        {error ? <div className="system-warning">{error}</div> : null}

        <div className="system-content">
          {loading && !health ? (
            <div className="system-empty">جاري فحص MarketOS API…</div>
          ) : health ? (
            <>
              <div className="system-summary">
                <div>
                  <span>البيئة</span>
                  <strong>{health.environment}</strong>
                </div>
                <div>
                  <span>الإصدار</span>
                  <strong>{health.version}</strong>
                </div>
                <div>
                  <span>Build SHA</span>
                  <strong dir="ltr">{health.buildSha}</strong>
                </div>
                <div>
                  <span>API</span>
                  <strong className={health.ok ? "positive" : "negative"}>
                    {health.ok ? "Online" : "Offline"}
                  </strong>
                </div>
              </div>

              <div className="system-services">
                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.marketData.mode} />
                    <strong>Market Data</strong>
                  </div>
                  <span className="system-service-provider">{health.marketData.provider}</span>
                  <small>
                    {health.marketData.mode === "provider"
                      ? "مزود بيانات خارجي متصل"
                      : "بيانات Demo للتطوير"}
                  </small>
                  <div className="system-capabilities">
                    <span>{health.marketData.supportsSearch ? "Search ✓" : "Search —"}</span>
                    <span>{health.marketData.supportsQuotes ? "Quotes ✓" : "Quotes —"}</span>
                    <span>{health.marketData.supportsCandles ? "Candles ✓" : "Candles —"}</span>
                  </div>
                </article>

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.marketEvents.mode} />
                    <strong>Market Events</strong>
                  </div>
                  <span className="system-service-provider">{health.marketEvents.provider}</span>
                  <small>
                    {health.marketEvents.mode === "provider"
                      ? "تقويم أحداث خارجي متصل"
                      : "تقويم Demo للتطوير"}
                  </small>
                </article>

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.ai.mode} />
                    <strong>AI Engine</strong>
                  </div>
                  <span className="system-service-provider">{health.ai.provider}</span>
                  <small>
                    {health.ai.mode === "provider"
                      ? "مزود AI خارجي"
                      : "محرك MarketOS المحلي"}
                  </small>
                </article>
              </div>

              <div className="system-footnote">
                آخر فحص:{" "}
                <span dir="ltr">
                  {new Date(health.generatedAt * 1000).toLocaleString("en-GB")}
                </span>
              </div>
            </>
          ) : (
            <div className="system-empty">ما قدرنا نقرأ حالة النظام.</div>
          )}
        </div>
      </section>
    </div>
  );
}
