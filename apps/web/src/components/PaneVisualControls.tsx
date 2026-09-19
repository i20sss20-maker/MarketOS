import {
  useEffect,
  useState,
} from "react";
import {
  indicatorCatalog,
  type IndicatorId,
} from "../lib/indicators";
import type {
  PaneVisualState,
} from "../lib/paneVisualState";

type Props = {
  paneLabel: string;
  state: PaneVisualState;
  onChange: (
    next: PaneVisualState,
  ) => void;
  onCopyPrimary?: () => void;
};

export default function PaneVisualControls({
  paneLabel,
  state,
  onChange,
  onCopyPrimary,
}: Props) {
  const [open, setOpen] =
    useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const close = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      close,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        close,
      );
  }, [open]);

  const toggleIndicator = (
    id: IndicatorId,
  ) => {
    onChange({
      ...state,
      indicators: {
        ...state.indicators,
        [id]:
          !state.indicators[id],
      },
    });
  };

  return (
    <div className="pane-visual-wrap">
      <select
        className="pane-view-select"
        value={state.chartView}
        onChange={(event) =>
          onChange({
            ...state,
            chartView:
              event.target
                .value as PaneVisualState["chartView"],
          })
        }
        aria-label={`نوع شارت ${paneLabel}`}
      >
        <option value="candles">
          Candles
        </option>
        <option value="line">
          Line
        </option>
        <option value="area">
          Area
        </option>
      </select>

      <button
        className={
          open
            ? "pane-visual-button active"
            : "pane-visual-button"
        }
        onClick={() =>
          setOpen(
            (value) => !value,
          )
        }
        title={`إعدادات ${paneLabel}`}
      >
        ⚙
      </button>

      {open ? (
        <div
          className="pane-visual-popover"
          dir="rtl"
        >
          <div className="pane-visual-title">
            <div>
              <strong>
                {paneLabel}
              </strong>
              <small>
                إعداد مستقل لهذا Pane
              </small>
            </div>

            {onCopyPrimary ? (
              <button
                onClick={onCopyPrimary}
              >
                نسخ Pane 1
              </button>
            ) : null}
          </div>

          <div className="pane-visual-section">
            <span>المؤشرات</span>
            <div className="pane-indicator-grid">
              {indicatorCatalog.map(
                (indicator) => (
                  <button
                    key={indicator.id}
                    className={
                      state.indicators[
                        indicator.id
                      ]
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      toggleIndicator(
                        indicator.id,
                      )
                    }
                  >
                    {indicator.name}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="pane-visual-section">
            <span>العرض</span>

            <div className="pane-setting-grid">
              <label>
                <input
                  type="checkbox"
                  checked={
                    state.chartSettings
                      .showGrid
                  }
                  onChange={(event) =>
                    onChange({
                      ...state,
                      chartSettings: {
                        ...state.chartSettings,
                        showGrid:
                          event.target
                            .checked,
                      },
                    })
                  }
                />
                Grid
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    state.chartSettings
                      .showVolume
                  }
                  onChange={(event) =>
                    onChange({
                      ...state,
                      chartSettings: {
                        ...state.chartSettings,
                        showVolume:
                          event.target
                            .checked,
                      },
                    })
                  }
                />
                Volume
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    state.chartSettings
                      .showPriceScale
                  }
                  onChange={(event) =>
                    onChange({
                      ...state,
                      chartSettings: {
                        ...state.chartSettings,
                        showPriceScale:
                          event.target
                            .checked,
                      },
                    })
                  }
                />
                Price scale
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    state.chartSettings
                      .invertScale
                  }
                  onChange={(event) =>
                    onChange({
                      ...state,
                      chartSettings: {
                        ...state.chartSettings,
                        invertScale:
                          event.target
                            .checked,
                      },
                    })
                  }
                />
                Invert
              </label>
            </div>
          </div>

          <div className="pane-visual-section pane-visual-selects">
            <label>
              <span>Scale</span>
              <select
                value={
                  state.chartSettings
                    .priceScaleMode
                }
                onChange={(event) =>
                  onChange({
                    ...state,
                    chartSettings: {
                      ...state.chartSettings,
                      priceScaleMode:
                        event.target
                          .value as PaneVisualState["chartSettings"]["priceScaleMode"],
                    },
                  })
                }
              >
                <option value="normal">
                  Normal
                </option>
                <option value="logarithmic">
                  Log
                </option>
                <option value="percentage">
                  %
                </option>
                <option value="indexed">
                  Indexed
                </option>
              </select>
            </label>

            <label>
              <span>Crosshair</span>
              <select
                value={
                  state.chartSettings
                    .crosshairMode
                }
                onChange={(event) =>
                  onChange({
                    ...state,
                    chartSettings: {
                      ...state.chartSettings,
                      crosshairMode:
                        event.target
                          .value as PaneVisualState["chartSettings"]["crosshairMode"],
                    },
                  })
                }
              >
                <option value="magnet">
                  Magnet
                </option>
                <option value="normal">
                  Normal
                </option>
                <option value="hidden">
                  Hidden
                </option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
