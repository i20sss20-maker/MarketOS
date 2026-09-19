import type { CompanyRelease } from "@marketos/market-core";
import type { CompanyFeedProvider, CompanyFeedQuery } from "./types.js";

function sampleBody(symbol: string, name: string) {
  return `${name} (${symbol}) sample company release for MarketOS development. This content is generated locally and is not a real corporate announcement.`;
}

export class DemoFeedProvider implements CompanyFeedProvider {
  readonly id = "demo-company-feed";

  async getFeed(query: CompanyFeedQuery): Promise<CompanyRelease[]> {
    const now = Date.now();
    const outputSize = Math.min(Math.max(query.outputSize ?? 3, 1), 10);

    return query.symbols
      .slice(0, 8)
      .flatMap((symbol, symbolIndex) =>
        Array.from({ length: Math.min(outputSize, 2) }, (_, index) => {
          const timestamp = new Date(
            now - (symbolIndex * 7 + index + 1) * 60 * 60 * 1000,
          );

          return {
            id: `demo-release-${symbol.id}-${index}`,
            symbol: symbol.ticker,
            name: symbol.name,
            exchange: symbol.exchange,
            micCode: symbol.micCode,
            datetime: timestamp.toISOString(),
            title: `${symbol.ticker} · Sample company announcement ${index + 1}`,
            bodyText: sampleBody(symbol.ticker, symbol.name),
            languages: ["en"],
            source: this.id,
          } satisfies CompanyRelease;
        }),
      )
      .sort((a, b) => b.datetime.localeCompare(a.datetime));
  }
}
