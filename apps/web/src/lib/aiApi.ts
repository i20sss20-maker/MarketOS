import { isServerForecastRecord } from "./serverForecastApi";
import {
  recordForecastUsage,
} from "./forecastUsage";
import type {
  AnalystForecastResponse,
  ChartAnalysisResponse,
  ChartContext,
  MarketSymbol,
  MultiTimeframeAnalysisResponse,
  Timeframe,
} from "@marketos/market-core";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type ChartAnalyzeResponse = {
  ok: boolean;
  analysis: ChartAnalysisResponse;
  error?: string;
};

export async function analyzeChart(
  context: ChartContext,
  signal?: AbortSignal,
): Promise<ChartAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/chart-analyze`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(context),
    signal,
  });

  const payload = await response.json().catch(() => null) as ChartAnalyzeResponse | null;
  if (!response.ok || !payload?.ok || !payload.analysis) {
    throw new Error(payload?.error || `Chart analysis request failed (${response.status}).`);
  }

  return payload.analysis;
}

type MultiTimeframeResponse = {
  ok: boolean;
  provider?: string;
  analysis?: MultiTimeframeAnalysisResponse;
  error?: string;
};

export async function analyzeMultipleTimeframes(
  symbol: MarketSymbol,
  timeframes: Timeframe[],
  indicators: string[],
  prompt?: string,
  signal?: AbortSignal,
): Promise<MultiTimeframeAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/multi-timeframe`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      symbol,
      timeframes: timeframes.slice(0, 4),
      indicators: indicators.slice(0, 20),
      prompt,
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as MultiTimeframeResponse | null;
  if (!response.ok || !payload?.ok || !payload.analysis) {
    throw new Error(payload?.error || `Multi-timeframe analysis failed (${response.status}).`);
  }

  return payload.analysis;
}

type AnalystForecastApiResponse = {
  ok: boolean;
  forecast?: AnalystForecastResponse;
  journal?: unknown;
  usage?: unknown;
  error?: string;
};

export async function getAnalystForecast(
  symbol: MarketSymbol,
  signal?: AbortSignal,
): Promise<AnalystForecastResponse> {
  const response = await fetch(
    `${API_BASE_URL}${import.meta.env.VITE_MARKETOS_REQUIRE_REAL_DATA === "true" ? "/user/forecasts" : "/analyst/forecast"}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        symbol,
        ...(import.meta.env.VITE_MARKETOS_REQUIRE_REAL_DATA === "true"
          ? { requestId: crypto.randomUUID() }
          : {}),
      }),
      signal,
    },
  );

  const payload =
    await response
      .json()
      .catch(() => null) as
      AnalystForecastApiResponse |
      null;

  if (
    import.meta.env?.VITE_MARKETOS_REQUIRE_REAL_DATA === "true" &&
    payload?.usage
  ) {
    recordForecastUsage(
      payload.usage,
    );
  }

  if (
    !response.ok ||
    !payload?.ok ||
    !payload.forecast
  ) {
    throw new Error(
      payload?.error ??
      `Analyst forecast failed (${response.status}).`,
    );
  }

  if (import.meta.env?.VITE_MARKETOS_REQUIRE_REAL_DATA === "true") {
    if (!isServerForecastRecord(payload.journal) || payload.journal.forecast.symbol.id !== symbol.id ||
        payload.forecast.dataMode !== "provider" || payload.forecast.dataProvider !== payload.journal.forecast.dataProvider ||
        payload.forecast.generatedAt !== payload.journal.forecast.generatedAt) {
      throw new Error("لم يؤكد الخادم حفظ تقرير حقيقي صالح؛ لم يتم اعتماده كتوقع محفوظ.");
    }
    return payload.journal.forecast;
  }
  return payload.forecast;
}
