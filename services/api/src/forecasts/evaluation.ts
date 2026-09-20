import { createHash } from "node:crypto";
import type { AnalystForecastResponse, Candle, Quote } from "@marketos/market-core";
import type { ForecastRecord } from "./ledger.js";
import { validateProviderCandles } from "../production/providerGuard.js";

const METHOD = "quote-to-future-closed-bars-v1" as const;
const SETTLEMENT_SECONDS = 300;
export type EvaluationPlan = {
  version: 1;
  method: typeof METHOD;
  provider: string;
  timeframe: "1d" | "4h";
  horizonBars: number;
  thresholdPercent: number;
  issuedAt: number;
  referenceAsOf: number;
  referencePrice: number;
  anchorTime: number;
  anchorOpen: number;
};
export type ForecastEvaluation = {
  version: 1;
  method: typeof METHOD;
  forecastHash: string;
  planHash: string;
  provider: string;
  targetBarTime: number;
  confirmedAt: number;
  evaluationPrice: number;
  realizedReturnPercent: number;
  realizedOutcome: "bull" | "base" | "bear";
  expectedOutcome: "bull" | "base" | "bear";
  correct: boolean;
  brierScore: number;
  evidenceHash: string;
};
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const positive = (value: number) => Number.isFinite(value) && value > 0;
const integer = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Freeze the policy at issuance. Older/no-calibration records are never retrofitted. */
export function makeEvaluationPlan(forecast: AnalystForecastResponse, candles: Candle[], quote: Quote | null): EvaluationPlan | undefined {
  const calibration = forecast.calibration;
  const anchor = candles.at(-1);
  if (!calibration || !anchor || !quote || forecast.dataMode !== "provider" ||
      !["1d", "4h"].includes(calibration.timeframe) ||
      !integer(calibration.lookaheadBars) || calibration.lookaheadBars > 60 ||
      !positive(calibration.outcomeThresholdPercent) || calibration.outcomeThresholdPercent > 100 ||
      !integer(quote.timestamp) || quote.timestamp > forecast.generatedAt ||
      quote.source !== forecast.dataProvider || !positive(quote.price) ||
      Math.round(quote.price * 10_000) / 10_000 !== forecast.referencePrice ||
      !integer(anchor.time) || anchor.time > forecast.generatedAt || !positive(anchor.open)) return undefined;
  return {
    version: 1, method: METHOD, provider: forecast.dataProvider,
    timeframe: calibration.timeframe as "1d" | "4h", horizonBars: calibration.lookaheadBars,
    thresholdPercent: calibration.outcomeThresholdPercent, issuedAt: forecast.generatedAt,
    referenceAsOf: quote.timestamp, referencePrice: forecast.referencePrice,
    anchorTime: anchor.time, anchorOpen: anchor.open,
  };
}

export function validEvaluationPlan(plan: EvaluationPlan, forecast: AnalystForecastResponse) {
  const c = forecast.calibration;
  return !!plan && plan.version === 1 && plan.method === METHOD && !!c &&
    ["1d", "4h"].includes(plan.timeframe) && plan.timeframe === c.timeframe &&
    integer(plan.horizonBars) && plan.horizonBars <= 60 && plan.horizonBars === c.lookaheadBars &&
    positive(plan.thresholdPercent) && plan.thresholdPercent <= 100 && plan.thresholdPercent === c.outcomeThresholdPercent &&
    plan.provider === forecast.dataProvider && !/demo|sample|fallback/i.test(plan.provider) &&
    forecast.dataMode === "provider" && integer(plan.issuedAt) && plan.issuedAt === forecast.generatedAt &&
    integer(plan.referenceAsOf) && plan.referenceAsOf <= plan.issuedAt &&
    positive(plan.referencePrice) && plan.referencePrice === forecast.referencePrice &&
    integer(plan.anchorTime) && plan.anchorTime <= plan.issuedAt && positive(plan.anchorOpen);
}

export type EvaluationDecision = { status: "resolved"; evaluation: ForecastEvaluation } |
  { status: "pending"; reason: "no-plan" | "history-missing" | "not-final" | "source-revision" };

/** No now-price fallback. The anchor must exist and the target must have a successor. */
export function evaluateForecast(record: ForecastRecord, candles: Candle[], provider: string, nowMs = Date.now()): EvaluationDecision {
  const plan = record.evaluationPlan;
  if (!plan) return { status: "pending", reason: "no-plan" };
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0 || !validEvaluationPlan(plan, record.forecast) ||
      record.forecastHash !== digest(record.forecast) || record.planHash !== digest(plan) ||
      provider !== plan.provider) throw new Error("Forecast evaluation provenance mismatch");
  const now = Math.floor(nowMs / 1000);
  validateProviderCandles(candles, now);
  // Even small future timestamps are not admissible evidence for scoring.
  if (candles.some(bar => bar.time > now)) throw new Error("Future candle evidence");
  const anchorIndex = candles.findIndex(bar => bar.time === plan.anchorTime);
  if (anchorIndex < 0) return { status: "pending", reason: "history-missing" };
  const anchor = candles[anchorIndex];
  if (Math.abs(anchor.open - plan.anchorOpen) > Math.max(1e-8, plan.anchorOpen * 1e-8)) {
    return { status: "pending", reason: "source-revision" };
  }
  const index = anchorIndex + plan.horizonBars;
  const target = candles[index];
  const successor = candles[index + 1];
  if (!target || !successor) return { status: "pending", reason: "not-final" };
  // Intraday is UTC. Daily values are exchange-date labels, NOT UTC close instants.
  // Wait through the whole labelled date + the maximum civil offset; prefer delay
  // over scoring an unfinished daily candle. Holidays require real successor bars.
  const closeUpperBound = target.time + (plan.timeframe === "1d" ? 38 * 3600 : 4 * 3600);
  if (target.time <= plan.issuedAt || Math.max(closeUpperBound, successor.time) + SETTLEMENT_SECONDS > now) {
    return { status: "pending", reason: "not-final" };
  }
  const realizedReturnPercent = (target.close / plan.referencePrice - 1) * 100;
  const realizedOutcome = realizedReturnPercent > plan.thresholdPercent + 1e-9 ? "bull" :
    realizedReturnPercent < -plan.thresholdPercent - 1e-9 ? "bear" : "base";
  const scenarios = record.forecast.scenarios;
  const expectedOutcome = [...scenarios].sort((a, b) => b.probability - a.probability)[0].id;
  const brierScore = scenarios.reduce((sum, s) => sum + (s.probability / 100 - Number(s.id === realizedOutcome)) ** 2, 0);
  if (!Number.isFinite(realizedReturnPercent) || !Number.isFinite(brierScore)) throw new Error("Invalid evaluation arithmetic");
  return { status: "resolved", evaluation: {
    version: 1, method: METHOD, forecastHash: record.forecastHash, planHash: record.planHash!,
    provider, targetBarTime: target.time, confirmedAt: nowMs, evaluationPrice: target.close,
    realizedReturnPercent, realizedOutcome, expectedOutcome, correct: expectedOutcome === realizedOutcome,
    brierScore, evidenceHash: digest({ provider, timeframe: plan.timeframe, bars: candles.slice(anchorIndex, index + 2) }),
  } };
}
