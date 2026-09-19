import {
  PLAN_DEFINITIONS,
  type PlanDefinition,
  type PlanId,
  type ResolvedEntitlement,
} from "@marketos/entitlements-core";

type Props = {
  open: boolean;
  entitlement: ResolvedEntitlement;
  message?: string | null;
  onClose: () => void;
};

const featureLabels: Array<{
  key: keyof PlanDefinition["features"];
  label: string;
}> = [
  { key: "multiChart", label: "شارتات متعددة" },
  { key: "quadChart", label: "تخطيط 4×" },
  { key: "customIndicatorLab", label: "معمل المؤشرات" },
  { key: "strategyTester", label: "Strategy Tester" },
  { key: "smartScreener", label: "Smart Screener" },
  { key: "correlationMatrix", label: "Correlation Matrix" },
  { key: "multiTimeframeAi", label: "Multi‑Timeframe AI" },
  { key: "serverAlerts", label: "تنبيهات سحابية" },
  { key: "backgroundAlerts", label: "تنبيهات بالخلفية" },
  { key: "companyFeed", label: "إفصاحات الشركات" },
];

const planOrder: PlanId[] = [
  "free",
  "pro",
  "elite",
];

function PlanCard({
  definition,
  current,
}: {
  definition: PlanDefinition;
  current: boolean;
}) {
  return (
    <article
      className={
        current
          ? "plan-card current"
          : "plan-card"
      }
    >
      <div className="plan-card-head">
        <div>
          <strong>{definition.name}</strong>
          <small>
            {definition.description}
          </small>
        </div>
        {current ? (
          <span>خطتك الحالية</span>
        ) : null}
      </div>

      <div className="plan-limits">
        <div>
          <span>Lists</span>
          <b>
            {definition.limits.watchlists}
          </b>
        </div>
        <div>
          <span>Symbols</span>
          <b>
            {definition.limits.watchlistItems}
          </b>
        </div>
        <div>
          <span>Layouts</span>
          <b>
            {definition.limits.savedWorkspaces}
          </b>
        </div>
        <div>
          <span>Alerts</span>
          <b>
            {definition.limits.alerts}
          </b>
        </div>
        <div>
          <span>Custom</span>
          <b>
            {definition.limits.customIndicators}
          </b>
        </div>
        <div>
          <span>Templates</span>
          <b>
            {definition.limits.chartTemplates}
          </b>
        </div>
      </div>

      <div className="plan-features">
        {featureLabels.map((item) => (
          <div key={item.key}>
            <span>
              {
                definition.features[
                  item.key
                ]
                  ? "✓"
                  : "—"
              }
            </span>
            <b>{item.label}</b>
          </div>
        ))}
      </div>

    </article>
  );
}

export default function PlansPanel({
  open,
  entitlement,
  message,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="plans-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="MarketOS Plans"
    >
      <button
        className="plans-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section
        className="plans-panel"
        dir="rtl"
      >
        <header className="plans-header">
          <div>
            <span className="plans-eyebrow">
              MARKETOS PLANS
            </span>
            <h2>الخطط والحدود</h2>
            <p>
              الصلاحيات والحدود مطبقة من
              MarketOS API. الدفع سيُربط
              بمزود Billing مستقل.
            </p>
          </div>

          <button
            className="plans-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {message ? (
          <div className="plans-gate-message">
            {message}
          </div>
        ) : null}

        <div className="plans-grid">
          {planOrder.map((planId) => (
            <PlanCard
              key={planId}
              definition={
                PLAN_DEFINITIONS[
                  planId
                ]
              }
              current={
                entitlement.plan ===
                planId
              }
            />
          ))}
        </div>

        <div className="plans-billing-note">
          <strong>
            الدفع غير مربوط حتى الآن
          </strong>
          <span>
            الخطة الحالية Server-owned
            ومحمية. المرحلة التالية تربط
            Web Billing وApple/Google بدون
            تغيير منطق الصلاحيات.
          </span>
        </div>
      </section>
    </div>
  );
}
