import type { MarketEvent } from "@marketos/market-core";

export type MarketEventsQuery = {
  startDate: string;
  endDate: string;
  symbols?: string[];
};

export interface MarketEventsProvider {
  readonly id: string;
  getEvents(query: MarketEventsQuery): Promise<MarketEvent[]>;
}
