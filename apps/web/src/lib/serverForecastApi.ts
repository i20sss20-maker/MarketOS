import type { AnalystForecastResponse } from "@marketos/market-core";
import type {
  ForecastJournalRecord,
  ForecastOutcome,
} from "./forecastJournal";

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
type EvaluationPlan = {
  version: 1; method: "quote-to-future-closed-bars-v1"; provider: string; timeframe: "1d" | "4h";
  horizonBars: number; thresholdPercent: number; issuedAt: number; referenceAsOf: number;
  referencePrice: number; anchorTime: number; anchorOpen: number;
};
type ServerEvaluation = {
  version: 1; method: EvaluationPlan["method"]; forecastHash: string; planHash: string; provider: string;
  targetBarTime: number; confirmedAt: number; evaluationPrice: number; realizedReturnPercent: number;
  realizedOutcome: "bull" | "base" | "bear"; expectedOutcome: "bull" | "base" | "bear";
  correct: boolean; brierScore: number; evidenceHash: string;
};
export type ServerForecastRecord = {
  id: string;
  recordedAt: number;
  forecastHash: string;
  evaluationStatus: "pending" | "resolved";
  evaluationPlan?: EvaluationPlan;
  planHash?: string;
  evaluation?: ServerEvaluation;
  forecast: AnalystForecastResponse;
};
export type ServerForecastPage = { records: ServerForecastRecord[]; cursor?: string };
export class ForecastHistoryError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "ForecastHistoryError"; }
}

export function isServerForecastRecord(value: unknown): value is ServerForecastRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ServerForecastRecord>;
  const f = item.forecast;
  return typeof item.id === "string" && /^[a-f0-9]{64}$/.test(item.id) &&
    typeof item.forecastHash === "string" && /^[a-f0-9]{64}$/.test(item.forecastHash) &&
    typeof item.recordedAt === "number" && Number.isSafeInteger(item.recordedAt) && item.recordedAt > 0 &&
    validServerEvaluation(item) && !!f && f.dataMode === "provider" &&
    typeof f.engine === "string" && typeof f.dataProvider === "string" && !!f.dataProvider.trim() &&
    !/demo|sample|fallback/i.test(f.dataProvider) && typeof f.summary === "string" &&
    Number.isSafeInteger(f.generatedAt) && f.generatedAt > 0 &&
    Number.isFinite(f.referencePrice) && f.referencePrice > 0 &&
    Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 100 && !!f.symbol &&
    typeof f.symbol.id === "string" && typeof f.symbol.ticker === "string" &&
    typeof f.symbol.exchange === "string" && typeof f.symbol.name === "string" &&
    Array.isArray(f.scenarios) && f.scenarios.length === 3 &&
    f.scenarios.every(s => s && typeof s === "object") &&
    new Set(f.scenarios.map(s => s.id)).size === 3 &&
    f.scenarios.every(s => ["bull", "base", "bear"].includes(s.id) &&
      Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 100) &&
    Math.abs(f.scenarios.reduce((sum, s) => sum + s.probability, 0) - 100) < 0.01;
}


function validServerEvaluation(item: Partial<ServerForecastRecord>) {
  const plan = item.evaluationPlan;
  if (plan !== undefined) {
    if (!plan || plan.version !== 1 || plan.method !== "quote-to-future-closed-bars-v1" ||
        !["1d", "4h"].includes(plan.timeframe) || !Number.isInteger(plan.horizonBars) || plan.horizonBars < 1 || plan.horizonBars > 60 ||
        !Number.isFinite(plan.thresholdPercent) || plan.thresholdPercent <= 0 || plan.thresholdPercent > 100 ||
        !item.forecast || plan.referencePrice !== item.forecast.referencePrice || plan.provider !== item.forecast.dataProvider ||
        !Number.isSafeInteger(plan.issuedAt) || plan.issuedAt !== item.forecast.generatedAt ||
        !Number.isSafeInteger(plan.referenceAsOf) || plan.referenceAsOf <= 0 || plan.referenceAsOf > plan.issuedAt ||
        !Number.isSafeInteger(plan.anchorTime) || plan.anchorTime <= 0 || plan.anchorTime > plan.issuedAt ||
        !Number.isFinite(plan.anchorOpen) || plan.anchorOpen <= 0 ||
        !/^[a-f0-9]{64}$/.test(item.planHash ?? "")) return false;
  }
  if (item.evaluationStatus === "pending") return item.evaluation === undefined;
  const result = item.evaluation;
  const f = item.forecast;
  if (item.evaluationStatus !== "resolved" || !plan || !result || !f || !Array.isArray(f.scenarios) ||
      f.scenarios.length !== 3 || f.scenarios.some(s => !s || typeof s !== "object") ||
      result.version !== 1 || result.method !== plan.method || result.forecastHash !== item.forecastHash ||
      result.planHash !== item.planHash || result.provider !== plan.provider ||
      !Number.isSafeInteger(result.targetBarTime) || result.targetBarTime <= plan.issuedAt ||
      !Number.isSafeInteger(result.confirmedAt) || result.confirmedAt < (item.recordedAt ?? Infinity) ||
      result.confirmedAt > Date.now() + 300_000 || result.targetBarTime * 1000 > result.confirmedAt ||
      !Number.isFinite(result.evaluationPrice) || result.evaluationPrice <= 0 ||
      !Number.isFinite(result.realizedReturnPercent) || !Number.isFinite(result.brierScore) ||
      result.brierScore < 0 || result.brierScore > 2 || !/^[a-f0-9]{64}$/.test(result.evidenceHash)) return false;
  const change = (result.evaluationPrice / f.referencePrice - 1) * 100;
  const outcome = change > plan.thresholdPercent + 1e-9 ? "bull" : change < -plan.thresholdPercent - 1e-9 ? "bear" : "base";
  const expected = [...f.scenarios].sort((a, b) => b.probability - a.probability)[0].id;
  const brier = f.scenarios.reduce((sum, s) => sum + (s.probability / 100 - Number(s.id === outcome)) ** 2, 0);
  return result.realizedOutcome === outcome && result.expectedOutcome === expected &&
    result.correct === (outcome === expected) && Math.abs(change - result.realizedReturnPercent) < 1e-7 &&
    Math.abs(brier - result.brierScore) < 1e-7;
}

export async function listServerForecasts(signal?: AbortSignal, cursor?: string): Promise<ServerForecastPage> {
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 8192)) {
    throw new ForecastHistoryError(400, "تعذر قراءة صفحة السجل؛ حدّث القائمة.");
  }
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`${API_BASE_URL}/user/forecasts?${params}`, {
    signal, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new ForecastHistoryError(response.status, "سجّل الدخول لعرض سجل توقعات حسابك.");
  }
  if (!response.ok || payload?.ok !== true || payload?.storage !== "cosmos") {
    throw new ForecastHistoryError(response.status, "سجل الخادم غير متاح الآن. لا نعرض سجل المتصفح كبديل.");
  }
  if (!Array.isArray(payload.records) || payload.records.length > 50 ||
      !payload.records.every(isServerForecastRecord) ||
      (payload.cursor !== undefined && (typeof payload.cursor !== "string" || payload.cursor.length > 8192))) {
    throw new ForecastHistoryError(502, "وصل سجل غير صالح من الخادم. تعذر عرضه بأمان.");
  }
  return { records: payload.records, cursor: payload.cursor || undefined };
}

export function mergeServerForecastPages(current: ServerForecastRecord[], next: ServerForecastRecord[]) {
  const records = new Map(current.map(item => [item.id, item]));
  for (const item of next) {
    const existing = records.get(item.id);
    if (existing && existing.forecastHash !== item.forecastHash) {
      throw new ForecastHistoryError(409, "تغيّرت هوية تقرير محفوظ؛ حدّث السجل قبل المتابعة.");
    }
    if (existing?.evaluation && item.evaluation && JSON.stringify(existing.evaluation) !== JSON.stringify(item.evaluation)) {
      throw new ForecastHistoryError(409, "وصلت نتيجة مختلفة لتقرير محسوم؛ حدّث السجل.");
    }
    // Pending -> resolved is allowed; stale pages cannot roll a result back.
    if (!existing || (!existing.evaluation && item.evaluation)) records.set(item.id, item);
  }
  return [...records.values()].sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 200);
}

function scenarioProbabilities(
  forecast: AnalystForecastResponse,
) {
  return {
    bull:
      forecast.scenarios.find(
        (item) => item.id === "bull",
      )?.probability ?? 0,
    base:
      forecast.scenarios.find(
        (item) => item.id === "base",
      )?.probability ?? 0,
    bear:
      forecast.scenarios.find(
        (item) => item.id === "bear",
      )?.probability ?? 0,
  };
}

function topScenario(
  forecast: AnalystForecastResponse,
) {
  return [...forecast.scenarios].sort(
    (a, b) =>
      b.probability -
      a.probability,
  )[0];
}

function plannedDueAt(
  record: ServerForecastRecord,
) {
  if (record.evaluation) {
    return record.evaluation
      .targetBarTime;
  }

  if (!record.evaluationPlan) {
    return record.forecast
      .generatedAt;
  }

  const seconds =
    record.evaluationPlan
      .timeframe === "1d"
      ? 24 * 60 * 60
      : 4 * 60 * 60;

  return (
    record.evaluationPlan
      .issuedAt +
    (
      record.evaluationPlan
        .horizonBars *
      seconds
    )
  );
}

export function serverForecastToJournalRecord(
  record: ServerForecastRecord,
): ForecastJournalRecord {
  const forecast =
    record.forecast;
  const expected =
    topScenario(forecast);
  const evaluation =
    record.evaluation;
  const dueAt =
    plannedDueAt(record);
  const evaluatedAt =
    evaluation
      ? Math.floor(
          evaluation.confirmedAt /
            1000,
        )
      : undefined;

  return {
    id: record.id,
    symbolId:
      forecast.symbol.id,
    ticker:
      forecast.symbol.ticker,
    symbol:
      forecast.symbol,
    engine:
      forecast.engine,
    generatedAt:
      forecast.generatedAt,
    dueAt,
    evaluationTimeframe:
      record.evaluationPlan
        ?.timeframe,
    evaluationBars:
      record.evaluationPlan
        ?.horizonBars,
    referencePrice:
      forecast.referencePrice,
    confidence:
      forecast.confidence,
    dataMode: "provider",
    expectedOutcome:
      expected.id as ForecastOutcome,
    expectedProbability:
      expected.probability,
    probabilities:
      scenarioProbabilities(
        forecast,
      ),
    thresholdPercent:
      record.evaluationPlan
        ?.thresholdPercent ??
      forecast.calibration
        ?.outcomeThresholdPercent ??
      1,
    status:
      evaluation
        ? "resolved"
        : "pending",
    evaluatedAt,
    evaluationPrice:
      evaluation
        ?.evaluationPrice,
    evaluationMethod:
      evaluation
        ? "horizon-bars"
        : undefined,
    evaluationDelaySeconds:
      evaluation &&
      evaluatedAt !==
        undefined
        ? Math.max(
            0,
            evaluatedAt -
              dueAt,
          )
        : undefined,
    realizedReturnPercent:
      evaluation
        ?.realizedReturnPercent,
    realizedOutcome:
      evaluation
        ?.realizedOutcome,
    correct:
      evaluation
        ?.correct,
  };
}

export function serverForecastsToJournalRecords(
  records: ServerForecastRecord[],
) {
  return records
    .map(
      serverForecastToJournalRecord,
    )
    .sort(
      (a, b) =>
        b.generatedAt -
        a.generatedAt,
    );
}

export async function listAllServerForecasts(
  signal?: AbortSignal,
  maxRecords = 200,
) {
  if (
    !Number.isInteger(
      maxRecords,
    ) ||
    maxRecords < 1 ||
    maxRecords > 200
  ) {
    throw new ForecastHistoryError(
      400,
      "حد سجل الخادم غير صالح.",
    );
  }

  let records:
    ServerForecastRecord[] = [];
  let cursor:
    string | undefined;
  const seen =
    new Set<string>();

  while (
    records.length <
    maxRecords
  ) {
    const page =
      await listServerForecasts(
        signal,
        cursor,
      );

    records =
      mergeServerForecastPages(
        records,
        page.records,
      );

    if (
      !page.cursor ||
      page.cursor ===
        cursor ||
      seen.has(
        page.cursor,
      )
    ) {
      break;
    }

    seen.add(
      page.cursor,
    );
    cursor =
      page.cursor;
  }

  return records.slice(
    0,
    maxRecords,
  );
}

