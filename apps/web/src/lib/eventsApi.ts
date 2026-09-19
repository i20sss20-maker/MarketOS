import type { MarketEvent, MarketEventsResult } from "@marketos/market-core";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type EventsResponse = {
  ok: boolean;
  provider: string;
  generatedAt: number;
  startDate: string;
  endDate: string;
  events: MarketEvent[];
  error?: string;
};

export async function getMarketEvents(
  startDate: string,
  endDate: string,
  symbols: string[],
  signal?: AbortSignal,
): Promise<MarketEventsResult> {
  const response = await fetch(`${API_BASE_URL}/market/events`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      symbols: symbols.slice(0, 50),
    }),
    signal,
  });

  const payload = await response.json().catch(() => null) as EventsResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Market events request failed (${response.status}).`);
  }

  return {
    provider: payload.provider,
    generatedAt: payload.generatedAt,
    startDate: payload.startDate,
    endDate: payload.endDate,
    events: payload.events,
  };
}
