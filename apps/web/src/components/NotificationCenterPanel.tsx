import type {
  MarketNotification,
} from "../lib/notificationsApi";

type Props = {
  open: boolean;
  notifications: MarketNotification[];
  loading: boolean;
  error: string | null;
  storageMode: "memory" | "cosmos" | null;
  onClose: () => void;
  onRefresh: () => void;
  onMarkRead: (ids: string[]) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
};

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificationCenterPanel({
  open,
  notifications,
  loading,
  error,
  storageMode,
  onClose,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onClear,
}: Props) {
  if (!open) return null;

  const unread =
    notifications.filter((item) => !item.readAt);

  return (
    <div
      className="notifications-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="مركز إشعارات MarketOS"
    >
      <button
        className="notifications-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section className="notifications-panel" dir="rtl">
        <header className="notifications-header">
          <div>
            <span className="notifications-eyebrow">
              MARKETOS NOTIFICATIONS
            </span>
            <h2>الإشعارات</h2>
            <p>
              {unread.length > 0
                ? `${unread.length} غير مقروء`
                : "ما عندك إشعارات جديدة"}
              {" · "}
              {storageMode === "cosmos"
                ? "محفوظ في Cosmos"
                : "Preview storage"}
            </p>
          </div>

          <div className="notifications-header-actions">
            <button
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? "تحديث…" : "تحديث"}
            </button>
            <button
              className="notifications-close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="notifications-toolbar">
          <button
            onClick={onMarkAllRead}
            disabled={
              loading ||
              unread.length === 0
            }
          >
            تعليم الكل كمقروء
          </button>

          <button
            className="danger"
            onClick={onClear}
            disabled={
              loading ||
              notifications.length === 0
            }
          >
            مسح السجل
          </button>
        </div>

        {error ? (
          <div className="notifications-error">
            {error}
          </div>
        ) : null}

        <div className="notifications-list">
          {loading && notifications.length === 0 ? (
            <div className="notifications-empty">
              جاري تحميل الإشعارات…
            </div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty">
              <span>✓</span>
              <strong>كل شيء هادئ</strong>
              <small>
                عندما يتحقق تنبيه سحابي أو مجدول يظهر هنا.
              </small>
            </div>
          ) : (
            notifications.map((item) => (
              <article
                className={
                  item.readAt
                    ? "notification-item read"
                    : "notification-item unread"
                }
                key={item.id}
              >
                <span className="notification-status-dot" />

                <div className="notification-copy">
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <div>
                    <span>{timeLabel(item.createdAt)}</span>
                    {item.symbol ? (
                      <b dir="ltr">
                        {item.symbol}
                        {item.timeframe
                          ? ` · ${item.timeframe.toUpperCase()}`
                          : ""}
                      </b>
                    ) : null}
                  </div>
                </div>

                {!item.readAt ? (
                  <button
                    className="notification-read"
                    onClick={() =>
                      onMarkRead([item.id])
                    }
                  >
                    مقروء
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
