import type { CompanyRelease, MarketSymbol } from "@marketos/market-core";

export type CompanyFeedQuery = {
  symbols: MarketSymbol[];
  outputSize?: number;
};

export interface CompanyFeedProvider {
  readonly id: string;
  getFeed(query: CompanyFeedQuery): Promise<CompanyRelease[]>;
}
