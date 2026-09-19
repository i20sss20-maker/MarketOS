import type {
  ChartAnalysisResponse,
  ChartContext,
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
