import type { MarketEvent } from "@marketos/market-core";
import type { MarketEventsProvider, MarketEventsQuery } from "./types.js";

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function seed(text: string) {
  return [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export class DemoEventsProvider implements MarketEventsProvider {
  readonly id = "demo-events";

  async getEvents(query: MarketEventsQuery): Promise<MarketEvent[]> {
    const rangeDays = daysBetween(query.startDate, query.endDate);
    const symbols = query.symbols?.length
      ? query.symbols.slice(0, 20)
      : ["AAPL", "NVDA", "2222", "1120"];

    return symbols.slice(0, 10).map((symbol, index) => {
      const offset = rangeDays === 0 ? 0 : (seed(symbol) + index) % (rangeDays + 1);
      const estimate = Number((0.5 + (seed(symbol) % 500) / 100).toFixed(2));

      return {
        id: `demo-earnings-${symbol}-${query.startDate}-${offset}`,
        type: "earnings",
        date: addDays(query.startDate, offset),
        time: index % 2 === 0 ? "After Hours" : "Time Not Supplied",
        title: `${symbol} · Earnings sample`,
        symbol,
        name: `${symbol} demo company`,
        epsEstimate: estimate,
        importance: index < 3 ? "high" : "medium",
        source: this.id,
      } satisfies MarketEvent;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
}
