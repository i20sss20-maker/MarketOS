import type { ProductionReadiness, SystemHealth } from "../lib/systemApi";

type Props = {
  open: boolean;
  health: SystemHealth | null;
  readiness: ProductionReadiness | null;
  loading: boolean;
  error: string | null;
  readinessError: string | null;
  onRefresh: () => void;
  onClose: () => void;
};

function dataTimingLabel(
  policy: SystemHealth["marketData"]["dataPolicy"],
) {
  if (!policy) return "التوقيت غير معلن";
  if (policy.timing === "realtime") return "لحظية حسب الترخيص";
  if (policy.timing === "delayed") {
    return `متأخرة ${policy.delayMinutes ?? "?"} دقيقة`;
  }
  if (policy.timing === "end-of-day") return "نهاية اليوم";
  return "التوقيت غير معلن";
}

function dataUsageLabel(
  policy: SystemHealth["marketData"]["dataPolicy"],
) {
  if (!policy) return "حقوق الاستخدام غير معلنة";
  if (policy.usageScope === "commercial") return "استخدام تجاري معلن";
  if (policy.usageScope === "personal") return "استخدام شخصي معلن";
  return "حقوق الاستخدام غير معلنة";
}

const readinessLabels: Record<string, string> = {
  REAL_DATA_MODE_DISABLED: "وضع البيانات الحقيقية غير مفعّل",
  REAL_DATA_REQUIRED: "مزود البيانات الحقيقي غير مهيأ",
  FORECAST_STORAGE_NOT_CONFIGURED: "سجل التوقعات الدائم غير مهيأ",
  WEB_ORIGIN_NOT_CONFIGURED: "رابط MarketOS الإنتاجي غير مهيأ",
  MARKET_DATA_TIMING_UNDECLARED: "توقيت بيانات السوق غير معلن",
  MARKET_DATA_DELAY_INVALID: "مدة تأخير البيانات غير صالحة",
  MARKET_DATA_USAGE_SCOPE_UNDECLARED: "نطاق حقوق استخدام البيانات غير معلن",
  MARKET_DATA_RIGHTS_UNCONFIRMED: "حقوق استخدام البيانات غير مؤكدة",
  MARKET_DATA_RIGHTS_CONFIRMATION_INVALID: "تاريخ تأكيد حقوق البيانات غير صالح",
  MARKET_DATA_RIGHTS_EXPIRED: "إقرار حقوق البيانات منتهي",
  ENTITLEMENTS_NOT_PERSISTENT: "الصلاحيات ليست محفوظة في Cosmos",
  METRIC_ALERTS_NOT_CONFIGURED: "تنبيهات Azure التشغيلية غير مهيأة",
  COST_BUDGET_NOT_CONFIGURED: "ميزانية Azure التنبيهية غير مهيأة",
  CONFIGURATION_INVALID: "إعداد إنتاجي غير صالح",
};

const acceptanceLabels: Record<string, string> = {
  HOSTED_AUTH_AND_OWNER_ISOLATION: "اختبار الدخول وعزل المستخدمين على الموقع المنشور",
  COSMOS_WRITE_READ_RESTART: "اختبار Cosmos حي: كتابة وقراءة واستمرارية",
  HOSTED_MARKET_DATA_ENTITLEMENT_AND_TIMESTAMPS: "اختبار ترخيص/توقيت بيانات السوق الحية",
  CLIENT_DEMO_FALLBACK_REMOVAL: "التأكد من عدم ظهور Demo في نسخة الإنتاج",
  SERVER_OUTCOME_EVALUATION: "تشغيل تقييم نتائج التوقعات على الخادم",
  HOSTED_QUOTA_CONCURRENCY: "اختبار حدود الاستخدام مع الطلبات المتزامنة",
  LOAD_TESTING_AND_RECOVERY: "اختبار الضغط والتعافي",
  APPLICATION_INSIGHTS_AND_LOG_REVIEW: "تفعيل ومراجعة سجلات Application Insights",
};

function readableGate(
  value: string,
  labels: Record<string, string>,
) {
  return labels[value] ?? value.replaceAll("_", " ");
}

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
  readiness,
  loading,
  error,
  readinessError,
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
                  <div className="system-capabilities">
                    <span>{dataTimingLabel(health.marketData.dataPolicy)}</span>
                    <span>{dataUsageLabel(health.marketData.dataPolicy)}</span>
                    <span>
                      {health.marketData.dataPolicy?.rightsConfirmed
                        ? "إقرار الحقوق ✓"
                        : "إقرار الحقوق —"}
                    </span>
                  </div>
                  <small>
                    حالة الحقوق هنا إقرار إعداد من المشغّل وليست تحققًا مستقلاً من الترخيص.
                  </small>
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
                    <StatusDot mode={health.companyFeed.mode} />
                    <strong>Company Feed</strong>
                  </div>
                  <span className="system-service-provider">{health.companyFeed.provider}</span>
                  <small>
                    {health.companyFeed.mode === "provider"
                      ? "إعلانات شركات خارجية متصلة"
                      : "إعلانات Demo للتطوير"}
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

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.userData.persistent ? "provider" : "demo"} />
                    <strong>Cloud User Data</strong>
                  </div>
                  <span className="system-service-provider">
                    {health.userData.provider === "cosmos" ? "Azure Cosmos DB" : "Memory"}
                  </span>
                  <small>
                    {health.userData.persistent
                      ? "تخزين مستخدم دائم ومهيأ للمزامنة"
                      : "تخزين مؤقت للتطوير فقط"}
                  </small>
                </article>

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.operations.configured ? "provider" : "demo"} />
                    <strong>Operations Guardrails</strong>
                  </div>
                  <span className="system-service-provider">
                    {health.operations.configured ? "Azure guardrails configured" : "Setup required"}
                  </span>
                  <small>
                    {health.operations.metricAlertsConfigured
                      ? "Metric alerts ✓"
                      : "Metric alerts —"}
                    {" · "}
                    {health.operations.costBudgetConfigured
                      ? "Cost budget ✓"
                      : "Cost budget —"}
                  </small>
                  <small>
                    ميزانية Azure تنبّه عند تجاوز الحدود ولا توقف الاستهلاك تلقائيًا.
                  </small>
                </article>

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.backgroundAlerts.enabled ? "provider" : "demo"} />
                    <strong>Background Alerts</strong>
                  </div>
                  <span className="system-service-provider">
                    {health.backgroundAlerts.enabled ? "Azure Timer Worker" : "Manual only"}
                  </span>
                  <small>
                    {health.backgroundAlerts.enabled
                      ? "فحص تنبيهات مجدول حتى عند إغلاق MarketOS"
                      : "التنبيهات السحابية تعمل يدويًا فقط"}
                  </small>
                </article>

                <article className="system-service-card">
                  <div className="system-service-title">
                    <StatusDot mode={health.webPush.enabled ? "provider" : "demo"} />
                    <strong>Web Push</strong>
                  </div>
                  <span className="system-service-provider">
                    {health.webPush.enabled ? "VAPID configured" : "Disabled"}
                  </span>
                  <small>
                    {health.webPush.enabled
                      ? "إشعارات فورية للأجهزة المسجلة"
                      : "شغّل bootstrap-web-push لتفعيل الإشعارات"}
                  </small>
                </article>
              </div>

              <article className="system-service-card">
                <div className="system-service-title">
                  <StatusDot mode={readiness?.configured ? "provider" : "demo"} />
                  <strong>Production Gate</strong>
                </div>
                <span className="system-service-provider">
                  {readiness?.configured
                    ? "Configuration checks passed"
                    : "Configuration blocked"}
                </span>
                <small>
                  نجاح الإعدادات لا يعني أن الإطلاق التجاري معتمد؛ اختبارات القبول الحية تبقى مستقلة.
                </small>
                {readinessError ? (
                  <div className="system-warning">{readinessError}</div>
                ) : null}
                {readiness?.blockers.length ? (
                  <div className="system-capabilities">
                    {readiness.blockers.map((item) => (
                      <span key={item}>✕ {readableGate(item, readinessLabels)}</span>
                    ))}
                  </div>
                ) : readiness ? (
                  <div className="system-capabilities">
                    <span>إعدادات الإنتاج ✓</span>
                  </div>
                ) : null}
                {readiness?.requiredAcceptanceChecks.length ? (
                  <details>
                    <summary>اختبارات القبول المتبقية ({readiness.requiredAcceptanceChecks.length})</summary>
                    <div className="system-capabilities">
                      {readiness.requiredAcceptanceChecks.map((item) => (
                        <span key={item}>• {readableGate(item, acceptanceLabels)}</span>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>

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
