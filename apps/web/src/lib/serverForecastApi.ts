import type { AnalystForecastResponse } from "@marketos/market-core";

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export type ServerForecastRecord = {
  id: string;
  recordedAt: number;
  forecastHash: string;
  evaluationStatus: "pending";
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
    item.evaluationStatus === "pending" && !!f && f.dataMode === "provider" &&
    typeof f.engine === "string" && typeof f.dataProvider === "string" && !!f.dataProvider.trim() &&
    !/demo|sample|fallback/i.test(f.dataProvider) && typeof f.summary === "string" &&
    Number.isSafeInteger(f.generatedAt) && f.generatedAt > 0 &&
    Number.isFinite(f.referencePrice) && f.referencePrice > 0 && !!f.symbol &&
    typeof f.symbol.id === "string" && typeof f.symbol.ticker === "string" &&
    typeof f.symbol.exchange === "string" && typeof f.symbol.name === "string" &&
    Array.isArray(f.scenarios) && f.scenarios.length === 3 &&
    f.scenarios.every(s => s && typeof s === "object") &&
    new Set(f.scenarios.map(s => s.id)).size === 3 &&
    f.scenarios.every(s => ["bull", "base", "bear"].includes(s.id) &&
      Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 100) &&
    Math.abs(f.scenarios.reduce((sum, s) => sum + s.probability, 0) - 100) < 0.01;
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
    if (!existing) records.set(item.id, item);
  }
  return [...records.values()].sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 200);
}
