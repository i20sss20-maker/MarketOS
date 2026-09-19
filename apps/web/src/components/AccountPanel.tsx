import type { ResolvedEntitlement } from "@marketos/entitlements-core";
import type {
  AuthPrincipal,
  CloudStateResponse,
} from "../lib/cloudState";

type Props = {
  open: boolean;
  user: AuthPrincipal | null;
  checked: boolean;
  cloud: CloudStateResponse | null;
  entitlement: ResolvedEntitlement;
  entitlementLoading: boolean;
  entitlementError: string | null;
  busy: boolean;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onRestore: () => void;
  onDeleteCloud: () => void;
  onShowPlans: () => void;
};

function providerLabel(provider: string) {
  if (provider === "aad") return "Microsoft";
  if (provider === "github") return "GitHub";
  return provider;
}

function dateLabel(timestamp: number | null | undefined) {
  if (!timestamp) return "لا توجد نسخة سحابية";
  return new Date(timestamp).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AccountPanel({
  open,
  user,
  checked,
  cloud,
  entitlement,
  entitlementLoading,
  entitlementError,
  busy,
  error,
  message,
  onClose,
  onRefresh,
  onUpload,
  onRestore,
  onDeleteCloud,
  onShowPlans,
}: Props) {
  if (!open) return null;

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="حساب MarketOS">
      <button className="account-backdrop" aria-label="إغلاق" onClick={onClose} />
      <section className="account-panel" dir="rtl">
        <header className="account-header">
          <div>
            <span className="account-eyebrow">MARKETOS ACCOUNT</span>
            <h2>الحساب والمزامنة</h2>
            <p>حفظ Watchlist وLayouts والتنبيهات والإعدادات بين أجهزتك.</p>
          </div>
          <button className="account-close" onClick={onClose}>×</button>
        </header>

        <div className="account-content">
          {!checked ? (
            <div className="account-empty">جاري التحقق من جلسة الحساب…</div>
          ) : !user ? (
            <div className="account-login">
              <div className="account-login-mark">M</div>
              <h3>سجّل الدخول لحفظ MarketOS</h3>
              <p>
                حسابك المحلي يظل كما هو. المزامنة السحابية تبدأ فقط بعد تسجيل الدخول واختيار رفع أو استرجاع البيانات.
              </p>
              <a className="account-provider microsoft" href="/login/microsoft">
                المتابعة بحساب Microsoft
              </a>
              <a className="account-provider github" href="/login/github">
                المتابعة بحساب GitHub
              </a>
            </div>
          ) : (
            <>
              <div className="account-profile">
                <div className="account-avatar">
                  {(user.userDetails || "M").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <strong>{user.userDetails || "MarketOS User"}</strong>
                  <small>{providerLabel(user.identityProvider)} · حساب متصل</small>
                </div>
                <span className="account-connected">متصل</span>
              </div>

              <div className="account-plan-card">
                <div className="account-plan-main">
                  <div>
                    <span>الخطة</span>
                    <strong>
                      {entitlementLoading
                        ? "جاري التحقق…"
                        : entitlement.definition.name}
                    </strong>
                  </div>
                  <span className={`account-plan-status ${entitlement.status}`}>
                    {entitlement.status === "trialing"
                      ? "تجريبية"
                      : entitlement.status === "active"
                        ? "نشطة"
                        : entitlement.status === "past_due"
                          ? "تحتاج تحديث دفع"
                          : "ملغاة"}
                  </span>
                </div>

                <div className="account-plan-limits">
                  <span>
                    Watchlist
                    <b>{entitlement.definition.limits.watchlistItems}</b>
                  </span>
                  <span>
                    Layouts
                    <b>{entitlement.definition.limits.savedWorkspaces}</b>
                  </span>
                  <span>
                    Alerts
                    <b>{entitlement.definition.limits.alerts}</b>
                  </span>
                  <span>
                    Custom
                    <b>{entitlement.definition.limits.customIndicators}</b>
                  </span>
                </div>

                {entitlementError ? (
                  <div className="account-plan-error">
                    {entitlementError}
                  </div>
                ) : null}

                <button
                  className="account-plan-button"
                  onClick={onShowPlans}
                >
                  عرض الخطط
                </button>
              </div>

              <div className="account-cloud-card">
                <div>
                  <span>التخزين السحابي</span>
                  <strong>{cloud?.storageMode === "cosmos" ? "Azure Cosmos DB" : "Preview Memory"}</strong>
                </div>
                <div>
                  <span>آخر نسخة</span>
                  <strong>{dateLabel(cloud?.updatedAt)}</strong>
                </div>
              </div>

              {cloud?.storageMode === "memory" ? (
                <div className="account-warning">
                  التخزين الحالي مؤقت للتطوير. فعّل Cosmos DB قبل الاعتماد التجاري.
                </div>
              ) : null}

              {error ? <div className="account-error">{error}</div> : null}
              {message ? <div className="account-message">{message}</div> : null}

              <div className="account-sync-actions">
                <button className="primary" onClick={onUpload} disabled={busy}>
                  رفع بيانات هذا الجهاز
                  <small>يحفظ الحالة الحالية في السحابة</small>
                </button>
                <button onClick={onRestore} disabled={busy || !cloud?.state}>
                  استرجاع نسخة السحابة
                  <small>يستبدل بيانات هذا الجهاز بعد التأكيد</small>
                </button>
              </div>

              <div className="account-secondary-actions">
                <button onClick={onRefresh} disabled={busy}>تحديث الحالة</button>
                <button className="danger" onClick={onDeleteCloud} disabled={busy || !cloud?.state}>
                  حذف النسخة السحابية
                </button>
                <a href="/logout">تسجيل الخروج</a>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
