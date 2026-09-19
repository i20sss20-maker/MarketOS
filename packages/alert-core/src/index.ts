import type {
  Candle,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";

export type AlertLogic = "all" | "any";

export type NumericAlertMetric =
  | "price"
  | "changePercent"
  | "volume"
  | "rsi14"
  | "sma20Distance";

export type NumericAlertCondition = {
  id: string;
  type: "numeric";
  metric: NumericAlertMetric;
  operator: "above" | "below";
  value: number;
};

export type CrossAlertCondition = {
  id: string;
  type: "sma20Cross";
  direction: "above" | "below";
};

export type AdvancedAlertCondition =
  | NumericAlertCondition
  | CrossAlertCondition;

export type AdvancedAlert = {
  id: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
  logic: AlertLogic;
  conditions: AdvancedAlertCondition[];
  enabled: boolean;
  createdAt: number;
  triggeredAt?: number;
  lastCheckedAt?: number;
};

export type AlertMetricSnapshot = {
  price?: number;
  changePercent?: number;
  volume?: number;
  rsi14?: number;
  sma20?: number;
  sma20Distance?: number;
  sma20Cross?: "above" | "below" | "none";
};

export type ConditionEvaluation = {
  conditionId: string;
  matched: boolean;
  actual?: number | string;
  expected: string;
};

export type AlertEvaluation = {
  matched: boolean;
  snapshot: AlertMetricSnapshot;
  conditions: ConditionEvaluation[];
};

export type AlertEvaluationContext = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  candles: Candle[];
  quote?: Quote | null;
};

export const alertMetricLabels: Record<NumericAlertMetric, string> = {
  price: "السعر",
  changePercent: "التغير %",
  volume: "الحجم",
  rsi14: "RSI 14",
  sma20Distance: "البعد عن SMA20 %",
};

export function createAlertConditionId() {
  return `condition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function latestSma(candles: Candle[], period: number, endIndex: number) {
  if (period <= 0 || endIndex < period - 1) return undefined;
  let sum = 0;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    sum += candles[index].close;
  }
  return sum / period;
}

function latestRsi(candles: Candle[], period = 14) {
  if (candles.length <= period) return undefined;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function percentChange(from: number, to: number) {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return undefined;
  return ((to - from) / from) * 100;
}

export function buildAlertSnapshot(
  context: AlertEvaluationContext,
): AlertMetricSnapshot {
  const candles = context.candles;
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  if (!last) return {};

  const price = context.quote?.price ?? last.close;
  const changePercent =
    context.quote?.percentChange ??
    (previous ? percentChange(previous.close, last.close) : undefined);
  const volume = context.quote?.volume ?? last.volume;
  const sma20 = latestSma(candles, 20, candles.length - 1);
  const previousSma20 = latestSma(candles, 20, candles.length - 2);
  const sma20Distance =
    sma20 === undefined ? undefined : percentChange(sma20, last.close);

  let sma20Cross: AlertMetricSnapshot["sma20Cross"] = "none";
  if (
    previous &&
    sma20 !== undefined &&
    previousSma20 !== undefined
  ) {
    if (previous.close <= previousSma20 && last.close > sma20) {
      sma20Cross = "above";
    } else if (previous.close >= previousSma20 && last.close < sma20) {
      sma20Cross = "below";
    }
  }

  return {
    price,
    changePercent,
    volume,
    rsi14: latestRsi(candles, 14),
    sma20,
    sma20Distance,
    sma20Cross,
  };
}

function evaluateNumericCondition(
  condition: NumericAlertCondition,
  snapshot: AlertMetricSnapshot,
): ConditionEvaluation {
  const actual = snapshot[condition.metric];
  const expected =
    `${condition.operator === "above" ? "≥" : "≤"} ${condition.value}`;

  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return {
      conditionId: condition.id,
      matched: false,
      expected,
    };
  }

  return {
    conditionId: condition.id,
    matched:
      condition.operator === "above"
        ? actual >= condition.value
        : actual <= condition.value,
    actual,
    expected,
  };
}

function evaluateCrossCondition(
  condition: CrossAlertCondition,
  snapshot: AlertMetricSnapshot,
): ConditionEvaluation {
  const actual = snapshot.sma20Cross ?? "none";
  return {
    conditionId: condition.id,
    matched: actual === condition.direction,
    actual,
    expected:
      condition.direction === "above"
        ? "Cross above SMA20"
        : "Cross below SMA20",
  };
}

export function evaluateAdvancedAlert(
  alert: AdvancedAlert,
  context: AlertEvaluationContext,
): AlertEvaluation {
  const snapshot = buildAlertSnapshot(context);

  if (
    !alert.enabled ||
    alert.triggeredAt ||
    alert.symbol.id !== context.symbol.id ||
    alert.timeframe !== context.timeframe ||
    alert.conditions.length === 0
  ) {
    return {
      matched: false,
      snapshot,
      conditions: [],
    };
  }

  const conditions = alert.conditions.map((condition) =>
    condition.type === "numeric"
      ? evaluateNumericCondition(condition, snapshot)
      : evaluateCrossCondition(condition, snapshot),
  );

  return {
    matched:
      alert.logic === "all"
        ? conditions.every((condition) => condition.matched)
        : conditions.some((condition) => condition.matched),
    snapshot,
    conditions,
  };
}

export function evaluateAdvancedAlerts(
  alerts: AdvancedAlert[],
  context: AlertEvaluationContext,
  now = Date.now(),
): {
  alerts: AdvancedAlert[];
  triggered: Array<{
    alert: AdvancedAlert;
    evaluation: AlertEvaluation;
  }>;
} {
  const triggered: Array<{
    alert: AdvancedAlert;
    evaluation: AlertEvaluation;
  }> = [];

  const next = alerts.map((alert) => {
    if (alert.symbol.id !== context.symbol.id || alert.timeframe !== context.timeframe) {
      return alert;
    }

    const evaluation = evaluateAdvancedAlert(alert, context);
    const checked = {
      ...alert,
      lastCheckedAt: now,
    };

    if (!evaluation.matched) return checked;

    const updated = {
      ...checked,
      triggeredAt: now,
    };
    triggered.push({
      alert: updated,
      evaluation,
    });
    return updated;
  });

  return { alerts: next, triggered };
}

export function describeAdvancedAlert(alert: AdvancedAlert) {
  const joiner = alert.logic === "all" ? " AND " : " OR ";
  return alert.conditions.map((condition) => {
    if (condition.type === "sma20Cross") {
      return condition.direction === "above"
        ? "Cross ↑ SMA20"
        : "Cross ↓ SMA20";
    }

    const label = alertMetricLabels[condition.metric];
    const operator = condition.operator === "above" ? "≥" : "≤";
    return `${label} ${operator} ${condition.value}`;
  }).join(joiner);
}
