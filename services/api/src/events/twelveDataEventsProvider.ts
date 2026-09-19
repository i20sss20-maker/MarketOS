import type { MarketEvent } from "@marketos/market-core";
import type { MarketEventsProvider, MarketEventsQuery } from "./types.js";

const API_BASE_URL = "https://api.twelvedata.com";
const CACHE_TTL_MS = 10 * 60 * 1000;

type ApiError = {
  status?: string;
  code?: number;
  message?: string;
};

type EarningsCalendarItem = {
  symbol?: string;
  name?: string;
  currency?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  time?: string;
  eps_estimate?: number | string | null;
  eps_actual?: number | string | null;
  difference?: number | string | null;
  surprise_prc?: number | string | null;
};

type EarningsCalendarResponse = ApiError & {
  earnings?: Record<string, EarningsCalendarItem[]>;
};

type CacheEntry = {
  expiresAt: number;
  events: MarketEvent[];
};

function numberOrUndefined(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedSymbol(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export class TwelveDataEventsProvider implements MarketEventsProvider {
  readonly id = "twelvedata-events";
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly apiKey: string) {}

  private async loadCalendar(startDate: string, endDate: string): Promise<MarketEvent[]> {
    const key = `${startDate}:${endDate}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.events;

    const url = new URL("/earnings_calendar", API_BASE_URL);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("apikey", this.apiKey);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MarketOS/0.1",
      },
    });

    let payload: EarningsCalendarResponse;
    try {
      payload = await response.json() as EarningsCalendarResponse;
    } catch {
      throw new Error(`Market events provider returned an invalid response (${response.status}).`);
    }

    if (!response.ok || payload.status === "error") {
      throw new Error(payload.message ?? `Market events provider request failed (${response.status}).`);
    }

    const events: MarketEvent[] = [];
    for (const [date, items] of Object.entries(payload.earnings ?? {})) {
      for (const item of items) {
        if (!item.symbol) continue;

        events.push({
          id: `earnings-${item.mic_code || item.exchange || "market"}-${item.symbol}-${date}`,
          type: "earnings",
          date,
          time: item.time || undefined,
          title: `${item.symbol} · Earnings`,
          symbol: item.symbol,
          name: item.name,
          exchange: item.exchange,
          micCode: item.mic_code,
          country: item.country,
          currency: item.currency,
          epsEstimate: numberOrUndefined(item.eps_estimate),
          epsActual: numberOrUndefined(item.eps_actual),
          surprisePercent: numberOrUndefined(item.surprise_prc),
          importance: "medium",
          source: this.id,
        });
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || (a.symbol ?? "").localeCompare(b.symbol ?? ""));
    this.cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      events,
    });
    return events;
  }

  async getEvents(query: MarketEventsQuery): Promise<MarketEvent[]> {
    const events = await this.loadCalendar(query.startDate, query.endDate);
    const requestedSymbols = new Set(
      (query.symbols ?? []).map(normalizedSymbol),
    );

    if (requestedSymbols.size === 0) return events;

    return events.filter((event) =>
      event.symbol ? requestedSymbols.has(normalizedSymbol(event.symbol)) : false,
    );
  }
}
