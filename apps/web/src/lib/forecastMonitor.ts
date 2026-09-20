import type {
  MarketDataStatus,
} from "@marketos/market-core";
import {
  getMarketCandles,
  getMarketQuote,
  getMarketStatus,
} from "./marketApi";
import {
  maturedForecastGroups,
  maturedForecastSymbols,
  resolveForecastJournalWithCandles,
  resolveForecastJournalWithPrice,
  type ForecastJournalRecord,
} from "./forecastJournal";

export type ForecastMonitorFailure = {
  symbolId: string;
  ticker: string;
  error: string;
  timeframe?: string;
};

export type ForecastMonitorResult = {
  records:
    ForecastJournalRecord[];
  status:
    MarketDataStatus;
  checkedSymbols: number;
  checkedGroups: number;
  resolvedRecords: number;
  resolvedByCandles: number;
  resolvedByLegacyQuote: number;
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
  const groups =
    maturedForecastGroups(
      current,
      now,
      status.mode,
    ).slice(0, 12);

  let records =
    current;
  let resolvedByCandles = 0;
  let resolvedByLegacyQuote = 0;
  const failures:
    ForecastMonitorFailure[] = [];
  const checkedSymbolIds =
    new Set<string>();

  for (const group of groups) {
    try {
      checkedSymbolIds.add(
        group.symbol.id,
      );

      const response =
        await getMarketCandles(
          group.symbol,
          group.timeframe,
          320,
          signal,
        );

      const before =
        records.filter(
          (record) =>
            record.symbolId ===
              group.symbol.id &&
            record.status ===
              "pending" &&
            record.evaluationTimeframe ===
              group.timeframe,
        ).length;

      records =
        resolveForecastJournalWithCandles(
          records,
          {
            symbolId:
              group.symbol.id,
            timeframe:
              group.timeframe,
            candles:
              response.candles,
            dataMode:
              status.mode,
          },
        );

      const after =
        records.filter(
          (record) =>
            record.symbolId ===
              group.symbol.id &&
            record.status ===
              "pending" &&
            record.evaluationTimeframe ===
              group.timeframe,
        ).length;

      resolvedByCandles +=
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
          group.symbol.id,
        ticker:
          group.symbol.ticker,
        timeframe:
          group.timeframe,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحديث شموع الأفق.",
      });
    }
  }

  const legacySymbols =
    maturedForecastSymbols(
      records,
      now,
      status.mode,
    ).slice(
      0,
      Math.max(
        0,
        12 - groups.length,
      ),
    );

  for (
    const symbol
    of legacySymbols
  ) {
    try {
      checkedSymbolIds.add(
        symbol.id,
      );

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
              "pending" &&
            !record.evaluationTimeframe,
        ).length;

      records =
        resolveForecastJournalWithPrice(
          records,
          {
            symbolId:
              symbol.id,
            price:
              response.quote
                .price,
            timestamp:
              response.quote
                .timestamp,
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
              "pending" &&
            !record.evaluationTimeframe,
        ).length;

      resolvedByLegacyQuote +=
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
            : "تعذر تحديث السعر للسجل القديم.",
      });
    }
  }

  return {
    records,
    status,
    checkedSymbols:
      checkedSymbolIds.size,
    checkedGroups:
      groups.length,
    resolvedRecords:
      resolvedByCandles +
      resolvedByLegacyQuote,
    resolvedByCandles,
    resolvedByLegacyQuote,
    failures,
  };
}
