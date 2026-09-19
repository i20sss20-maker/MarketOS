import type { Candle } from "@marketos/market-core";

export type StrategyKind =
  | "sma-cross"
  | "rsi-reversion"
  | "breakout";

export type BacktestConfig = {
  strategy: StrategyKind;
  startingCapital: number;
  commissionBps: number;
  slippageBps: number;
  fastPeriod: number;
  slowPeriod: number;
  rsiPeriod: number;
  rsiEntry: number;
  rsiExit: number;
  breakoutPeriod: number;
  breakoutExitPeriod: number;
};

export type BacktestTrade = {
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  returnPercent: number;
  barsHeld: number;
  exitReason: "signal" | "end-of-data";
};

export type EquityPoint = {
  time: number;
  value: number;
};

export type BacktestMetrics = {
  startingCapital: number;
  endingCapital: number;
  totalReturnPercent: number;
  buyHoldReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  averageTradePercent: number;
  maxDrawdownPercent: number;
  exposurePercent: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
};

export type BacktestResult = {
  strategy: StrategyKind;
  strategyName: string;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  config: BacktestConfig;
};

export const defaultBacktestConfig: BacktestConfig = {
  strategy: "sma-cross",
  startingCapital: 10_000,
  commissionBps: 5,
  slippageBps: 2,
  fastPeriod: 10,
  slowPeriod: 30,
  rsiPeriod: 14,
  rsiEntry: 30,
  rsiExit: 60,
  breakoutPeriod: 20,
  breakoutExitPeriod: 10,
};

export const strategyCatalog: Array<{
  id: StrategyKind;
  name: string;
  description: string;
}> = [
  {
    id: "sma-cross",
    name: "SMA Cross",
    description: "دخول عند تقاطع المتوسط السريع فوق البطيء وخروج عند العكس.",
  },
  {
    id: "rsi-reversion",
    name: "RSI Reversion",
    description: "دخول عند هبوط RSI تحت المستوى المحدد وخروج عند التعافي.",
  },
  {
    id: "breakout",
    name: "Breakout",
    description: "دخول عند اختراق أعلى نطاق سابق وخروج عند كسر أدنى نطاق الخروج.",
  },
];

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfig(input: Partial<BacktestConfig>): BacktestConfig {
  const config = { ...defaultBacktestConfig, ...input };

  return {
    strategy: config.strategy,
    startingCapital: clampNumber(config.startingCapital, 100, 10_000_000_000),
    commissionBps: clampNumber(config.commissionBps, 0, 500),
    slippageBps: clampNumber(config.slippageBps, 0, 500),
    fastPeriod: clampInteger(config.fastPeriod, 2, 500),
    slowPeriod: clampInteger(config.slowPeriod, 3, 1000),
    rsiPeriod: clampInteger(config.rsiPeriod, 2, 200),
    rsiEntry: clampNumber(config.rsiEntry, 1, 99),
    rsiExit: clampNumber(config.rsiExit, 1, 99),
    breakoutPeriod: clampInteger(config.breakoutPeriod, 2, 500),
    breakoutExitPeriod: clampInteger(config.breakoutExitPeriod, 2, 500),
  };
}

function smaByIndex(candles: Candle[], period: number): Array<number | undefined> {
  const values: Array<number | undefined> = new Array(candles.length).fill(undefined);
  if (candles.length < period) return values;

  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) values[index] = sum / period;
  }
  return values;
}

function rsiByIndex(candles: Candle[], period: number): Array<number | undefined> {
  const values: Array<number | undefined> = new Array(candles.length).fill(undefined);
  if (candles.length <= period) return values;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const rsi = () =>
    averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / averageLoss);

  values[period] = rsi();

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    values[index] = rsi();
  }

  return values;
}

function priorHighest(candles: Candle[], index: number, period: number) {
  if (index < period) return undefined;
  let highest = -Infinity;
  for (let cursor = index - period; cursor < index; cursor += 1) {
    highest = Math.max(highest, candles[cursor].high);
  }
  return Number.isFinite(highest) ? highest : undefined;
}

function priorLowest(candles: Candle[], index: number, period: number) {
  if (index < period) return undefined;
  let lowest = Infinity;
  for (let cursor = index - period; cursor < index; cursor += 1) {
    lowest = Math.min(lowest, candles[cursor].low);
  }
  return Number.isFinite(lowest) ? lowest : undefined;
}

function strategyName(strategy: StrategyKind) {
  return strategyCatalog.find((item) => item.id === strategy)?.name ?? strategy;
}

export function runBacktest(
  candles: Candle[],
  input: Partial<BacktestConfig> = {},
): BacktestResult {
  const config = normalizeConfig(input);

  if (candles.length < 25) {
    throw new Error("Backtest requires at least 25 candles.");
  }

  if (config.strategy === "sma-cross" && config.fastPeriod >= config.slowPeriod) {
    throw new Error("Fast SMA period must be smaller than slow SMA period.");
  }

  if (config.strategy === "rsi-reversion" && config.rsiEntry >= config.rsiExit) {
    throw new Error("RSI entry level must be below RSI exit level.");
  }

  const commissionRate = config.commissionBps / 10_000;
  const slippageRate = config.slippageBps / 10_000;

  const fastSma = config.strategy === "sma-cross"
    ? smaByIndex(candles, config.fastPeriod)
    : [];
  const slowSma = config.strategy === "sma-cross"
    ? smaByIndex(candles, config.slowPeriod)
    : [];
  const rsi = config.strategy === "rsi-reversion"
    ? rsiByIndex(candles, config.rsiPeriod)
    : [];

  let cash = config.startingCapital;
  let position:
    | {
        entryIndex: number;
        entryTime: number;
        entryPrice: number;
        capitalBeforeEntry: number;
        investedCapital: number;
      }
    | undefined;

  let barsInPosition = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let peakEquity = config.startingCapital;
  let maxDrawdownPercent = 0;

  const markEquity = (index: number) => {
    const candle = candles[index];
    const equity = position
      ? position.investedCapital * (candle.close / position.entryPrice)
      : cash;

    peakEquity = Math.max(peakEquity, equity);
    if (peakEquity > 0) {
      maxDrawdownPercent = Math.max(
        maxDrawdownPercent,
        ((peakEquity - equity) / peakEquity) * 100,
      );
    }

    equityCurve.push({ time: candle.time, value: equity });
  };

  const openPosition = (index: number) => {
    const rawPrice = candles[index].close;
    const entryPrice = rawPrice * (1 + slippageRate);
    const capitalBeforeEntry = cash;
    const investedCapital = cash * (1 - commissionRate);

    position = {
      entryIndex: index,
      entryTime: candles[index].time,
      entryPrice,
      capitalBeforeEntry,
      investedCapital,
    };
    cash = 0;
  };

  const closePosition = (
    index: number,
    reason: BacktestTrade["exitReason"],
  ) => {
    if (!position) return;

    const rawExit = candles[index].close;
    const exitPrice = rawExit * (1 - slippageRate);
    const grossExitValue = position.investedCapital * (exitPrice / position.entryPrice);
    cash = grossExitValue * (1 - commissionRate);
    const pnl = cash - position.capitalBeforeEntry;
    const returnPercent = position.capitalBeforeEntry === 0
      ? 0
      : (pnl / position.capitalBeforeEntry) * 100;

    trades.push({
      entryIndex: position.entryIndex,
      exitIndex: index,
      entryTime: position.entryTime,
      exitTime: candles[index].time,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      returnPercent,
      barsHeld: Math.max(1, index - position.entryIndex),
      exitReason: reason,
    });

    position = undefined;
  };

  for (let index = 1; index < candles.length; index += 1) {
    let shouldEnter = false;
    let shouldExit = false;

    if (config.strategy === "sma-cross") {
      const fast = fastSma[index];
      const slow = slowSma[index];
      const previousFast = fastSma[index - 1];
      const previousSlow = slowSma[index - 1];

      if (
        fast !== undefined &&
        slow !== undefined &&
        previousFast !== undefined &&
        previousSlow !== undefined
      ) {
        shouldEnter = previousFast <= previousSlow && fast > slow;
        shouldExit = previousFast >= previousSlow && fast < slow;
      }
    } else if (config.strategy === "rsi-reversion") {
      const currentRsi = rsi[index];
      const previousRsi = rsi[index - 1];

      if (currentRsi !== undefined && previousRsi !== undefined) {
        shouldEnter = previousRsi >= config.rsiEntry && currentRsi < config.rsiEntry;
        shouldExit = previousRsi <= config.rsiExit && currentRsi > config.rsiExit;
      }
    } else {
      const breakoutHigh = priorHighest(candles, index, config.breakoutPeriod);
      const exitLow = priorLowest(candles, index, config.breakoutExitPeriod);

      shouldEnter = breakoutHigh !== undefined && candles[index].close > breakoutHigh;
      shouldExit = exitLow !== undefined && candles[index].close < exitLow;
    }

    if (position) {
      barsInPosition += 1;
      if (shouldExit) closePosition(index, "signal");
    } else if (shouldEnter) {
      openPosition(index);
    }

    markEquity(index);
  }

  if (position) {
    closePosition(candles.length - 1, "end-of-data");
    const last = equityCurve[equityCurve.length - 1];
    if (last) last.value = cash;
  }

  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.pnl < 0)
      .reduce((sum, trade) => sum + trade.pnl, 0),
  );
  const winningTrades = trades.filter((trade) => trade.pnl > 0).length;
  const losingTrades = trades.filter((trade) => trade.pnl < 0).length;
  const totalReturnPercent = ((cash / config.startingCapital) - 1) * 100;
  const buyHoldReturnPercent =
    ((candles[candles.length - 1].close / candles[0].close) - 1) * 100;

  const metrics: BacktestMetrics = {
    startingCapital: config.startingCapital,
    endingCapital: cash,
    totalReturnPercent,
    buyHoldReturnPercent,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRatePercent: trades.length === 0 ? 0 : (winningTrades / trades.length) * 100,
    averageTradePercent: trades.length === 0
      ? 0
      : trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / trades.length,
    maxDrawdownPercent,
    exposurePercent: (barsInPosition / Math.max(1, candles.length - 1)) * 100,
    grossProfit,
    grossLoss,
    profitFactor:
      grossLoss === 0
        ? (grossProfit > 0 ? null : 0)
        : grossProfit / grossLoss,
  };

  return {
    strategy: config.strategy,
    strategyName: strategyName(config.strategy),
    metrics,
    trades,
    equityCurve,
    config,
  };
}
