import {
  useEffect,
  useState,
} from "react";
import type {
  PaneLinkSettings,
} from "../lib/paneLinks";

type Props = {
  disabled: boolean;
  rangeCompatible: boolean;
  settings: PaneLinkSettings;
  onChange: (
    next: PaneLinkSettings,
  ) => void;
};

export default function PaneLinkControls({
  disabled,
  rangeCompatible,
  settings,
  onChange,
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

  const activeCount =
    Number(settings.symbol) +
    Number(settings.timeframe) +
    Number(
      settings.range &&
      rangeCompatible,
    );

  return (
    <div className="pane-link-wrap">
      <button
        className={
          activeCount > 0 && !disabled
            ? "pane-link-button active"
            : "pane-link-button"
        }
        onClick={() =>
          setOpen(
            (value) => !value,
          )
        }
        disabled={disabled}
        title="ربط Panes"
      >
        Link
        {activeCount > 0 && !disabled ? (
          <b>{activeCount}</b>
        ) : null}
      </button>

      {open && !disabled ? (
        <div
          className="pane-link-popover"
          dir="rtl"
        >
          <div className="pane-link-head">
            <div>
              <strong>
                ربط الـPanes
              </strong>
              <small>
                تحكم مستقل في نوع المزامنة
              </small>
            </div>
          </div>

          <button
            className={
              settings.symbol
                ? "pane-link-row active"
                : "pane-link-row"
            }
            onClick={() =>
              onChange({
                ...settings,
                symbol:
                  !settings.symbol,
              })
            }
          >
            <span>
              <strong>Symbol</strong>
              <small>
                تغيير أي Pane يغير الرمز في الجميع
              </small>
            </span>
            <b>
              {settings.symbol
                ? "ON"
                : "OFF"}
            </b>
          </button>

          <button
            className={
              settings.timeframe
                ? "pane-link-row active"
                : "pane-link-row"
            }
            onClick={() =>
              onChange({
                ...settings,
                timeframe:
                  !settings.timeframe,
              })
            }
          >
            <span>
              <strong>Timeframe</strong>
              <small>
                تغيير الفريم يطبق على كل الـPanes
              </small>
            </span>
            <b>
              {settings.timeframe
                ? "ON"
                : "OFF"}
            </b>
          </button>

          <button
            className={
              settings.range &&
              rangeCompatible
                ? "pane-link-row active"
                : "pane-link-row"
            }
            onClick={() => {
              if (!rangeCompatible) {
                return;
              }

              onChange({
                ...settings,
                range:
                  !settings.range,
              });
            }}
            disabled={!rangeCompatible}
          >
            <span>
              <strong>Range</strong>
              <small>
                Zoom / Scroll بين الـPanes
              </small>
            </span>
            <b>
              {!rangeCompatible
                ? "FRAME"
                : settings.range
                  ? "ON"
                  : "OFF"}
            </b>
          </button>

          {!rangeCompatible ? (
            <div className="pane-link-note">
              Range يحتاج نفس الفريم في الـPanes الظاهرة. فعّل Timeframe Link أو وحّد الفريمات يدويًا.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
