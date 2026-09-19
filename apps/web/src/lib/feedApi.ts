import type {
  CompanyFeedResult,
  MarketSymbol,
} from "@marketos/market-core";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type FeedResponse = CompanyFeedResult & {
  ok: boolean;
  requestedSymbols: number;
  error?: string;
};

export async function getCompanyFeed(
  symbols: MarketSymbol[],
  outputSize = 3,
  signal?: AbortSignal,
): Promise<CompanyFeedResult> {
  const response = await fetch(`${API_BASE_URL}/market/feed`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      symbols: symbols.slice(0, 8),
      outputSize: Math.min(Math.max(Math.floor(outputSize), 1), 10),
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as FeedResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Company feed request failed (${response.status}).`);
  }

  return {
    provider: payload.provider,
    generatedAt: payload.generatedAt,
    releases: payload.releases,
  };
}
