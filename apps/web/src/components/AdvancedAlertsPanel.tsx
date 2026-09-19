import { useEffect, useMemo, useState } from "react";
import {
  alertMetricLabels,
  createAlertConditionId,
  describeAdvancedAlert,
  type AdvancedAlert,
  type AdvancedAlertCondition,
  type AlertLogic,
  type NumericAlertMetric,
} from "@marketos/alert-core";
import type { MarketSymbol, Timeframe } from "@marketos/market-core";

const alertTimeframes: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
];

const numericMetrics: Array<{
  id: NumericAlertMetric;
  label: string;
  defaultValue: number;
  step?: string;
}> = [
  { id: "price", label: "السعر", defaultValue: 100, step: "0.01" },
  { id: "changePercent", label: "التغير %", defaultValue: 2, step: "0.1" },
  { id: "volume", label: "الحجم", defaultValue: 1_000_000, step: "1000" },
  { id: "rsi14", label: "RSI 14", defaultValue: 30, step: "1" },
  { id: "sma20Distance", label: "البعد عن SMA20 %", defaultValue: 1, step: "0.1" },
];

function newNumericCondition(
  metric: NumericAlertMetric = "price",
  value?: number,
): AdvancedAlertCondition {
  const definition = numericMetrics.find((item) => item.id === metric) ?? numericMetrics[0];
  return {
    id: createAlertConditionId(),
    type: "numeric",
    metric,
    operator: "above",
    value: value ?? definition.defaultValue,
  };
}

function statusLabel(alert: AdvancedAlert) {
  if (alert.triggeredAt) return "تم التفعيل";
  if (!alert.enabled) return "متوقف";
  return "نشط";
}

function formatDate(value?: number) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

type Props = {
  open: boolean;
  symbol: MarketSymbol;
  currentTimeframe: Timeframe;
  currentPrice?: number;
  alerts: AdvancedAlert[];
  checking: boolean;
  serverChecking: boolean;
  cloudAvailable: boolean;
  checkMessage: string | null;
  onCreate: (
    timeframe: Timeframe,
    logic: AlertLogic,
    conditions: AdvancedAlertCondition[],
  ) => void;
  onDelete: (id: string) => void;
  onRearm: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  onCheckAll: () => void;
  onServerCheck: () => void;
  onClose: () => void;
};

export default function AdvancedAlertsPanel({
  open,
  symbol,
  currentTimeframe,
  currentPrice,
  alerts,
  checking,
  serverChecking,
  cloudAvailable,
  checkMessage,
  onCreate,
  onDelete,
  onRearm,
  onToggleEnabled,
  onCheckAll,
  onServerCheck,
  onClose,
}: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>(currentTimeframe);
  const [logic, setLogic] = useState<AlertLogic>("all");
  const [conditions, setConditions] = useState<AdvancedAlertCondition[]>([
    newNumericCondition("price", currentPrice),
  ]);

  useEffect(() => {
    if (!open) return;
    setTimeframe(currentTimeframe);
  }, [open, currentTimeframe]);

  useEffect(() => {
    if (!open || currentPrice === undefined) return;
    setConditions((current) => {
      if (
        current.length !== 1 ||
        current[0].type !== "numeric" ||
        current[0].metric !== "price"
      ) {
        return current;
      }

      return [{
        ...current[0],
        value: Number(currentPrice.toFixed(4)),
      }];
    });
  }, [open, currentPrice]);

  const symbolAlerts = useMemo(
    () => alerts.filter((alert) => alert.symbol.id === symbol.id),
    [alerts, symbol.id],
  );

  if (!open) return null;

  const updateCondition = (
    id: string,
    updater: (condition: AdvancedAlertCondition) => AdvancedAlertCondition,
  ) => {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id ? updater(condition) : condition,
      ),
    );
  };

  const changeMetric = (id: string, metric: string) => {
    updateCondition(id, (condition) => {
      if (metric === "sma20CrossAbove" || metric === "sma20CrossBelow") {
        return {
          id: condition.id,
          type: "sma20Cross",
          direction: metric === "sma20CrossAbove" ? "above" : "below",
        };
      }

      const numericMetric = metric as NumericAlertMetric;
      const definition = numericMetrics.find((item) => item.id === numericMetric);
      return {
        id: condition.id,
        type: "numeric",
        metric: numericMetric,
        operator: "above",
        value: definition?.defaultValue ?? 0,
      };
    });
  };

  const addCondition = () => {
    setConditions((current) =>
      current.length >= 4
        ? current
        : [...current, newNumericCondition("changePercent")],
    );
  };

  const removeCondition = (id: string) => {
    setConditions((current) =>
      current.length <= 1
        ? current
        : current.filter((condition) => condition.id !== id),
    );
  };

  const submit = () => {
    if (conditions.length === 0) return;
    onCreate(timeframe, logic, conditions);
    setConditions([newNumericCondition("price", currentPrice)]);
  };

  return (
    <div className="advanced-alert-overlay" role="dialog" aria-modal="true" aria-label="Advanced Alerts">
      <button className="advanced-alert-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="advanced-alert-panel" dir="rtl">
        <header className="advanced-alert-header">
          <div>
            <span className="advanced-alert-eyebrow">MARKETOS ALERTS V2</span>
            <h2>التنبيهات المتقدمة</h2>
            <p>{symbol.ticker} · شروط متعددة ومؤشرات وفريم مستقل</p>
          </div>
          <div className="advanced-alert-header-actions">
            <button
              onClick={onCheckAll}
              disabled={checking || serverChecking || alerts.length === 0}
              title="يفحص التنبيهات من هذا المتصفح الآن"
            >
              {checking ? "فحص…" : "فحص محلي"}
            </button>
            <button
              className="advanced-alert-cloud-check"
              onClick={onServerCheck}
              disabled={checking || serverChecking || alerts.length === 0}
              title={
                cloudAvailable
                  ? "يرفع التنبيهات الحالية ثم يفحصها من MarketOS API"
                  : "سجل الدخول أولًا لاستخدام الفحص السحابي"
              }
            >
              {serverChecking
                ? "سحابي…"
                : cloudAvailable
                  ? "فحص سحابي"
                  : "فحص سحابي 🔒"}
            </button>
            <button className="advanced-alert-close" onClick={onClose}>×</button>
          </div>
        </header>

        {checkMessage ? <div className="advanced-alert-message">{checkMessage}</div> : null}

        <div className="advanced-alert-body">
          <aside className="advanced-alert-builder">
            <div className="advanced-alert-section-title">إنشاء تنبيه</div>

            <div className="advanced-alert-meta">
              <label>
                <span>الفريم</span>
                <select
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value as Timeframe)}
                >
                  {alertTimeframes.map((item) => (
                    <option value={item} key={item}>{item.toUpperCase()}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>المنطق</span>
                <select
                  value={logic}
                  onChange={(event) => setLogic(event.target.value as AlertLogic)}
                >
                  <option value="all">كل الشروط AND</option>
                  <option value="any">أي شرط OR</option>
                </select>
              </label>
            </div>

            <div className="advanced-alert-condition-list">
              {conditions.map((condition, index) => (
                <div className="advanced-alert-condition" key={condition.id}>
                  <div className="advanced-alert-condition-index">{index + 1}</div>

                  <select
                    value={
                      condition.type === "sma20Cross"
                        ? condition.direction === "above"
                          ? "sma20CrossAbove"
                          : "sma20CrossBelow"
                        : condition.metric
                    }
                    onChange={(event) => changeMetric(condition.id, event.target.value)}
                  >
                    {numericMetrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>{metric.label}</option>
                    ))}
                    <option value="sma20CrossAbove">Cross ↑ SMA20</option>
                    <option value="sma20CrossBelow">Cross ↓ SMA20</option>
                  </select>

                  {condition.type === "numeric" ? (
                    <>
                      <select
                        value={condition.operator}
                        onChange={(event) =>
                          updateCondition(condition.id, (current) =>
                            current.type === "numeric"
                              ? {
                                  ...current,
                                  operator: event.target.value as "above" | "below",
                                }
                              : current,
                          )
                        }
                      >
                        <option value="above">≥ أعلى من</option>
                        <option value="below">≤ أقل من</option>
                      </select>

                      <input
                        type="number"
                        step={
                          numericMetrics.find((item) => item.id === condition.metric)?.step ?? "any"
                        }
                        value={condition.value}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          updateCondition(condition.id, (current) =>
                            current.type === "numeric"
                              ? { ...current, value }
                              : current,
                          );
                        }}
                      />
                    </>
                  ) : (
                    <div className="advanced-alert-cross-label">
                      {condition.direction === "above"
                        ? "تقاطع السعر فوق SMA20"
                        : "تقاطع السعر تحت SMA20"}
                    </div>
                  )}

                  <button
                    className="advanced-alert-remove"
                    onClick={() => removeCondition(condition.id)}
                    disabled={conditions.length <= 1}
                    title="حذف الشرط"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              className="advanced-alert-add-condition"
              onClick={addCondition}
              disabled={conditions.length >= 4}
            >
              + إضافة شرط {conditions.length}/4
            </button>

            <button className="advanced-alert-create" onClick={submit}>
              إنشاء تنبيه لـ {symbol.ticker}
            </button>

            <div className="advanced-alert-builder-note">
              الفحص المحلي يعمل من المتصفح. الفحص السحابي للمستخدم المسجل يرفع الحالة الحالية ثم يفحص التنبيهات عبر MarketOS API ويحفظ النتيجة في التخزين السحابي.
            </div>
          </aside>

          <main className="advanced-alert-list-wrap">
            <div className="advanced-alert-list-head">
              <div>
                <strong>التنبيهات</strong>
                <span>{alerts.filter((alert) => alert.enabled && !alert.triggeredAt).length} نشط</span>
              </div>
              <small>المعروض: {symbolAlerts.length} لهذا الرمز · {alerts.length} إجمالي</small>
            </div>

            <div className="advanced-alert-list">
              {alerts.map((alert) => (
                <article
                  className={[
                    "advanced-alert-card",
                    alert.triggeredAt ? "triggered" : "",
                    !alert.enabled ? "disabled" : "",
                  ].filter(Boolean).join(" ")}
                  key={alert.id}
                >
                  <div className="advanced-alert-card-main">
                    <div className="advanced-alert-card-title">
                      <strong>{alert.symbol.ticker}</strong>
                      <span>{alert.timeframe.toUpperCase()}</span>
                      <b>{alert.logic === "all" ? "AND" : "OR"}</b>
                    </div>
                    <p>{describeAdvancedAlert(alert)}</p>
                    <small>
                      {statusLabel(alert)}
                      {alert.lastCheckedAt ? ` · آخر فحص ${formatDate(alert.lastCheckedAt)}` : ""}
                    </small>
                  </div>

                  <div className="advanced-alert-card-actions">
                    {alert.triggeredAt ? (
                      <button onClick={() => onRearm(alert.id)}>إعادة تفعيل</button>
                    ) : (
                      <button onClick={() => onToggleEnabled(alert.id)}>
                        {alert.enabled ? "إيقاف" : "تشغيل"}
                      </button>
                    )}
                    <button className="danger" onClick={() => onDelete(alert.id)}>حذف</button>
                  </div>
                </article>
              ))}

              {alerts.length === 0 ? (
                <div className="advanced-alert-empty">
                  ما عندك تنبيهات. أنشئ أول تنبيه متعدد الشروط.
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}
