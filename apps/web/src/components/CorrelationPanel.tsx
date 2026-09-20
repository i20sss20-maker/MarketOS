import { REQUIRE_REAL_DATA } from "../lib/productionMode";
import { useEffect, useMemo, useState } from "react";
import {
  calculateCorrelationMatrix,
  correlationBand,
  correlationDescription,
  type CorrelationMatrixResult,
} from "@marketos/correlation-core";
import type { MarketSymbol, Timeframe } from "@marketos/market-core";
import { createDemoCandles } from "../lib/demoData";
import { getMarketCandles } from "../lib/marketApi";

type Props = {
  open: boolean;
  watchlist: MarketSymbol[];
  activeSymbol: MarketSymbol;
  onSelectSymbol: (symbol: MarketSymbol) => void;
  onClose: () => void;
};

const correlationTimeframes: Timeframe[] = ["1h", "4h", "1d"];

function pairLabel(
  pair: CorrelationMatrixResult["strongestPositive"],
) {
  if (!pair) return "—";
  return `${pair.leftLabel} × ${pair.rightLabel}`;
}

function formatCorrelation(value?: number | null) {
  if (value === undefined || value === null) return "—";
  return value.toFixed(2);
}

export default function CorrelationPanel({
  open,
  watchlist,
  activeSymbol,
  onSelectSymbol,
  onClose,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [result, setResult] = useState<CorrelationMatrixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const [demoFallback, setDemoFallback] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSelectedIds((current) => {
      const valid = current.filter((id) => watchlist.some((symbol) => symbol.id === id));
      if (valid.length >= 2) return valid.slice(0, 6);

      const seed = [
        activeSymbol,
        ...watchlist.filter((symbol) => symbol.id !== activeSymbol.id),
      ]
        .slice(0, 4)
        .map((symbol) => symbol.id);

      return [...new Set(seed)].slice(0, 6);
    });
  }, [open, watchlist, activeSymbol]);

  const selectedSymbols = useMemo(
    () =>
      selectedIds
        .map((id) => watchlist.find((symbol) => symbol.id === id) ?? (activeSymbol.id === id ? activeSymbol : undefined))
        .filter((symbol): symbol is MarketSymbol => Boolean(symbol)),
    [selectedIds, watchlist, activeSymbol],
  );


  const toggleSymbol = (symbol: MarketSymbol) => {
    setSelectedIds((current) => {
      if (current.includes(symbol.id)) {
        if (current.length <= 2) return current;
        return current.filter((id) => id !== symbol.id);
      }
      if (current.length >= 6) return current;
      return [...current, symbol.id];
    });
    setResult(null);
    setFailures([]);
    setDemoFallback(false);
  };

  const analyze = async () => {
    if (loading || selectedSymbols.length < 2) return;

    setLoading(true);
    setFailures([]);
    setDemoFallback(false);
    setResult(null);

    const settled = await Promise.allSettled(
      selectedSymbols.map(async (symbol) => {
        const response = await getMarketCandles(symbol, timeframe, 180);
        return {
          symbol,
          candles: response.candles,
        };
      }),
    );

    const successful = settled.flatMap((entry) =>
      entry.status === "fulfilled" && entry.value.candles.length >= 10
        ? [entry.value]
        : [],
    );

    const failedSymbols = settled.flatMap((entry, index) =>
      entry.status === "rejected" ||
      (entry.status === "fulfilled" && entry.value.candles.length < 10)
        ? [selectedSymbols[index].ticker]
        : [],
    );

    let sourceSeries = successful;

    if (successful.length < 2 && REQUIRE_REAL_DATA) {
      setResult(null); setFailures(failedSymbols); setLoading(false);
      return;
    }
    if (successful.length < 2) {
      sourceSeries = selectedSymbols.map((symbol) => ({
        symbol,
        candles: createDemoCandles(symbol.id, timeframe, 180),
      }));
      setDemoFallback(true);
    }

    const matrix = calculateCorrelationMatrix(
      sourceSeries.map(({ symbol, candles }) => ({
        id: symbol.id,
        label: symbol.ticker,
        candles,
      })),
      8,
    );

    setResult(matrix);
    setFailures(failedSymbols);
    setLoading(false);
  };

  const seriesSymbols = result
    ? result.series.map((series) =>
        selectedSymbols.find((symbol) => symbol.id === series.id),
      )
    : [];

  const cellMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const cell of result?.cells ?? []) {
      map.set(`${cell.rowId}|${cell.columnId}`, cell.correlation);
    }
    return map;
  }, [result]);

  if (!open) return null;

  return (
    <div className="correlation-overlay" role="dialog" aria-modal="true" aria-label="Correlation Matrix">
      <button className="correlation-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="correlation-panel" dir="rtl">
        <header className="correlation-header">
          <div>
            <span className="correlation-eyebrow">MARKETOS CORRELATION</span>
            <h2>مصفوفة الارتباط</h2>
            <p>ارتباط عوائد الأصول تاريخيًا · بحد أقصى 6 رموز</p>
          </div>
          <button className="correlation-close" onClick={onClose}>×</button>
        </header>

        <div className="correlation-toolbar">
          <div className="correlation-timeframes">
            {correlationTimeframes.map((item) => (
              <button
                key={item}
                className={timeframe === item ? "selected" : ""}
                onClick={() => {
                  setTimeframe(item);
                  setResult(null);
                  setFailures([]);
                }}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            className="correlation-run"
            onClick={() => void analyze()}
            disabled={loading || selectedSymbols.length < 2}
          >
            {loading ? "تحليل…" : "حساب الارتباط"}
          </button>
        </div>

        <div className="correlation-symbols">
          {watchlist.slice(0, 20).map((symbol) => {
            const selected = selectedIds.includes(symbol.id);
            return (
              <button
                className={selected ? "selected" : ""}
                key={symbol.id}
                onClick={() => toggleSymbol(symbol)}
                disabled={!selected && selectedIds.length >= 6}
              >
                <span>{symbol.ticker}</span>
                <small>{symbol.assetClass}</small>
                <b>{selected ? "✓" : "+"}</b>
              </button>
            );
          })}
        </div>

        {failures.length > 0 ? (
          <div className="correlation-warning">
            تعذر تحميل: {failures.join("، ")}
            {demoFallback ? " · تم تشغيل بيانات Demo للمصفوفة كاملة لأن البيانات المتاحة غير كافية." : ""}
          </div>
        ) : null}

        <div className="correlation-content">
          {!result && !loading ? (
            <div className="correlation-empty">
              اختر من 2 إلى 6 رموز ثم اضغط «حساب الارتباط».
            </div>
          ) : null}

          {result ? (
            <>
              <div className="correlation-summary">
                <div>
                  <span>متوسط |Correlation|</span>
                  <strong>{formatCorrelation(result.averageAbsoluteCorrelation)}</strong>
                </div>
                <div>
                  <span>أقوى موجب</span>
                  <strong>{pairLabel(result.strongestPositive)}</strong>
                  <small>{formatCorrelation(result.strongestPositive?.correlation)}</small>
                </div>
                <div>
                  <span>أقوى سالب</span>
                  <strong>{pairLabel(result.strongestNegative)}</strong>
                  <small>{formatCorrelation(result.strongestNegative?.correlation)}</small>
                </div>
                <div>
                  <span>الأزواج المحسوبة</span>
                  <strong>{result.pairs.length}</strong>
                </div>
              </div>

              <div className="correlation-matrix-wrap">
                <table className="correlation-matrix">
                  <thead>
                    <tr>
                      <th />
                      {result.series.map((series) => (
                        <th key={series.id} dir="ltr">{series.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.series.map((row, rowIndex) => (
                      <tr key={row.id}>
                        <th>
                          <button
                            onClick={() => {
                              const symbol = seriesSymbols[rowIndex];
                              if (symbol) {
                                onSelectSymbol(symbol);
                                onClose();
                              }
                            }}
                          >
                            {row.label}
                          </button>
                        </th>
                        {result.series.map((column) => {
                          const value = cellMap.get(`${row.id}|${column.id}`) ?? null;
                          return (
                            <td
                              key={column.id}
                              className={`correlation-cell ${correlationBand(value)}`}
                              title={`${row.label} × ${column.label}: ${correlationDescription(value)}`}
                            >
                              {formatCorrelation(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="correlation-pairs">
                {result.pairs
                  .slice()
                  .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
                  .slice(0, 8)
                  .map((pair) => (
                    <div key={`${pair.leftId}|${pair.rightId}`}>
                      <span>{pair.leftLabel} × {pair.rightLabel}</span>
                      <strong className={pair.correlation >= 0 ? "positive" : "negative"}>
                        {pair.correlation.toFixed(2)}
                      </strong>
                      <small>{correlationDescription(pair.correlation)} · {pair.observations} obs</small>
                    </div>
                  ))}
              </div>

              <div className="correlation-note">
                الارتباط علاقة إحصائية تاريخية ولا يعني السببية أو توصية استثمارية.
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
