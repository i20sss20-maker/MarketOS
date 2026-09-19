import type {
  ChartSettings,
  CrosshairSetting,
  PriceScaleSetting,
} from "../lib/chartSettings";

type Props = {
  open: boolean;
  settings: ChartSettings;
  onChange: (settings: ChartSettings) => void;
  onResetSettings: () => void;
  onResetView: () => void;
  onClose: () => void;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="chart-setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

export default function ChartSettingsPanel({
  open,
  settings,
  onChange,
  onResetSettings,
  onResetView,
  onClose,
}: Props) {
  if (!open) return null;

  const patch = (next: Partial<ChartSettings>) => {
    onChange({ ...settings, ...next });
  };

  return (
    <div
      className="chart-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Chart Settings"
    >
      <button
        className="chart-settings-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section className="chart-settings-panel" dir="rtl">
        <header className="chart-settings-header">
          <div>
            <span className="chart-settings-eyebrow">
              MARKETOS CHART
            </span>
            <h2>إعدادات الشارت</h2>
            <p>
              إعدادات العرض تُحفظ على هذا الجهاز بدون أي
              استهلاك لبيانات السوق.
            </p>
          </div>
          <button
            className="chart-settings-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="chart-settings-content">
          <div className="chart-settings-group">
            <div className="chart-settings-group-title">
              مقياس السعر
            </div>

            <div className="chart-setting-segmented">
              {([
                ["normal", "Normal"],
                ["logarithmic", "Log"],
                ["percentage", "%"],
                ["indexed", "Indexed 100"],
              ] as Array<[PriceScaleSetting, string]>).map(
                ([value, label]) => (
                  <button
                    key={value}
                    className={
                      settings.priceScaleMode === value
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      patch({ priceScaleMode: value })
                    }
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="chart-settings-group">
            <div className="chart-settings-group-title">
              Crosshair
            </div>

            <div className="chart-setting-segmented">
              {([
                ["magnet", "Magnet"],
                ["normal", "Free"],
                ["hidden", "Hidden"],
              ] as Array<[CrosshairSetting, string]>).map(
                ([value, label]) => (
                  <button
                    key={value}
                    className={
                      settings.crosshairMode === value
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      patch({ crosshairMode: value })
                    }
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="chart-settings-group chart-settings-toggles">
            <ToggleRow
              label="Grid"
              description="إظهار خطوط الشبكة الأفقية والعمودية."
              checked={settings.showGrid}
              onChange={(showGrid) => patch({ showGrid })}
            />

            <ToggleRow
              label="Volume"
              description="إظهار Pane حجم التداول."
              checked={settings.showVolume}
              onChange={(showVolume) =>
                patch({ showVolume })
              }
            />

            <ToggleRow
              label="Price Scale"
              description="إظهار محور السعر على يمين الشارت."
              checked={settings.showPriceScale}
              onChange={(showPriceScale) =>
                patch({ showPriceScale })
              }
            />

            <ToggleRow
              label="Invert Scale"
              description="عكس اتجاه مقياس السعر رأسيًا."
              checked={settings.invertScale}
              onChange={(invertScale) =>
                patch({ invertScale })
              }
            />
          </div>

          <div className="chart-settings-group chart-settings-sliders">
            <label>
              <span>
                <strong>كثافة الشموع</strong>
                <b>{settings.barSpacing.toFixed(0)}px</b>
              </span>
              <input
                type="range"
                min="3"
                max="20"
                step="1"
                value={settings.barSpacing}
                onChange={(event) =>
                  patch({
                    barSpacing: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              <span>
                <strong>مساحة يمين الشارت</strong>
                <b>{settings.rightOffset.toFixed(0)} bars</b>
              </span>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={settings.rightOffset}
                onChange={(event) =>
                  patch({
                    rightOffset: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="chart-settings-actions">
            <button
              className="chart-settings-reset-view"
              onClick={onResetView}
            >
              Fit / Reset View
            </button>
            <button
              className="chart-settings-reset-all"
              onClick={onResetSettings}
            >
              استعادة الافتراضي
            </button>
          </div>

          <div className="chart-settings-note">
            Logarithmic وPercentage وIndexed هي أوضاع عرض
            للمقياس فقط ولا تغيّر بيانات السوق الأصلية.
          </div>
        </div>
      </section>
    </div>
  );
}
