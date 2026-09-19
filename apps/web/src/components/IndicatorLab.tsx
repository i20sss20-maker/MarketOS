import { useMemo, useState } from "react";
import { validateFormula } from "@marketos/formula-core";
import {
  createCustomIndicator,
  customIndicatorPresets,
  type CustomIndicatorDefinition,
  type CustomIndicatorPane,
} from "../lib/customIndicators";

type Props = {
  open: boolean;
  indicators: CustomIndicatorDefinition[];
  onChange: (indicators: CustomIndicatorDefinition[]) => void;
  onClose: () => void;
};

export default function IndicatorLab({
  open,
  indicators,
  onChange,
  onClose,
}: Props) {
  const [name, setName] = useState("مؤشر مخصص");
  const [formula, setFormula] = useState("EMA(CLOSE, 20)");
  const [pane, setPane] = useState<CustomIndicatorPane>("price");
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => validateFormula(formula), [formula]);

  if (!open) return null;

  const save = () => {
    try {
      if (indicators.length >= 20) {
        setError("الحد الأقصى 20 مؤشرًا مخصصًا.");
        return;
      }

      const created = createCustomIndicator({ name, formula, pane });
      onChange([created, ...indicators]);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المؤشر.");
    }
  };

  const toggle = (id: string) => {
    onChange(
      indicators.map((indicator) =>
        indicator.id === id
          ? { ...indicator, enabled: !indicator.enabled }
          : indicator,
      ),
    );
  };

  const remove = (id: string) => {
    onChange(indicators.filter((indicator) => indicator.id !== id));
  };

  const usePreset = (preset: (typeof customIndicatorPresets)[number]) => {
    setName(preset.name);
    setFormula(preset.formula);
    setPane(preset.pane);
    setError(null);
  };

  return (
    <div className="indicator-lab-overlay" role="dialog" aria-modal="true" aria-label="Indicator Lab">
      <button className="indicator-lab-backdrop" aria-label="إغلاق" onClick={onClose} />
      <section className="indicator-lab-panel" dir="rtl">
        <header className="indicator-lab-header">
          <div>
            <span className="indicator-lab-eyebrow">MARKETOS INDICATOR LAB</span>
            <h2>معمل المؤشرات</h2>
            <p>معادلات آمنة بدون JavaScript أو eval، وتُحسب محليًا من بيانات الشارت.</p>
          </div>
          <button className="indicator-lab-close" onClick={onClose}>×</button>
        </header>

        <div className="indicator-lab-body">
          <aside className="indicator-lab-editor">
            <div className="indicator-lab-section-title">مؤشر جديد</div>

            <label className="indicator-lab-field">
              <span>الاسم</span>
              <input
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="indicator-lab-field">
              <span>المعادلة</span>
              <textarea
                value={formula}
                maxLength={240}
                onChange={(event) => setFormula(event.target.value)}
                spellCheck={false}
                dir="ltr"
              />
            </label>

            <div className={validation.ok ? "formula-status valid" : "formula-status invalid"}>
              {validation.ok ? "المعادلة صحيحة" : validation.error}
            </div>

            <div className="indicator-pane-toggle">
              <button
                className={pane === "price" ? "selected" : ""}
                onClick={() => setPane("price")}
              >
                فوق السعر
              </button>
              <button
                className={pane === "separate" ? "selected" : ""}
                onClick={() => setPane("separate")}
              >
                Pane مستقل
              </button>
            </div>

            <button
              className="indicator-save"
              onClick={save}
              disabled={!validation.ok || !name.trim() || indicators.length >= 20}
            >
              إضافة المؤشر
            </button>

            {error ? <div className="indicator-lab-error">{error}</div> : null}

            <div className="indicator-lab-section-title">الصيغة المدعومة</div>
            <div className="formula-reference" dir="ltr">
              <code>OPEN HIGH LOW CLOSE VOLUME</code>
              <code>SMA(source, 20)</code>
              <code>EMA(source, 20)</code>
              <code>RSI(14)</code>
              <code>RSI(source, 14)</code>
              <code>ATR(14)</code>
              <code>ABS(x) MIN(a,b) MAX(a,b)</code>
              <code>+ - * / ( )</code>
            </div>
          </aside>

          <main className="indicator-lab-main">
            <div className="indicator-lab-section-title">قوالب سريعة</div>
            <div className="indicator-presets">
              {customIndicatorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => usePreset(preset)}
                >
                  <strong>{preset.name}</strong>
                  <small dir="ltr">{preset.formula}</small>
                </button>
              ))}
            </div>

            <div className="indicator-list-head">
              <div>
                <span className="indicator-lab-section-title">مؤشراتي</span>
                <small>{indicators.length} / 20</small>
              </div>
            </div>

            <div className="custom-indicator-list">
              {indicators.map((indicator) => (
                <article
                  className={indicator.enabled ? "custom-indicator-row enabled" : "custom-indicator-row"}
                  key={indicator.id}
                >
                  <button
                    className="indicator-enable"
                    onClick={() => toggle(indicator.id)}
                    title={indicator.enabled ? "إيقاف" : "تشغيل"}
                  >
                    {indicator.enabled ? "✓" : "○"}
                  </button>
                  <div className="custom-indicator-info">
                    <strong>{indicator.name}</strong>
                    <small dir="ltr">{indicator.formula}</small>
                    <span>{indicator.pane === "price" ? "Price Overlay" : "Separate Pane"}</span>
                  </div>
                  <button
                    className="custom-indicator-delete"
                    onClick={() => remove(indicator.id)}
                    title="حذف"
                  >
                    ×
                  </button>
                </article>
              ))}

              {indicators.length === 0 ? (
                <div className="indicator-lab-empty">
                  ما عندك مؤشرات مخصصة إلى الآن. اختر قالبًا أو اكتب معادلتك.
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}
