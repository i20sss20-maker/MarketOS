import type {
  MarketDataStatus,
} from "@marketos/market-core";
import {
  getMarketQuote,
  getMarketStatus,
} from "./marketApi";
import {
  maturedForecastSymbols,
  resolveForecastJournalWithPrice,
  type ForecastJournalRecord,
} from "./forecastJournal";

export type ForecastMonitorFailure = {
  symbolId: string;
  ticker: string;
  error: string;
};

export type ForecastMonitorResult = {
  records:
    ForecastJournalRecord[];
  status:
    MarketDataStatus;
  checkedSymbols: number;
  resolvedRecords: number;
  failures:
    ForecastMonitorFailure[];
};

export async function refreshMaturedForecasts(
  current:
    ForecastJournalRecord[],
  signal?: AbortSignal,
): Promise<ForecastMonitorResult> {
  const status =
    await getMarketStatus(
      signal,
    );
  const now =
    Math.floor(
      Date.now() / 1000,
    );
  const symbols =
    maturedForecastSymbols(
      current,
      now,
      status.mode,
    ).slice(0, 12);

  let records =
    current;
  let resolvedRecords = 0;
  const failures:
    ForecastMonitorFailure[] = [];

  for (const symbol of symbols) {
    try {
      const response =
        await getMarketQuote(
          symbol,
          signal,
        );
      const before =
        records.filter(
          (record) =>
            record.symbolId ===
              symbol.id &&
            record.status ===
              "pending",
        ).length;

      const timestamp =
        Math.max(
          now,
          response.quote
            .timestamp,
        );

      records =
        resolveForecastJournalWithPrice(
          records,
          {
            symbolId:
              symbol.id,
            price:
              response.quote
                .price,
            timestamp,
            dataMode:
              status.mode,
          },
        );

      const after =
        records.filter(
          (record) =>
            record.symbolId ===
              symbol.id &&
            record.status ===
              "pending",
        ).length;

      resolvedRecords +=
        Math.max(
          0,
          before - after,
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name ===
          "AbortError"
      ) {
        throw error;
      }

      failures.push({
        symbolId:
          symbol.id,
        ticker:
          symbol.ticker,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحديث السعر.",
      });
    }
  }

  return {
    records,
    status,
    checkedSymbols:
      symbols.length,
    resolvedRecords,
    failures,
  };
}
