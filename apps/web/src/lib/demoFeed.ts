import type {
  CompanyRelease,
  MarketSymbol,
} from "@marketos/market-core";

function sampleBody(symbol: MarketSymbol) {
  return [
    `${symbol.name} (${symbol.ticker}) sample company announcement for MarketOS development.`,
    "This content is generated locally and is not a real corporate disclosure or press release.",
    "Connect a configured Company Feed provider to replace these sample items.",
  ].join(" ");
}

export function createBrowserDemoFeed(
  symbols: MarketSymbol[],
  outputSize = 2,
): CompanyRelease[] {
  const now = Date.now();
  const perSymbol = Math.min(Math.max(Math.floor(outputSize), 1), 2);

  return symbols
    .slice(0, 8)
    .flatMap((symbol, symbolIndex) =>
      Array.from({ length: perSymbol }, (_, index) => ({
        id: `browser-demo-release-${symbol.id}-${index}`,
        symbol: symbol.ticker,
        name: symbol.name,
        exchange: symbol.exchange,
        micCode: symbol.micCode,
        datetime: new Date(
          now - (symbolIndex * 5 + index + 1) * 60 * 60 * 1000,
        ).toISOString(),
        title: `${symbol.ticker} · Sample company announcement ${index + 1}`,
        bodyText: sampleBody(symbol),
        languages: ["en"],
        source: "browser-demo-company-feed",
      } satisfies CompanyRelease)),
    )
    .sort((a, b) => b.datetime.localeCompare(a.datetime));
}
