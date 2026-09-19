import assert from "node:assert/strict";
import {
  buildAlertSnapshot,
  createAlertConditionId,
  describeAdvancedAlert,
  evaluateAdvancedAlert,
  evaluateAdvancedAlerts,
} from "../packages/alert-core/dist/index.js";

const symbol = {
  id: "XNAS:AAPL",
  ticker: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  assetClass: "stock",
  currency: "USD",
};

const candles = Array.from({ length: 25 }, (_, index) => ({
  time: 1_800_000_000 + index * 3600,
  open: 100,
  high: index === 24 ? 121 : 101,
  low: 99,
  close: index === 24 ? 120 : 100,
  volume: index === 24 ? 2_000_000 : 500_000,
}));

const quote = {
  symbol: "AAPL",
  price: 120,
  percentChange: 3.5,
  volume: 2_000_000,
  timestamp: candles[candles.length - 1].time,
  source: "test",
};

const context = { symbol, timeframe: "1h", candles, quote };
const snapshot = buildAlertSnapshot(context);

assert.equal(snapshot.price, 120);
assert.equal(snapshot.changePercent, 3.5);
assert.equal(snapshot.volume, 2_000_000);
assert.equal(snapshot.sma20Cross, "above");
assert.ok(typeof snapshot.rsi14 === "number");
assert.ok(snapshot.sma20Distance > 0);

const priceCondition = {
  id: createAlertConditionId(),
  type: "numeric",
  metric: "price",
  operator: "above",
  value: 110,
};

const volumeCondition = {
  id: createAlertConditionId(),
  type: "numeric",
  metric: "volume",
  operator: "above",
  value: 1_000_000,
};

const crossCondition = {
  id: createAlertConditionId(),
  type: "sma20Cross",
  direction: "above",
};

const allAlert = {
  id: "all-alert",
  symbol,
  timeframe: "1h",
  logic: "all",
  conditions: [priceCondition, volumeCondition, crossCondition],
  enabled: true,
  createdAt: 1,
};

const allEvaluation = evaluateAdvancedAlert(allAlert, context);
assert.equal(allEvaluation.matched, true);
assert.equal(allEvaluation.conditions.length, 3);
assert.ok(allEvaluation.conditions.every((condition) => condition.matched));
assert.ok(describeAdvancedAlert(allAlert).includes("AND"));

const anyAlert = {
  id: "any-alert",
  symbol,
  timeframe: "1h",
  logic: "any",
  conditions: [
    {
      id: createAlertConditionId(),
      type: "numeric",
      metric: "rsi14",
      operator: "below",
      value: 10,
    },
    {
      id: createAlertConditionId(),
      type: "numeric",
      metric: "changePercent",
      operator: "above",
      value: 3,
    },
  ],
  enabled: true,
  createdAt: 2,
};

assert.equal(evaluateAdvancedAlert(anyAlert, context).matched, true);
assert.ok(describeAdvancedAlert(anyAlert).includes("OR"));

const wrongTimeframe = { ...allAlert, id: "wrong-timeframe", timeframe: "4h" };
assert.equal(evaluateAdvancedAlert(wrongTimeframe, context).matched, false);

const disabled = { ...allAlert, id: "disabled", enabled: false };
assert.equal(evaluateAdvancedAlert(disabled, context).matched, false);

const now = 1_900_000_000_000;
const batch = evaluateAdvancedAlerts([allAlert, anyAlert, wrongTimeframe], context, now);
assert.equal(batch.triggered.length, 2);
assert.equal(batch.alerts.find((alert) => alert.id === "all-alert")?.triggeredAt, now);
assert.equal(batch.alerts.find((alert) => alert.id === "all-alert")?.lastCheckedAt, now);
assert.equal(batch.alerts.find((alert) => alert.id === "wrong-timeframe")?.triggeredAt, undefined);

const downwardCandles = Array.from({ length: 25 }, (_, index) => ({
  time: 1_810_000_000 + index * 3600,
  open: 100,
  high: 101,
  low: index === 24 ? 79 : 99,
  close: index === 24 ? 80 : 100,
  volume: 600_000,
}));

const downwardSnapshot = buildAlertSnapshot({
  symbol,
  timeframe: "4h",
  candles: downwardCandles,
  quote: null,
});
assert.equal(downwardSnapshot.sma20Cross, "below");

console.log(
  `Advanced Alerts smoke passed: triggered=${batch.triggered.length}, RSI=${snapshot.rsi14.toFixed(2)}, cross=${snapshot.sma20Cross}`
);
