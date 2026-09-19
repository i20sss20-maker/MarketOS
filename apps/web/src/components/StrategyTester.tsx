import { useMemo, useState } from "react";
import type { Candle, MarketSymbol, Timeframe } from "@marketos/market-core";
import {
  defaultBacktestConfig,
  runBacktest,
  strategyCatalog,
  type BacktestConfig,
  type BacktestResult,
  type StrategyKind,
} from "@marketos/strategy-core";

type Props = {
  open: boolean;
  candles: Candle[];
  symbol: MarketSymbol;
  timeframe: Timeframe;
  onClose: () => void;
};

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function dateTime(unixTime: number) {
  return new Date(unixTime * 1000).toLocaleString("ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function EquitySparkline({ result }: { result: BacktestResult }) {
  const points = useMemo(() => {
    const values = result.equityCurve.map((point) => point.value);
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-9, max - min);

    return values.map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 38 - ((value - min) / span) * 34;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [result]);

  if (!points) return null;

  return (
    <svg className="backtest-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Equity curve">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StrategyTester({
  open,
  candles,
  symbol,
  timeframe,
  onClose,
}: Props) {
  const [config, setConfig] = useState<BacktestConfig>(defaultBacktestConfig);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const updateNumber = (key: keyof BacktestConfig, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setConfig((current) => ({ ...current, [key]: parsed }));
  };

  const chooseStrategy = (strategy: StrategyKind) => {
    setConfig((current) => ({ ...current, strategy }));
    setResult(null);
    setError(null);
  };

  const execute = () => {
    try {
      const next = runBacktest(candles, config);
      setResult(next);
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Backtest failed.");
    }
  };

  const profitFactor =
    result?.metrics.profitFactor === null
      ? result.metrics.grossProfit > 0 ? "∞" : "—"
      : result ? result.metrics.profitFactor.toFixed(2) : "—";

  return (
    <div className="backtest-overlay" role="dialog" aria-modal="true" aria-label="Strategy Tester">
      <button className="backtest-backdrop" aria-label="إغلاق" onClick={onClose} />
      <section className="backtest-panel" dir="rtl">
        <header className="backtest-header">
          <div>
            <span className="backtest-eyebrow">MARKETOS STRATEGY TESTER</span>
            <h2>اختبار الاستراتيجية</h2>
            <p>
              {symbol.ticker} · {timeframe.toUpperCase()} · {candles.length} شمعة · محاكاة تاريخية فقط
            </p>
          </div>
          <button className="backtest-close" onClick={onClose}>×</button>
        </header>

        <div className="backtest-body">
          <aside className="backtest-settings">
            <div className="backtest-section-title">الاستراتيجية</div>
            <div className="strategy-cards">
              {strategyCatalog.map((item) => (
                <button
                  key={item.id}
                  className={config.strategy === item.id ? "strategy-card selected" : "strategy-card"}
                  onClick={() => chooseStrategy(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>

            <div className="backtest-section-title">الإعدادات</div>
            <div className="backtest-fields">
              {config.strategy === "sma-cross" ? (
                <>
                  <label>
                    <span>SMA سريع</span>
                    <input
                      type="number"
                      min="2"
                      value={config.fastPeriod}
                      onChange={(event) => updateNumber("fastPeriod", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>SMA بطيء</span>
                    <input
                      type="number"
                      min="3"
                      value={config.slowPeriod}
                      onChange={(event) => updateNumber("slowPeriod", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {config.strategy === "rsi-reversion" ? (
                <>
                  <label>
                    <span>RSI Period</span>
                    <input
                      type="number"
                      min="2"
                      value={config.rsiPeriod}
                      onChange={(event) => updateNumber("rsiPeriod", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>دخول تحت</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={config.rsiEntry}
                      onChange={(event) => updateNumber("rsiEntry", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>خروج فوق</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={config.rsiExit}
                      onChange={(event) => updateNumber("rsiExit", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {config.strategy === "breakout" ? (
                <>
                  <label>
                    <span>نطاق الاختراق</span>
                    <input
                      type="number"
                      min="2"
                      value={config.breakoutPeriod}
                      onChange={(event) => updateNumber("breakoutPeriod", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>نطاق الخروج</span>
                    <input
                      type="number"
                      min="2"
                      value={config.breakoutExitPeriod}
                      onChange={(event) => updateNumber("breakoutExitPeriod", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              <label>
                <span>رأس المال</span>
                <input
                  type="number"
                  min="100"
                  value={config.startingCapital}
                  onChange={(event) => updateNumber("startingCapital", event.target.value)}
                />
              </label>
              <label>
                <span>Commission (bps)</span>
                <input
                  type="number"
                  min="0"
                  value={config.commissionBps}
                  onChange={(event) => updateNumber("commissionBps", event.target.value)}
                />
              </label>
              <label>
                <span>Slippage (bps)</span>
                <input
                  type="number"
                  min="0"
                  value={config.slippageBps}
                  onChange={(event) => updateNumber("slippageBps", event.target.value)}
                />
              </label>
            </div>

            <button className="backtest-run" onClick={execute} disabled={candles.length < 25}>
              تشغيل الاختبار
            </button>
            <div className="backtest-disclaimer">
              النتائج التاريخية لا تضمن نتائج مستقبلية، ولا تمثل توصية أو تنفيذ صفقة.
            </div>
          </aside>

          <main className="backtest-results">
            {error ? <div className="backtest-error">{error}</div> : null}

            {!result && !error ? (
              <div className="backtest-empty">
                اختر الاستراتيجية واضغط «تشغيل الاختبار» لعرض النتائج.
              </div>
            ) : null}

            {result ? (
              <>
                <div className="backtest-metrics">
                  <div>
                    <span>Net Return</span>
                    <strong className={result.metrics.totalReturnPercent >= 0 ? "positive" : "negative"}>
                      {formatPercent(result.metrics.totalReturnPercent)}
                    </strong>
                  </div>
                  <div>
                    <span>Buy & Hold</span>
                    <strong className={result.metrics.buyHoldReturnPercent >= 0 ? "positive" : "negative"}>
                      {formatPercent(result.metrics.buyHoldReturnPercent)}
                    </strong>
                  </div>
                  <div>
                    <span>Win Rate</span>
                    <strong>{result.metrics.winRatePercent.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Max Drawdown</span>
                    <strong className="negative">-{result.metrics.maxDrawdownPercent.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>Profit Factor</span>
                    <strong>{profitFactor}</strong>
                  </div>
                  <div>
                    <span>Trades</span>
                    <strong>{result.metrics.totalTrades}</strong>
                  </div>
                  <div>
                    <span>Exposure</span>
                    <strong>{result.metrics.exposurePercent.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Ending Capital</span>
                    <strong dir="ltr">{formatMoney(result.metrics.endingCapital)}</strong>
                  </div>
                </div>

                <div className="backtest-equity-card">
                  <div>
                    <span>Equity Curve</span>
                    <strong>{result.strategyName}</strong>
                  </div>
                  <EquitySparkline result={result} />
                  <div className="backtest-equity-footer">
                    <span>{formatMoney(result.metrics.startingCapital)}</span>
                    <span>{formatMoney(result.metrics.endingCapital)}</span>
                  </div>
                </div>

                <div className="backtest-trade-summary">
                  <span>رابحة <b className="positive">{result.metrics.winningTrades}</b></span>
                  <span>خاسرة <b className="negative">{result.metrics.losingTrades}</b></span>
                  <span>متوسط الصفقة <b>{formatPercent(result.metrics.averageTradePercent)}</b></span>
                  <span>Gross Profit <b>{formatMoney(result.metrics.grossProfit)}</b></span>
                  <span>Gross Loss <b>{formatMoney(result.metrics.grossLoss)}</b></span>
                </div>

                <div className="backtest-table-wrap">
                  <table className="backtest-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>الدخول</th>
                        <th>الخروج</th>
                        <th>سعر الدخول</th>
                        <th>سعر الخروج</th>
                        <th>Bars</th>
                        <th>Return</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice().reverse().slice(0, 50).map((trade, index) => (
                        <tr key={`${trade.entryTime}-${trade.exitTime}`}>
                          <td>{result.trades.length - index}</td>
                          <td>{dateTime(trade.entryTime)}</td>
                          <td>{dateTime(trade.exitTime)}</td>
                          <td dir="ltr">{formatNumber(trade.entryPrice, 4)}</td>
                          <td dir="ltr">{formatNumber(trade.exitPrice, 4)}</td>
                          <td>{trade.barsHeld}</td>
                          <td className={trade.returnPercent >= 0 ? "positive" : "negative"} dir="ltr">
                            {formatPercent(trade.returnPercent)}
                          </td>
                          <td className={trade.pnl >= 0 ? "positive" : "negative"} dir="ltr">
                            {formatMoney(trade.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.trades.length === 0 ? (
                    <div className="backtest-no-trades">
                      الاستراتيجية لم تنتج صفقات ضمن البيانات الحالية.
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}
