import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  MarketSymbol,
} from "@marketos/market-core";
import type {
  ChartDrawing,
} from "../lib/drawings";
import {
  drawingDetail,
  drawingName,
} from "../lib/drawings";
import type {
  CustomIndicatorDefinition,
} from "../lib/customIndicators";
import {
  indicatorCatalog,
  type IndicatorId,
  type IndicatorSelection,
} from "../lib/indicators";
import {
  buildObjectTreeSummary,
  objectMatchesQuery,
} from "../lib/objectTree";

type Props = {
  open: boolean;
  symbol: MarketSymbol;
  indicators: IndicatorSelection;
  customIndicators:
    CustomIndicatorDefinition[];
  drawings: ChartDrawing[];
  comparisonSymbol:
    MarketSymbol | null;
  onClose: () => void;
  onToggleIndicator:
    (id: IndicatorId) => void;
  onToggleCustom:
    (id: string) => void;
  onToggleDrawingHidden:
    (id: string) => void;
  onToggleDrawingLocked:
    (id: string) => void;
  onDeleteDrawing:
    (id: string) => void;
  onEditDrawing:
    (drawing: ChartDrawing) => void;
  onRemoveComparison: () => void;
};

export default function ObjectTreePanel({
  open,
  symbol,
  indicators,
  customIndicators,
  drawings,
  comparisonSymbol,
  onClose,
  onToggleIndicator,
  onToggleCustom,
  onToggleDrawingHidden,
  onToggleDrawingLocked,
  onDeleteDrawing,
  onEditDrawing,
  onRemoveComparison,
}: Props) {
  const [query, setQuery] =
    useState("");

  useEffect(() => {
    if (!open) return undefined;

    setQuery("");

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

  const summary = useMemo(
    () =>
      buildObjectTreeSummary(
        indicators,
        customIndicators,
        drawings,
        comparisonSymbol,
      ),
    [
      indicators,
      customIndicators,
      drawings,
      comparisonSymbol,
    ],
  );

  const visibleIndicators =
    indicatorCatalog.filter(
      (item) =>
        objectMatchesQuery(
          query,
          item.name,
          item.description,
          item.pane,
          "indicator مؤشر",
        ),
    );

  const visibleCustom =
    customIndicators.filter(
      (item) =>
        objectMatchesQuery(
          query,
          item.name,
          item.formula,
          item.pane,
          "custom مخصص",
        ),
    );

  const visibleDrawings =
    drawings.filter(
      (drawing) =>
        objectMatchesQuery(
          query,
          drawingName(drawing),
          drawingDetail(drawing),
          drawing.type,
          "drawing رسم",
        ),
    );

  const showComparison =
    comparisonSymbol &&
    objectMatchesQuery(
      query,
      comparisonSymbol.ticker,
      comparisonSymbol.name,
      comparisonSymbol.exchange,
      "comparison مقارنة",
    );

  const hasResults =
    Boolean(showComparison) ||
    visibleIndicators.length > 0 ||
    visibleCustom.length > 0 ||
    visibleDrawings.length > 0;

  if (!open) return null;

  return (
    <div
      className="object-tree-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Object Tree"
    >
      <button
        className="object-tree-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section
        className="object-tree-panel"
        dir="rtl"
      >
        <header className="object-tree-header">
          <div>
            <span className="object-tree-eyebrow">
              MARKETOS OBJECT TREE
            </span>
            <h2>شجرة العناصر</h2>
            <p>
              <b dir="ltr">
                {symbol.ticker}
              </b>
              {" "}· {summary.totalObjects} عنصر نشط/محفوظ
            </p>
          </div>

          <button
            className="object-tree-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="object-tree-summary">
          <span>
            Indicators
            <b>
              {summary.builtInEnabled}
            </b>
          </span>
          <span>
            Custom
            <b>
              {summary.customEnabled}
            </b>
          </span>
          <span>
            Drawings
            <b>
              {summary.drawingCount}
            </b>
          </span>
          <span>
            Hidden
            <b>
              {summary.hiddenDrawings}
            </b>
          </span>
          <span>
            Locked
            <b>
              {summary.lockedDrawings}
            </b>
          </span>
        </div>

        <div className="object-tree-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="ابحث في العناصر…"
            autoComplete="off"
          />
        </div>

        <div className="object-tree-content">
          {showComparison ? (
            <section className="object-tree-section">
              <div className="object-tree-section-head">
                <strong>المقارنة</strong>
                <small>1</small>
              </div>

              <div className="object-tree-row comparison">
                <span className="object-tree-icon">
                  ⇄
                </span>
                <span className="object-tree-main">
                  <strong>
                    {comparisonSymbol.ticker}
                  </strong>
                  <small>
                    {comparisonSymbol.name} · {comparisonSymbol.exchange}
                  </small>
                </span>
                <button
                  className="object-tree-danger"
                  onClick={onRemoveComparison}
                  title="إزالة المقارنة"
                >
                  ×
                </button>
              </div>
            </section>
          ) : null}

          {visibleIndicators.length > 0 ? (
            <section className="object-tree-section">
              <div className="object-tree-section-head">
                <strong>
                  المؤشرات الجاهزة
                </strong>
                <small>
                  {summary.builtInEnabled} مفعّل
                </small>
              </div>

              {visibleIndicators.map(
                (item) => (
                  <button
                    className={
                      indicators[item.id]
                        ? "object-tree-row indicator enabled"
                        : "object-tree-row indicator"
                    }
                    key={item.id}
                    onClick={() =>
                      onToggleIndicator(
                        item.id,
                      )
                    }
                  >
                    <span className="object-tree-icon">
                      {indicators[item.id]
                        ? "●"
                        : "○"}
                    </span>
                    <span className="object-tree-main">
                      <strong>
                        {item.name}
                      </strong>
                      <small>
                        {item.description} · {item.pane}
                      </small>
                    </span>
                    <span className="object-tree-state">
                      {indicators[item.id]
                        ? "ON"
                        : "OFF"}
                    </span>
                  </button>
                ),
              )}
            </section>
          ) : null}

          {visibleCustom.length > 0 ? (
            <section className="object-tree-section">
              <div className="object-tree-section-head">
                <strong>
                  المؤشرات المخصصة
                </strong>
                <small>
                  {summary.customEnabled} مفعّل
                </small>
              </div>

              {visibleCustom.map(
                (indicator) => (
                  <button
                    className={
                      indicator.enabled
                        ? "object-tree-row indicator enabled"
                        : "object-tree-row indicator"
                    }
                    key={indicator.id}
                    onClick={() =>
                      onToggleCustom(
                        indicator.id,
                      )
                    }
                  >
                    <span className="object-tree-icon">
                      {indicator.enabled
                        ? "●"
                        : "○"}
                    </span>
                    <span className="object-tree-main">
                      <strong>
                        {indicator.name}
                      </strong>
                      <small dir="ltr">
                        {indicator.formula}
                      </small>
                    </span>
                    <span className="object-tree-state">
                      {indicator.enabled
                        ? "ON"
                        : "OFF"}
                    </span>
                  </button>
                ),
              )}
            </section>
          ) : null}

          {visibleDrawings.length > 0 ? (
            <section className="object-tree-section">
              <div className="object-tree-section-head">
                <strong>
                  الرسومات
                </strong>
                <small>
                  {summary.drawingCount}
                </small>
              </div>

              {visibleDrawings.map(
                (drawing) => (
                  <div
                    className={[
                      "object-tree-row",
                      "drawing",
                      drawing.hidden
                        ? "hidden"
                        : "",
                      drawing.locked
                        ? "locked"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={drawing.id}
                  >
                    <span className="object-tree-icon">
                      ◇
                    </span>

                    <span className="object-tree-main">
                      <strong>
                        {drawingName(
                          drawing,
                        )}
                      </strong>
                      <small>
                        {drawingDetail(
                          drawing,
                        )}
                      </small>
                    </span>

                    <div className="object-tree-actions">
                      <button
                        onClick={() =>
                          onToggleDrawingHidden(
                            drawing.id,
                          )
                        }
                        title={
                          drawing.hidden
                            ? "إظهار"
                            : "إخفاء"
                        }
                      >
                        {drawing.hidden
                          ? "○"
                          : "◉"}
                      </button>

                      <button
                        onClick={() =>
                          onToggleDrawingLocked(
                            drawing.id,
                          )
                        }
                        title={
                          drawing.locked
                            ? "فتح القفل"
                            : "قفل"
                        }
                      >
                        {drawing.locked
                          ? "🔒"
                          : "🔓"}
                      </button>

                      {drawing.type === "text" ? (
                        <button
                          onClick={() =>
                            onEditDrawing(
                              drawing,
                            )
                          }
                          disabled={
                            drawing.locked
                          }
                          title="تعديل الملاحظة"
                        >
                          ✎
                        </button>
                      ) : null}

                      <button
                        className="object-tree-danger"
                        onClick={() =>
                          onDeleteDrawing(
                            drawing.id,
                          )
                        }
                        disabled={
                          drawing.locked
                        }
                        title={
                          drawing.locked
                            ? "افتح القفل أولًا"
                            : "حذف"
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ),
              )}
            </section>
          ) : null}

          {!hasResults ? (
            <div className="object-tree-empty">
              <span>⌕</span>
              <strong>
                ما فيه عناصر مطابقة
              </strong>
              <small>
                جرّب اسم مؤشر، رسم، أو رمز المقارنة.
              </small>
            </div>
          ) : null}
        </div>

        <footer className="object-tree-footer">
          <span>
            القفل يمنع حذف الرسم بالخطأ.
          </span>
          <span>
            التغييرات تنعكس على الشارت مباشرة.
          </span>
        </footer>
      </section>
    </div>
  );
}
