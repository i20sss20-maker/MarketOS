import type { CompanyRelease, MarketSymbol } from "@marketos/market-core";
import { AsyncTtlCache } from "../providers/providerCache.js";
import type { CompanyFeedProvider, CompanyFeedQuery } from "./types.js";

const API_BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;

type ApiError = {
  status?: string;
  code?: number;
  message?: string;
};

type PressReleaseItem = {
  id?: string;
  datetime?: string;
  title?: string;
  body?: string;
  style?: string;
  language?: string[];
};

type PressReleaseResponse = ApiError & {
  press_releases?: PressReleaseItem[];
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12_000);
}

function cacheKey(symbol: MarketSymbol, outputSize: number) {
  return [
    symbol.providerSymbol ?? symbol.ticker,
    symbol.micCode ?? "",
    symbol.exchange ?? "",
    outputSize,
  ].join("|").toUpperCase();
}

export class TwelveDataFeedProvider implements CompanyFeedProvider {
  readonly id = "twelvedata-press-releases";
  private readonly cache = new AsyncTtlCache<CompanyRelease[]>(120);

  constructor(private readonly apiKey: string) {}

  private async loadSymbol(
    symbol: MarketSymbol,
    outputSize: number,
  ): Promise<CompanyRelease[]> {
    const key = cacheKey(symbol, outputSize);

    return this.cache.getOrLoad(key, CACHE_TTL_MS, async () => {
      const url = new URL("/press_releases", API_BASE_URL);
      url.searchParams.set("symbol", symbol.providerSymbol ?? symbol.ticker);
      if (symbol.micCode) url.searchParams.set("mic_code", symbol.micCode);
      else if (symbol.exchange) url.searchParams.set("exchange", symbol.exchange);
      url.searchParams.set("outputsize", String(outputSize));
      url.searchParams.set("page", "1");
      url.searchParams.set("apikey", this.apiKey);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "MarketOS/0.3",
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error("Company feed provider request timed out.");
        }
        throw error;
      }

      let payload: PressReleaseResponse;
      try {
        payload = await response.json() as PressReleaseResponse;
      } catch {
        throw new Error(
          `Company feed provider returned an invalid response (${response.status}).`,
        );
      }

      if (!response.ok || payload.status === "error") {
        throw new Error(
          payload.message ??
            `Company feed provider request failed (${response.status}).`,
        );
      }

      return (payload.press_releases ?? []).flatMap((item) => {
        if (!item.id || !item.datetime || !item.title) return [];

        return [{
          id: item.id,
          symbol: symbol.ticker,
          name: symbol.name,
          exchange: symbol.exchange,
          micCode: symbol.micCode,
          datetime: item.datetime,
          title: item.title.trim().slice(0, 500),
          bodyText: htmlToText(item.body ?? ""),
          languages: Array.isArray(item.language)
            ? item.language.filter((value): value is string => typeof value === "string").slice(0, 8)
            : [],
          source: this.id,
        } satisfies CompanyRelease];
      });
    });
  }

  async getFeed(query: CompanyFeedQuery): Promise<CompanyRelease[]> {
    const outputSize = Math.min(Math.max(query.outputSize ?? 3, 1), 10);
    const symbols = query.symbols.slice(0, 8);

    const settled = await Promise.allSettled(
      symbols.map((symbol) => this.loadSymbol(symbol, outputSize)),
    );

    return settled
      .flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .sort((a, b) => b.datetime.localeCompare(a.datetime));
  }
}
