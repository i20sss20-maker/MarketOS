import {
  useEffect,
  useState,
} from "react";
import {
  chartTemplatePresets,
  type ChartTemplateDefinition,
  type SavedChartTemplate,
} from "../lib/chartTemplates";

type Props = {
  open: boolean;
  templates: SavedChartTemplate[];
  limit: number;
  currentChartView: string;
  currentIndicatorCount: number;
  currentCustomCount: number;
  message: string | null;
  onClose: () => void;
  onSaveCurrent: (name: string) => void;
  onApply: (
    template: ChartTemplateDefinition,
  ) => void;
  onDelete: (id: string) => void;
};

export default function ChartTemplatesPanel({
  open,
  templates,
  limit,
  currentChartView,
  currentIndicatorCount,
  currentCustomCount,
  message,
  onClose,
  onSaveCurrent,
  onApply,
  onDelete,
}: Props) {
  const [name, setName] =
    useState("");

  useEffect(() => {
    if (!open) return undefined;

    setName("");

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="chart-templates-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Chart Templates"
    >
      <button
        className="chart-templates-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section
        className="chart-templates-panel"
        dir="rtl"
      >
        <header className="chart-templates-header">
          <div>
            <span className="chart-templates-eyebrow">
              MARKETOS TEMPLATES
            </span>
            <h2>قوالب الشارت</h2>
            <p>
              طبّق المؤشرات والإعدادات على أي رمز بدون تغيير الرمز أو الفريم.
            </p>
          </div>
          <button
            className="chart-templates-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="chart-template-save">
          <div>
            <span>حفظ الإعداد الحالي</span>
            <small>
              {currentChartView} · {currentIndicatorCount} مؤشر جاهز · {currentCustomCount} مخصص
            </small>
          </div>

          <div className="chart-template-save-row">
            <input
              value={name}
              maxLength={60}
              onChange={(event) =>
                setName(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                    "Enter" &&
                  name.trim()
                ) {
                  onSaveCurrent(name);
                  setName("");
                }
              }}
              placeholder="اسم القالب…"
            />
            <button
              onClick={() => {
                onSaveCurrent(name);
                setName("");
              }}
              disabled={
                !name.trim() ||
                templates.length >= limit
              }
            >
              حفظ
            </button>
          </div>

          <small className="chart-template-limit">
            {templates.length} / {limit} قوالب مخصصة
          </small>
        </div>

        {message ? (
          <div className="chart-template-message">
            {message}
          </div>
        ) : null}

        <div className="chart-template-content">
          <section>
            <div className="chart-template-section-title">
              <strong>Presets جاهزة</strong>
              <small>لا تستهلك من حد الخطة</small>
            </div>

            <div className="chart-template-grid">
              {chartTemplatePresets.map(
                (template) => (
                  <button
                    className="chart-template-card preset"
                    key={template.name}
                    onClick={() =>
                      onApply(template)
                    }
                  >
                    <strong>
                      {template.name}
                    </strong>
                    <small>
                      {Object.values(
                        template.indicators,
                      ).filter(Boolean).length} مؤشر
                    </small>
                    <span>تطبيق ←</span>
                  </button>
                ),
              )}
            </div>
          </section>

          <section>
            <div className="chart-template-section-title">
              <strong>قوالبك</strong>
              <small>تتزامن مع Cloud Sync</small>
            </div>

            <div className="chart-template-grid">
              {templates.map(
                (template) => (
                  <article
                    className="chart-template-card saved"
                    key={template.id}
                  >
                    <button
                      className="chart-template-apply"
                      onClick={() =>
                        onApply(template)
                      }
                    >
                      <strong>
                        {template.name}
                      </strong>
                      <small>
                        {template.chartView} ·{" "}
                        {Object.values(
                          template.indicators,
                        ).filter(Boolean).length} جاهز ·{" "}
                        {template.customIndicators.length} مخصص
                      </small>
                      <span>تطبيق ←</span>
                    </button>

                    <button
                      className="chart-template-delete"
                      onClick={() =>
                        onDelete(template.id)
                      }
                      title="حذف القالب"
                    >
                      ×
                    </button>
                  </article>
                ),
              )}

              {templates.length === 0 ? (
                <div className="chart-template-empty">
                  احفظ إعدادك الحالي كقالب وطبقه لاحقًا على أي شارت.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="chart-template-footer">
          القالب لا يغير الرمز أو الفريم أو الرسومات. المؤشرات المخصصة يتم دمجها مع مكتبتك بدون حذف الموجود.
        </footer>
      </section>
    </div>
  );
}
