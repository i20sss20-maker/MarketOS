import type { MarketSymbol } from "@marketos/market-core";

export type PaperSide = "buy" | "sell";

export type PaperWallet = {
  currency: string;
  initialCash: number;
  cash: number;
  realizedPnl: number;
};

export type PaperPosition = {
  symbol: MarketSymbol;
  quantity: number;
  averageCost: number;
  realizedPnl: number;
  lastPrice: number;
  openedAt: number;
  updatedAt: number;
};

export type PaperOrder = {
  id: string;
  symbol: MarketSymbol;
  side: PaperSide;
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  currency: string;
  executedAt: number;
};

export type PaperAccountState = {
  version: 1;
  commissionBps: number;
  wallets: Record<string, PaperWallet>;
  positions: PaperPosition[];
  orders: PaperOrder[];
};

export type PaperOrderInput = {
  symbol: MarketSymbol;
  side: PaperSide;
  quantity: number;
  price: number;
  executedAt?: number;
  orderId?: string;
};

export type PaperPriceMap = Record<string, number | undefined>;

export type PaperAccountSnapshot = {
  currency: string;
  initialCash: number;
  cash: number;
  marketValue: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  returnPercent: number;
  positions: Array<PaperPosition & {
    marketPrice: number;
    marketValue: number;
    unrealizedPnl: number;
    returnPercent: number;
  }>;
};

const DEFAULT_INITIAL_CASH = 100_000;
const MAX_ORDERS = 500;

function currencyKey(value: string) {
  return (value.trim() || "USD").toUpperCase();
}

function cloneState(state: PaperAccountState): PaperAccountState {
  return structuredClone(state);
}

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function commissionRate(bps: number) {
  if (!Number.isFinite(bps) || bps < 0 || bps > 500) {
    throw new Error("Commission must be between 0 and 500 bps.");
  }
  return bps / 10_000;
}

function defaultOrderId(executedAt: number) {
  return `paper-${executedAt}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPaperAccount(
  initialBalances: Record<string, number> = {
    USD: DEFAULT_INITIAL_CASH,
    SAR: DEFAULT_INITIAL_CASH,
  },
  commissionBps = 5,
): PaperAccountState {
  commissionRate(commissionBps);

  const wallets: Record<string, PaperWallet> = {};
  for (const [currency, amount] of Object.entries(initialBalances)) {
    positiveFinite(amount, `${currency} initial cash`);
    const key = currencyKey(currency);
    wallets[key] = {
      currency: key,
      initialCash: amount,
      cash: amount,
      realizedPnl: 0,
    };
  }

  return {
    version: 1,
    commissionBps,
    wallets,
    positions: [],
    orders: [],
  };
}

export function ensurePaperWallet(
  state: PaperAccountState,
  currency: string,
  initialCash = DEFAULT_INITIAL_CASH,
): PaperAccountState {
  const key = currencyKey(currency);
  if (state.wallets[key]) return state;

  positiveFinite(initialCash, `${key} initial cash`);

  const next = cloneState(state);
  next.wallets[key] = {
    currency: key,
    initialCash,
    cash: initialCash,
    realizedPnl: 0,
  };
  return next;
}

export function setPaperCommission(
  state: PaperAccountState,
  commissionBps: number,
): PaperAccountState {
  commissionRate(commissionBps);
  return {
    ...cloneState(state),
    commissionBps,
  };
}

export function executePaperOrder(
  state: PaperAccountState,
  input: PaperOrderInput,
): PaperAccountState {
  positiveFinite(input.quantity, "Quantity");
  positiveFinite(input.price, "Price");

  const currency = currencyKey(input.symbol.currency);
  let next = ensurePaperWallet(state, currency);
  next = cloneState(next);

  const wallet = next.wallets[currency];
  const rate = commissionRate(next.commissionBps);
  const notional = input.quantity * input.price;
  const commission = notional * rate;
  const executedAt = input.executedAt ?? Date.now();
  const orderId = input.orderId ?? defaultOrderId(executedAt);

  const positionIndex = next.positions.findIndex(
    (position) => position.symbol.id === input.symbol.id,
  );
  const position = positionIndex >= 0
    ? next.positions[positionIndex]
    : undefined;

  if (input.side === "buy") {
    const totalCost = notional + commission;
    if (wallet.cash + 1e-9 < totalCost) {
      throw new Error(
        `Insufficient ${currency} paper cash. Required ${totalCost.toFixed(2)}, available ${wallet.cash.toFixed(2)}.`,
      );
    }

    wallet.cash -= totalCost;

    if (position) {
      const existingCost = position.averageCost * position.quantity;
      const newQuantity = position.quantity + input.quantity;
      const newCost = existingCost + totalCost;

      next.positions[positionIndex] = {
        ...position,
        quantity: newQuantity,
        averageCost: newCost / newQuantity,
        lastPrice: input.price,
        updatedAt: executedAt,
      };
    } else {
      next.positions.push({
        symbol: structuredClone(input.symbol),
        quantity: input.quantity,
        averageCost: totalCost / input.quantity,
        realizedPnl: 0,
        lastPrice: input.price,
        openedAt: executedAt,
        updatedAt: executedAt,
      });
    }
  } else {
    if (!position || position.quantity + 1e-9 < input.quantity) {
      throw new Error("Cannot sell more than the available paper position.");
    }

    const proceeds = notional - commission;
    const costBasis = position.averageCost * input.quantity;
    const realized = proceeds - costBasis;

    wallet.cash += proceeds;
    wallet.realizedPnl += realized;

    const remainingQuantity = position.quantity - input.quantity;
    if (remainingQuantity <= 1e-9) {
      next.positions.splice(positionIndex, 1);
    } else {
      next.positions[positionIndex] = {
        ...position,
        quantity: remainingQuantity,
        realizedPnl: position.realizedPnl + realized,
        lastPrice: input.price,
        updatedAt: executedAt,
      };
    }
  }

  next.orders.unshift({
    id: orderId,
    symbol: structuredClone(input.symbol),
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    notional,
    commission,
    currency,
    executedAt,
  });
  next.orders = next.orders.slice(0, MAX_ORDERS);

  return next;
}

export function updatePaperLastPrices(
  state: PaperAccountState,
  prices: PaperPriceMap,
): PaperAccountState {
  const next = cloneState(state);
  next.positions = next.positions.map((position) => {
    const price = prices[position.symbol.id];
    return Number.isFinite(price) && (price as number) > 0
      ? { ...position, lastPrice: price as number }
      : position;
  });
  return next;
}

export function getPaperSnapshot(
  state: PaperAccountState,
  currency: string,
  prices: PaperPriceMap = {},
): PaperAccountSnapshot {
  const key = currencyKey(currency);
  const withWallet = ensurePaperWallet(state, key);
  const wallet = withWallet.wallets[key];

  const positions = withWallet.positions
    .filter((position) => currencyKey(position.symbol.currency) === key)
    .map((position) => {
      const candidate = prices[position.symbol.id];
      const marketPrice =
        Number.isFinite(candidate) && (candidate as number) > 0
          ? candidate as number
          : position.lastPrice;

      const marketValue = position.quantity * marketPrice;
      const costBasis = position.quantity * position.averageCost;
      const unrealizedPnl = marketValue - costBasis;
      const returnPercent = costBasis === 0
        ? 0
        : (unrealizedPnl / costBasis) * 100;

      return {
        ...position,
        marketPrice,
        marketValue,
        unrealizedPnl,
        returnPercent,
      };
    });

  const marketValue = positions.reduce(
    (sum, position) => sum + position.marketValue,
    0,
  );
  const unrealizedPnl = positions.reduce(
    (sum, position) => sum + position.unrealizedPnl,
    0,
  );
  const equity = wallet.cash + marketValue;
  const totalPnl = equity - wallet.initialCash;
  const returnPercent = wallet.initialCash === 0
    ? 0
    : (totalPnl / wallet.initialCash) * 100;

  return {
    currency: key,
    initialCash: wallet.initialCash,
    cash: wallet.cash,
    marketValue,
    equity,
    realizedPnl: wallet.realizedPnl,
    unrealizedPnl,
    totalPnl,
    returnPercent,
    positions,
  };
}

export function resetPaperAccount(
  state: PaperAccountState,
  balances?: Record<string, number>,
): PaperAccountState {
  const initialBalances = balances ?? Object.fromEntries(
    Object.values(state.wallets).map((wallet) => [
      wallet.currency,
      wallet.initialCash,
    ]),
  );

  return createPaperAccount(initialBalances, state.commissionBps);
}
