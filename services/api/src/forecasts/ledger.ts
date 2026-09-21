import { digest, validEvaluationPlan, type EvaluationPlan, type ForecastEvaluation } from "./evaluation.js";
import { createHash } from "node:crypto";
import type { AnalystForecastResponse, MarketSymbol } from "@marketos/market-core";
import type { AuthenticatedUser } from "../auth/clientPrincipal.js";
import { ProductionGateError } from "../production/policy.js";

export type ForecastRecord = {
  id: string;
  userId: string;
  kind: "marketos-forecast-v1";
  requestSymbolHash: string;
  recordedAt: number;
  forecastHash: string;
  forecast: AnalystForecastResponse;
  evaluationPlan?: EvaluationPlan;
  planHash?: string;
  evaluation?: ForecastEvaluation;
  _etag?: string;
};

export interface ForecastLedger {
  find(userId: string, id: string): Promise<ForecastRecord | null>;
  create(record: ForecastRecord): Promise<ForecastRecord>;
  list(userId: string, limit: number, cursor?: string): Promise<{ records: ForecastRecord[]; cursor?: string }>;
  deleteUserData(userId: string): Promise<{ deleted: number }>;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const ownerKey = (user: AuthenticatedUser) => hash(`${user.identityProvider}:${user.userId}`);
export const forecastRecordId = (owner: string, requestId: string) => hash(`${owner}:${requestId}`);
export function symbolHash(symbol: MarketSymbol) {
  return hash(JSON.stringify([symbol.id, symbol.ticker, symbol.exchange, symbol.assetClass,
    symbol.currency, symbol.providerSymbol ?? null, symbol.micCode ?? null, symbol.country ?? null]));
}

export function assertSameRequest(record: ForecastRecord, owner: string, symbol: MarketSymbol) {
  if (record.userId !== owner || record.requestSymbolHash !== symbolHash(symbol)) {
    throw new ProductionGateError("REQUEST_ID_CONFLICT", "This request ID was already used for another instrument.", 409);
  }
}

export function createForecastRecord(owner: string, id: string, forecast: AnalystForecastResponse, recordedAt = Date.now(), plan?: EvaluationPlan): ForecastRecord {
  const outcomes = new Set(forecast.scenarios.map(item => item.id));
  const probabilities = forecast.scenarios.map(item => item.probability);
  if (forecast.dataMode !== "provider" || !forecast.dataProvider || /demo/i.test(forecast.dataProvider) ||
      !Number.isFinite(forecast.referencePrice) || forecast.referencePrice <= 0 ||
      !Number.isSafeInteger(forecast.generatedAt) || forecast.generatedAt <= 0 || forecast.generatedAt > recordedAt / 1000 + 300 ||
      !forecast.engine?.trim() || forecast.scenarios.length !== 3 || outcomes.size !== 3 ||
      !["bull", "base", "bear"].every(item => outcomes.has(item as "bull" | "base" | "bear")) ||
      probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 100) ||
      Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 100) > 0.01) {
    throw new ProductionGateError("INVALID_FORECAST", "The generated forecast could not be recorded as a real-data forecast.", 502);
  }
  if (plan && !validEvaluationPlan(plan, forecast)) throw new ProductionGateError("INVALID_EVALUATION_PLAN", "Invalid fixed forecast evaluation policy.", 502);
  const serialized = JSON.stringify(forecast);
  if (Buffer.byteLength(serialized, "utf8") > 256_000) {
    throw new ProductionGateError("FORECAST_TOO_LARGE", "The generated forecast exceeded the journal size limit.", 502);
  }
  return { id, userId: owner, kind: "marketos-forecast-v1", requestSymbolHash: symbolHash(forecast.symbol),
    recordedAt, forecastHash: hash(serialized), forecast: JSON.parse(serialized) as AnalystForecastResponse,
    ...(plan ? { evaluationPlan: structuredClone(plan), planHash: digest(plan) } : {}) };
}

// Identity never comes from the browser body. The complete forecast is server-generated.
export function publicForecastRecord(record: ForecastRecord) {
  return { id: record.id, recordedAt: record.recordedAt, forecastHash: record.forecastHash,
    evaluationStatus: record.evaluation ? "resolved" as const : "pending" as const,
    evaluation: record.evaluation, evaluationPlan: record.evaluationPlan, planHash: record.planHash, forecast: record.forecast };
}
