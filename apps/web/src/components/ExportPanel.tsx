type Props = {
  open: boolean;
  ticker: string;
  timeframe: string;
  candleCount: number;
  canSnapshot: boolean;
  message: string | null;
  error: string | null;
  onExportPng: () => void;
  onExportCsv: () => void;
  onCopyLink: () => void;
  onClose: () => void;
};

export default function ExportPanel({
  open,
  ticker,
  timeframe,
  candleCount,
  canSnapshot,
  message,
  error,
  onExportPng,
  onExportCsv,
  onCopyLink,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="export-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Export MarketOS chart"
    >
      <button
        className="export-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section
        className="export-panel"
        dir="rtl"
      >
        <header className="export-header">
          <div>
            <span className="export-eyebrow">
              MARKETOS EXPORT
            </span>
            <h2>تصدير ومشاركة</h2>
            <p dir="ltr">
              {ticker} · {timeframe.toUpperCase()}
            </p>
          </div>
          <button
            className="export-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="export-grid">
          <button
            className="export-card primary"
            onClick={onExportPng}
            disabled={!canSnapshot}
          >
            <span className="export-card-icon">▣</span>
            <strong>صورة PNG</strong>
            <small>
              الشارت الحالي مع المؤشرات والرسومات
            </small>
          </button>

          <button
            className="export-card"
            onClick={onExportCsv}
            disabled={candleCount === 0}
          >
            <span className="export-card-icon">CSV</span>
            <strong>بيانات CSV</strong>
            <small>
              {candleCount} شمعة من البيانات المعروضة
            </small>
          </button>

          <button
            className="export-card"
            onClick={onCopyLink}
          >
            <span className="export-card-icon">↗</span>
            <strong>نسخ رابط</strong>
            <small>
              يفتح نفس الرمز والفريم ونوع الشارت
            </small>
          </button>
        </div>

        {message ? (
          <div className="export-message">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="export-error">
            {error}
          </div>
        ) : null}

        <footer className="export-footnote">
          PNG يتم إنشاؤها محليًا من الشارت بدون رفع الصورة للسيرفر.
          CSV يستخدم البيانات الموجودة أصلًا ولا يستهلك طلبات Market Data إضافية.
        </footer>
      </section>
    </div>
  );
}
