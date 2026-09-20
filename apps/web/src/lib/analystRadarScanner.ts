import type {
  AnalystForecastResponse,
  MarketSymbol,
} from "@marketos/market-core";
import {
  getAnalystForecast,
} from "./aiApi";
import {
  buildAnalystRadarItem,
  rankAnalystRadar,
  type AnalystRadarFailure,
  type AnalystRadarItem,
} from "./analystRadar";

export type AnalystRadarScanProgress = {
  done: number;
  total: number;
  items: AnalystRadarItem[];
  failures:
    AnalystRadarFailure[];
};

export type AnalystRadarScanResult = {
  items: AnalystRadarItem[];
  failures:
    AnalystRadarFailure[];
  scannedAt: number;
};

export type AnalystForecastLoader = (
  symbol: MarketSymbol,
  signal?: AbortSignal,
) => Promise<
  AnalystForecastResponse
>;

export async function scanAnalystRadar(
  symbols: MarketSymbol[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (
      progress:
        AnalystRadarScanProgress,
    ) => void;
    forecastLoader?:
      AnalystForecastLoader;
  },
): Promise<
  AnalystRadarScanResult
> {
  const candidates =
    symbols.slice(0, 8);
  const items:
    AnalystRadarItem[] = [];
  const failures:
    AnalystRadarFailure[] = [];
  const loader =
    options?.forecastLoader ??
    getAnalystForecast;

  options?.onProgress?.({
    done: 0,
    total:
      candidates.length,
    items: [],
    failures: [],
  });

  for (
    let index = 0;
    index <
    candidates.length;
    index += 1
  ) {
    if (
      options?.signal
        ?.aborted
    ) {
      throw new DOMException(
        "Radar scan aborted.",
        "AbortError",
      );
    }

    const symbol =
      candidates[index];

    try {
      const forecast =
        await loader(
          symbol,
          options?.signal,
        );

      items.push(
        buildAnalystRadarItem(
          symbol,
          forecast,
        ),
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
        symbol,
        error:
          error instanceof Error
            ? error.message
            : "تعذر التحليل.",
      });
    }

    options?.onProgress?.({
      done: index + 1,
      total:
        candidates.length,
      items:
        rankAnalystRadar(
          [...items],
        ),
      failures:
        [...failures],
    });
  }

  return {
    items:
      rankAnalystRadar(
        items,
      ),
    failures,
    scannedAt:
      Date.now(),
  };
}
