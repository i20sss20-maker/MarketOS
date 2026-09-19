import type { MarketEvent, MarketSymbol } from "@marketos/market-core";

function dateText(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function seed(value: string) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function createBrowserDemoEvents(
  symbols: MarketSymbol[],
  rangeDays: number,
): MarketEvent[] {
  const start = new Date();
  start.setHours(12, 0, 0, 0);

  return symbols.slice(0, 10).map((symbol, index) => {
    const offset = rangeDays <= 0 ? 0 : (seed(symbol.id) + index) % (rangeDays + 1);
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const estimate = Number((0.4 + (seed(symbol.id) % 450) / 100).toFixed(2));

    return {
      id: `browser-demo-${symbol.id}-${dateText(date)}`,
      type: "earnings",
      date: dateText(date),
      time: index % 2 === 0 ? "After Hours" : "Time Not Supplied",
      title: `${symbol.ticker} · Earnings sample`,
      symbol: symbol.ticker,
      name: symbol.name,
      exchange: symbol.exchange,
      country: symbol.country,
      currency: symbol.currency,
      epsEstimate: estimate,
      importance: index < 3 ? "high" : "medium",
      source: "browser-demo-events",
    } satisfies MarketEvent;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function localDateRange(days: number) {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + Math.max(0, days));

  return {
    startDate: dateText(start),
    endDate: dateText(end),
  };
}
