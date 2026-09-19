import { useEffect, useMemo, useState } from "react";
import type { MarketSymbol } from "@marketos/market-core";
import {
  executePaperOrder,
  getPaperSnapshot,
  resetPaperAccount,
  setPaperCommission,
  updatePaperLastPrices,
  type PaperAccountState,
  type PaperPriceMap,
} from "@marketos/paper-core";
import { getMarketOverview } from "../lib/marketApi";

type Props = {
  open: boolean;
  account: PaperAccountState;
  activeSymbol: MarketSymbol;
  activePrice?: number;
  replayActive: boolean;
  onAccountChange: (account: PaperAccountState) => void;
  onClose: () => void;
};

type PaperTab = "positions" | "orders";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function number(value: number, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function dateTime(value: number) {
  return new Date(value).toLocaleString("ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function PaperTradingPanel({
  open,
  account,
  activeSymbol,
  activePrice,
  replayActive,
  onAccountChange,
  onClose,
}: Props) {
  const [quantity, setQuantity] = useState("1");
  const [selectedCurrency, setSelectedCurrency] = useState(
    (activeSymbol.currency || "USD").toUpperCase(),
  );
  const [prices, setPrices] = useState<PaperPriceMap>({});
  const [refreshing, setRefreshing] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [tab, setTab] = useState<PaperTab>("positions");
  const [resetArmed, setResetArmed] = useState(false);
  const [commissionDraft, setCommissionDraft] = useState(
    String(account.commissionBps),
  );

  useEffect(() => {
    setSelectedCurrency((activeSymbol.currency || "USD").toUpperCase());
  }, [activeSymbol.currency]);

  useEffect(() => {
    setCommissionDraft(String(account.commissionBps));
  }, [account.commissionBps]);

  useEffect(() => {
    if (
      activePrice !== undefined &&
      Number.isFinite(activePrice) &&
      activePrice > 0
    ) {
      setPrices((current) => ({
        ...current,
        [activeSymbol.id]: activePrice,
      }));
    }
  }, [activeSymbol.id, activePrice]);

  const currencies = useMemo(() => {
    const values = new Set(Object.keys(account.wallets));
    values.add((activeSymbol.currency || "USD").toUpperCase());
    return [...values].sort();
  }, [account.wallets, activeSymbol.currency]);

  const snapshot = useMemo(
    () => getPaperSnapshot(account, selectedCurrency, prices),
    [account, selectedCurrency, prices],
  );

  const activePosition = account.positions.find(
    (position) => position.symbol.id === activeSymbol.id,
  );

  const currentPrice =
    activePrice ??
    prices[activeSymbol.id] ??
    activePosition?.lastPrice;

  const parsedQuantity = Number(quantity);
  const estimatedNotional =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    currentPrice !== undefined
      ? parsedQuantity * currentPrice
      : 0;

  const relevantOrders = account.orders.filter(
    (order) => order.currency === selectedCurrency,
  );

  const refreshPrices = async () => {
    const unique = new Map<string, MarketSymbol>();
    for (const position of account.positions) {
      unique.set(position.symbol.id, position.symbol);
    }
    unique.set(activeSymbol.id, activeSymbol);

    const symbols = [...unique.values()].slice(0, 25);
    if (symbols.length === 0) return;

    setRefreshing(true);
    try {
      const response = await getMarketOverview(symbols);
      const nextPrices: PaperPriceMap = {};
      for (const item of response.items) {
        nextPrices[item.symbol.id] = item.quote.price;
      }

      if (
        activePrice !== undefined &&
        Number.isFinite(activePrice) &&
        activePrice > 0
      ) {
        nextPrices[activeSymbol.id] = activePrice;
      }

      setPrices((current) => ({ ...current, ...nextPrices }));
      onAccountChange(updatePaperLastPrices(account, nextPrices));
      setOrderError(null);
    } catch {
      setOrderError(
        "تعذر تحديث أسعار Paper Trading الآن؛ آخر أسعار محفوظة ما زالت مستخدمة.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshPrices();
    // Intentionally refresh only when the panel opens or the active symbol changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeSymbol.id]);

  if (!open) return null;

  const execute = (side: "buy" | "sell") => {
    setOrderMessage(null);
    setOrderError(null);

    if (replayActive) {
      setOrderError("اخرج من Replay قبل تنفيذ صفقة تجريبية.");
      return;
    }

    const qty = Number(quantity);
    const price =
      activePrice ??
      prices[activeSymbol.id] ??
      activePosition?.lastPrice;

    if (!Number.isFinite(qty) || qty <= 0) {
      setOrderError("أدخل كمية صحيحة أكبر من صفر.");
      return;
    }

    if (price === undefined || !Number.isFinite(price) || price <= 0) {
      setOrderError("لا يوجد سعر صالح للرمز الحالي.");
      return;
    }

    try {
      const next = executePaperOrder(account, {
        symbol: activeSymbol,
        side,
        quantity: qty,
        price,
      });

      onAccountChange(next);
      setPrices((current) => ({
        ...current,
        [activeSymbol.id]: price,
      }));
      setOrderMessage(
        `${side === "buy" ? "شراء" : "بيع"} تجريبي: ${qty} × ${activeSymbol.ticker} @ ${number(price)}`,
      );
    } catch (caught) {
      setOrderError(
        caught instanceof Error ? caught.message : "تعذر تنفيذ الصفقة التجريبية.",
      );
    }
  };

  const applyCommission = () => {
    const value = Number(commissionDraft);
    try {
      onAccountChange(setPaperCommission(account, value));
      setOrderError(null);
    } catch (caught) {
      setCommissionDraft(String(account.commissionBps));
      setOrderError(
        caught instanceof Error ? caught.message : "قيمة العمولة غير صالحة.",
      );
    }
  };

  const reset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }

    onAccountChange(resetPaperAccount(account));
    setPrices({});
    setOrderMessage("تمت إعادة حساب Paper Trading للحالة الابتدائية.");
    setOrderError(null);
    setResetArmed(false);
  };

  return (
    <div className="paper-overlay" role="dialog" aria-modal="true" aria-label="Paper Trading">
      <button className="paper-backdrop" aria-label="إغلاق" onClick={onClose} />

      <section className="paper-panel" dir="rtl">
        <header className="paper-header">
          <div>
            <span className="paper-eyebrow">MARKETOS PAPER TRADING</span>
            <h2>التداول التجريبي</h2>
            <p>محاكاة محلية فقط · لا توجد أموال حقيقية ولا أوامر تصل لأي وسيط.</p>
          </div>
          <div className="paper-header-actions">
            <button onClick={() => void refreshPrices()} disabled={refreshing}>
              {refreshing ? "تحديث…" : "تحديث الأسعار"}
            </button>
            <button className="paper-close" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="paper-currency-tabs">
          {currencies.map((currency) => (
            <button
              key={currency}
              className={selectedCurrency === currency ? "selected" : ""}
              onClick={() => setSelectedCurrency(currency)}
            >
              {currency}
            </button>
          ))}
          <span>كل عملة لها حساب افتراضي مستقل</span>
        </div>

        <div className="paper-body">
          <aside className="paper-ticket">
            <div className="paper-symbol-card">
              <span>
                <strong>{activeSymbol.ticker}</strong>
                <small>{activeSymbol.exchange} · {(activeSymbol.currency || "USD").toUpperCase()}</small>
              </span>
              <b dir="ltr">
                {currentPrice === undefined ? "—" : number(currentPrice)}
              </b>
            </div>

            {replayActive ? (
              <div className="paper-replay-warning">
                Paper Trading متوقف أثناء Replay حتى لا تختلط الأسعار التاريخية بالحساب الحي.
              </div>
            ) : null}

            <label className="paper-field">
              <span>الكمية</span>
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                dir="ltr"
              />
            </label>

            <div className="paper-estimate">
              <span>القيمة التقريبية</span>
              <strong dir="ltr">
                {money(estimatedNotional, (activeSymbol.currency || "USD").toUpperCase())}
              </strong>
            </div>

            <div className="paper-order-buttons">
              <button
                className="buy"
                onClick={() => execute("buy")}
                disabled={replayActive}
              >
                شراء تجريبي
              </button>
              <button
                className="sell"
                onClick={() => execute("sell")}
                disabled={replayActive || !activePosition}
              >
                بيع تجريبي
              </button>
            </div>

            <div className="paper-position-note">
              الكمية الحالية: <b>{activePosition ? number(activePosition.quantity) : "0"}</b>
            </div>

            <div className="paper-commission">
              <label>
                <span>عمولة المحاكاة (bps)</span>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={commissionDraft}
                  onChange={(event) => setCommissionDraft(event.target.value)}
                  onBlur={applyCommission}
                  dir="ltr"
                />
              </label>
              <small>5 bps = 0.05%</small>
            </div>

            {orderMessage ? <div className="paper-success">{orderMessage}</div> : null}
            {orderError ? <div className="paper-error">{orderError}</div> : null}

            <button
              className={resetArmed ? "paper-reset armed" : "paper-reset"}
              onClick={reset}
            >
              {resetArmed ? "تأكيد إعادة الحساب" : "إعادة الحساب الافتراضي"}
            </button>
          </aside>

          <main className="paper-account">
            <div className="paper-metrics">
              <div>
                <span>Equity</span>
                <strong dir="ltr">{money(snapshot.equity, selectedCurrency)}</strong>
              </div>
              <div>
                <span>Cash</span>
                <strong dir="ltr">{money(snapshot.cash, selectedCurrency)}</strong>
              </div>
              <div>
                <span>Market Value</span>
                <strong dir="ltr">{money(snapshot.marketValue, selectedCurrency)}</strong>
              </div>
              <div>
                <span>Total P&L</span>
                <strong
                  className={snapshot.totalPnl >= 0 ? "positive" : "negative"}
                  dir="ltr"
                >
                  {money(snapshot.totalPnl, selectedCurrency)}
                </strong>
              </div>
              <div>
                <span>Return</span>
                <strong
                  className={snapshot.returnPercent >= 0 ? "positive" : "negative"}
                  dir="ltr"
                >
                  {percent(snapshot.returnPercent)}
                </strong>
              </div>
              <div>
                <span>Realized</span>
                <strong
                  className={snapshot.realizedPnl >= 0 ? "positive" : "negative"}
                  dir="ltr"
                >
                  {money(snapshot.realizedPnl, selectedCurrency)}
                </strong>
              </div>
              <div>
                <span>Unrealized</span>
                <strong
                  className={snapshot.unrealizedPnl >= 0 ? "positive" : "negative"}
                  dir="ltr"
                >
                  {money(snapshot.unrealizedPnl, selectedCurrency)}
                </strong>
              </div>
              <div>
                <span>Starting Cash</span>
                <strong dir="ltr">{money(snapshot.initialCash, selectedCurrency)}</strong>
              </div>
            </div>

            <div className="paper-tabs">
              <button
                className={tab === "positions" ? "selected" : ""}
                onClick={() => setTab("positions")}
              >
                المراكز ({snapshot.positions.length})
              </button>
              <button
                className={tab === "orders" ? "selected" : ""}
                onClick={() => setTab("orders")}
              >
                السجل ({relevantOrders.length})
              </button>
            </div>

            {tab === "positions" ? (
              <div className="paper-table-wrap">
                <table className="paper-table">
                  <thead>
                    <tr>
                      <th>الرمز</th>
                      <th>الكمية</th>
                      <th>متوسط التكلفة</th>
                      <th>السعر</th>
                      <th>القيمة</th>
                      <th>Unrealized P&L</th>
                      <th>Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.positions.map((position) => (
                      <tr key={position.symbol.id}>
                        <td>
                          <strong>{position.symbol.ticker}</strong>
                          <small>{position.symbol.name}</small>
                        </td>
                        <td dir="ltr">{number(position.quantity)}</td>
                        <td dir="ltr">{number(position.averageCost)}</td>
                        <td dir="ltr">{number(position.marketPrice)}</td>
                        <td dir="ltr">{money(position.marketValue, selectedCurrency)}</td>
                        <td
                          className={position.unrealizedPnl >= 0 ? "positive" : "negative"}
                          dir="ltr"
                        >
                          {money(position.unrealizedPnl, selectedCurrency)}
                        </td>
                        <td
                          className={position.returnPercent >= 0 ? "positive" : "negative"}
                          dir="ltr"
                        >
                          {percent(position.returnPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {snapshot.positions.length === 0 ? (
                  <div className="paper-empty">لا توجد مراكز تجريبية بعملة {selectedCurrency}.</div>
                ) : null}
              </div>
            ) : (
              <div className="paper-table-wrap">
                <table className="paper-table orders">
                  <thead>
                    <tr>
                      <th>الوقت</th>
                      <th>الرمز</th>
                      <th>النوع</th>
                      <th>الكمية</th>
                      <th>السعر</th>
                      <th>القيمة</th>
                      <th>العمولة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relevantOrders.slice(0, 100).map((order) => (
                      <tr key={order.id}>
                        <td>{dateTime(order.executedAt)}</td>
                        <td><strong>{order.symbol.ticker}</strong></td>
                        <td className={order.side === "buy" ? "positive" : "negative"}>
                          {order.side === "buy" ? "شراء" : "بيع"}
                        </td>
                        <td dir="ltr">{number(order.quantity)}</td>
                        <td dir="ltr">{number(order.price)}</td>
                        <td dir="ltr">{money(order.notional, selectedCurrency)}</td>
                        <td dir="ltr">{money(order.commission, selectedCurrency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {relevantOrders.length === 0 ? (
                  <div className="paper-empty">لا يوجد سجل أوامر بعملة {selectedCurrency}.</div>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
