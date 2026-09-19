import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Candle,
  Timeframe,
} from "@marketos/market-core";
import {
  clampReplayIndex,
  defaultReplayStartIndex,
  replayPresetIndex,
} from "../lib/replay";

type Props = {
  open: boolean;
  ticker: string;
  timeframe: Timeframe;
  candles: Candle[];
  onClose: () => void;
  onStart: (index: number) => void;
};

function formatDate(
  candle: Candle | undefined,
) {
  if (!candle) return "—";

  return new Date(
    candle.time * 1000,
  ).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPrice(
  value: number | undefined,
) {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits:
        Math.abs(value) < 10
          ? 3
          : 2,
      maximumFractionDigits:
        Math.abs(value) < 10
          ? 5
          : 2,
    },
  ).format(value);
}

export default function ReplaySetupPanel({
  open,
  ticker,
  timeframe,
  candles,
  onClose,
  onStart,
}: Props) {
  const [index, setIndex] =
    useState(20);

  useEffect(() => {
    if (!open) return;

    setIndex(
      defaultReplayStartIndex(
        candles.length,
      ),
    );
  }, [open, candles.length]);

  useEffect(() => {
    if (!open) return undefined;

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

  const safeIndex = useMemo(
    () =>
      clampReplayIndex(
        candles.length,
        index,
      ),
    [candles.length, index],
  );

  if (!open) return null;

  const candle =
    candles[safeIndex];
  const remaining =
    Math.max(
      0,
      candles.length -
        1 -
        safeIndex,
    );

  return (
    <div
      className="replay-setup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Replay Setup"
    >
      <button
        className="replay-setup-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section
        className="replay-setup-panel"
        dir="rtl"
      >
        <header className="replay-setup-header">
          <div>
            <span className="replay-setup-eyebrow">
              MARKETOS REPLAY
            </span>
            <h2>اختيار بداية Replay</h2>
            <p dir="ltr">
              {ticker} · {timeframe.toUpperCase()}
            </p>
          </div>

          <button
            className="replay-setup-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="replay-setup-preview">
          <div>
            <span>البداية</span>
            <strong>
              {formatDate(candle)}
            </strong>
          </div>
          <div>
            <span>الإغلاق</span>
            <strong dir="ltr">
              {formatPrice(
                candle?.close,
              )}
            </strong>
          </div>
          <div>
            <span>المتبقي</span>
            <strong>
              {remaining} شمعة
            </strong>
          </div>
        </div>

        <div className="replay-setup-slider">
          <input
            type="range"
            min={20}
            max={Math.max(
              20,
              candles.length - 2,
            )}
            value={Math.min(
              safeIndex,
              Math.max(
                20,
                candles.length - 2,
              ),
            )}
            onChange={(event) =>
              setIndex(
                Number(
                  event.target.value,
                ),
              )
            }
          />

          <div className="replay-setup-scale">
            <span>
              {formatDate(candles[20])}
            </span>
            <span>
              {formatDate(
                candles[
                  candles.length - 1
                ],
              )}
            </span>
          </div>
        </div>

        <div className="replay-setup-presets">
          {([
            ["25%", "25%"],
            ["50%", "50%"],
            ["75%", "75%"],
            ["آخر 60", "last-60"],
          ] as const).map(
            ([label, preset]) => (
              <button
                key={preset}
                onClick={() =>
                  setIndex(
                    replayPresetIndex(
                      candles.length,
                      preset,
                    ),
                  )
                }
              >
                {label}
              </button>
            ),
          )}
        </div>

        <div className="replay-setup-note">
          Replay يستخدم نفس بيانات الشارت المحمّلة. لا يتم طلب بيانات إضافية ولا يتم تقييم التنبيهات الحية أثناء الجلسة.
        </div>

        <footer className="replay-setup-footer">
          <button
            onClick={onClose}
          >
            إلغاء
          </button>
          <button
            className="primary"
            onClick={() =>
              onStart(
                Math.min(
                  safeIndex,
                  Math.max(
                    20,
                    candles.length - 2,
                  ),
                ),
              )
            }
            disabled={
              candles.length < 25
            }
          >
            بدء Replay
          </button>
        </footer>
      </section>
    </div>
  );
}
