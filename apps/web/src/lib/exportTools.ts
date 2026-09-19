import type {
  Candle,
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";
import type { ChartView } from "../components/MarketChart";

export type SharedChartState = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  chartView: ChartView;
};

const assetClasses = new Set([
  "stock",
  "index",
  "etf",
  "forex",
  "future",
  "crypto",
  "commodity",
]);

const timeframes = new Set<Timeframe>([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
]);

const chartViews = new Set<ChartView>([
  "candles",
  "line",
  "area",
]);

function safeText(
  value: unknown,
  maxLength: number,
) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength
    ? value
    : null;
}

function parseSymbol(
  value: unknown,
): MarketSymbol | null {
  if (!value || typeof value !== "object") return null;
  const symbol = value as Partial<MarketSymbol>;

  const id = safeText(symbol.id, 180);
  const ticker = safeText(symbol.ticker, 80);
  const name = safeText(symbol.name, 240);
  const exchange = safeText(symbol.exchange, 120);
  const currency = safeText(symbol.currency, 12);
  const assetClass =
    typeof symbol.assetClass === "string" &&
    assetClasses.has(symbol.assetClass)
      ? symbol.assetClass as MarketSymbol["assetClass"]
      : null;

  if (
    !id ||
    !ticker ||
    !name ||
    !exchange ||
    !currency ||
    !assetClass
  ) {
    return null;
  }

  return {
    id,
    ticker,
    name,
    exchange,
    currency,
    assetClass,
    ...(safeText(symbol.providerSymbol, 120)
      ? { providerSymbol: symbol.providerSymbol }
      : {}),
    ...(safeText(symbol.micCode, 20)
      ? { micCode: symbol.micCode }
      : {}),
    ...(safeText(symbol.country, 120)
      ? { country: symbol.country }
      : {}),
  };
}

export function buildMarketShareUrl(
  baseUrl: string,
  state: SharedChartState,
) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";

  url.searchParams.set(
    "marketos-share",
    "1",
  );
  url.searchParams.set(
    "symbol",
    JSON.stringify(state.symbol),
  );
  url.searchParams.set(
    "tf",
    state.timeframe,
  );
  url.searchParams.set(
    "view",
    state.chartView,
  );

  return url.toString();
}

export function parseMarketShareState(
  search: string,
): SharedChartState | null {
  const params = new URLSearchParams(search);

  if (
    params.get("marketos-share") !== "1"
  ) {
    return null;
  }

  const rawSymbol = params.get("symbol");
  const timeframe = params.get("tf");
  const chartView = params.get("view");

  if (
    !rawSymbol ||
    rawSymbol.length > 2000 ||
    !timeframe ||
    !timeframes.has(timeframe as Timeframe) ||
    !chartView ||
    !chartViews.has(chartView as ChartView)
  ) {
    return null;
  }

  try {
    const symbol = parseSymbol(
      JSON.parse(rawSymbol),
    );
    if (!symbol) return null;

    return {
      symbol,
      timeframe: timeframe as Timeframe,
      chartView: chartView as ChartView,
    };
  } catch {
    return null;
  }
}

export function candlesToCsv(
  candles: Candle[],
) {
  const rows = [
    [
      "time",
      "open",
      "high",
      "low",
      "close",
      "volume",
    ].join(","),
  ];

  for (const candle of candles) {
    const time = Number.isFinite(candle.time)
      ? new Date(candle.time * 1000)
          .toISOString()
      : "";

    rows.push([
      time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume ?? "",
    ].join(","));
  }

  return rows.join("\n");
}

export function exportFilename(
  ticker: string,
  timeframe: Timeframe,
  extension: "png" | "csv",
) {
  const safeTicker = ticker
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "chart";

  const date = new Date()
    .toISOString()
    .slice(0, 10);

  return `MarketOS-${safeTicker}-${timeframe}-${date}.${extension}`;
}
