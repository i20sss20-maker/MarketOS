import { makeEvaluationPlan } from "../forecasts/evaluation.js";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { ProductionGateError, realDataRequired, assertRealProvider } from "../production/policy.js";
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import type {
  AssetClass,
  Candle,
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";
import {
  analyzeChartContext,
  sanitizeChartContext,
} from "../ai/localChartEngine.js";
import {
  buildMultiTimeframeAnalysis,
} from "../ai/multiTimeframeEngine.js";
import {
  buildAnalystForecast,
} from "../ai/analystForecastEngine.js";
import {
  buildForecastCalibration,
} from "../ai/forecastCalibration.js";
import {
  marketDataProvider,
} from "../providers/index.js";
import {
  marketEventsProvider,
} from "../events/index.js";
import {
  companyFeedProvider,
} from "../feed/index.js";
import {
  json,
  preflight,
} from "../http/responses.js";

const assetClasses =
  new Set<AssetClass>([
    "stock",
    "index",
    "etf",
    "forex",
    "future",
    "crypto",
    "commodity",
  ]);

export function sanitizeSymbol(
  value: unknown,
): MarketSymbol {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new Error(
      "Invalid market symbol.",
    );
  }

  const input =
    value as Partial<MarketSymbol>;

  if (
    typeof input.id !== "string" ||
    typeof input.ticker !== "string" ||
    typeof input.name !== "string" ||
    typeof input.exchange !== "string" ||
    typeof input.currency !== "string" ||
    typeof input.assetClass !== "string" ||
    !assetClasses.has(
      input.assetClass as AssetClass,
    )
  ) {
    throw new Error(
      "Invalid market symbol.",
    );
  }

  return {
    id: input.id.slice(0, 160),
    ticker:
      input.ticker.slice(0, 80),
    name:
      input.name.slice(0, 180),
    exchange:
      input.exchange.slice(0, 100),
    assetClass:
      input.assetClass as AssetClass,
    currency:
      input.currency.slice(0, 20),
    providerSymbol:
      typeof input.providerSymbol ===
      "string"
        ? input.providerSymbol.slice(
            0,
            100,
          )
        : undefined,
    micCode:
      typeof input.micCode ===
      "string"
        ? input.micCode.slice(0, 20)
        : undefined,
    country:
      typeof input.country ===
      "string"
        ? input.country.slice(0, 80)
        : undefined,
  };
}

function forecastTimeframes(
  symbol: MarketSymbol,
): Timeframe[] {
  if (
    symbol.assetClass === "stock" ||
    symbol.assetClass === "etf" ||
    symbol.assetClass === "index"
  ) {
    return [
      "1h",
      "4h",
      "1d",
      "1w",
    ];
  }

  return [
    "15m",
    "1h",
    "4h",
    "1d",
  ];
}

function calibrationPlan(
  symbol: MarketSymbol,
): {
  timeframe: Timeframe;
  lookaheadBars: number;
} {
  if (
    symbol.assetClass === "stock" ||
    symbol.assetClass === "etf" ||
    symbol.assetClass === "index"
  ) {
    return {
      timeframe: "1d",
      lookaheadBars: 5,
    };
  }

  return {
    timeframe: "4h",
    lookaheadBars: 6,
  };
}

function isoDate(
  date: Date,
) {
  return date
    .toISOString()
    .slice(0, 10);
}

function eventWindow() {
  const now = new Date();
  const start = new Date(
    now.getTime() -
      3 *
        24 *
        60 *
        60 *
        1000,
  );
  const end = new Date(
    now.getTime() +
      7 *
        24 *
        60 *
        60 *
        1000,
  );

  return {
    startDate: isoDate(start),
    endDate: isoDate(end),
  };
}

export async function analystForecast(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (
    request.method === "OPTIONS"
  ) {
    return preflight();
  }

  try {
    if (realDataRequired()) {
      if (!getAuthenticatedUser(request)) return json(401, { ok: false, code: "AUTH_REQUIRED", error: "Sign in to request real-data analysis." });
      assertRealProvider(marketDataProvider);
    }
    const body =
      await request.json() as {
        symbol?: unknown;
      };

    const symbol =
      sanitizeSymbol(body.symbol);
    const timeframes =
      forecastTimeframes(symbol);

    const quotePromise =
      marketDataProvider
        .getQuote(symbol)
        .catch(() => null);

    const candleResults =
      await Promise.allSettled(
        timeframes.map(
          async (timeframe) => {
            const candles =
              await marketDataProvider
                .getCandles(
                  symbol,
                  timeframe,
                  240,
                );

            const context =
              sanitizeChartContext({
                symbol,
                timeframe,
                visibleCandles:
                  candles,
                indicators: [
                  "sma20",
                  "ema20",
                  "rsi14",
                  "macd",
                  "atr14",
                ],
                userDrawings: [],
                prompt:
                  "Build probabilistic market evidence for the analyst forecast.",
              });

            return {
              timeframe,
              candles,
              analysis:
                analyzeChartContext(
                  context,
                ),
            };
          },
        ),
      );

    const analyses: Array<{
      timeframe: Timeframe;
      analysis:
        ReturnType<
          typeof analyzeChartContext
        >;
    }> = [];

    const candleHistory =
      new Map<
        Timeframe,
        Candle[]
      >();

    const failures: Array<{
      timeframe: Timeframe;
      error: string;
    }> = [];

    candleResults.forEach(
      (result, index) => {
        const timeframe =
          timeframes[index];

        if (
          result.status ===
          "fulfilled"
        ) {
          analyses.push(
            result.value,
          );
          candleHistory.set(
            timeframe,
            result.value.candles,
          );
        } else {
          failures.push({
            timeframe,
            error:
              realDataRequired()
                ? "Market data is unavailable for this timeframe."
                : result.reason instanceof
              Error
                ? result.reason
                    .message
                : "Unknown timeframe error.",
          });
        }
      },
    );

    if (analyses.length === 0) {
      return json(502, {
        ok: false,
        error:
          "No market timeframe could be analyzed.",
        failures,
      });
    }

    const multiTimeframe =
      buildMultiTimeframeAnalysis(
        symbol.ticker,
        timeframes,
        analyses,
        failures,
      );

    const quote =
      await quotePromise;

    if (realDataRequired() && (!quote || analyses.length < 2 || !candleHistory.has(calibrationPlan(symbol).timeframe))) {
      throw new ProductionGateError("INCOMPLETE_MARKET_EVIDENCE", "Real-data analysis requires a verified quote, at least two timeframes, and the calibration timeframe.", 502);
    }

    const dates =
      eventWindow();

    const [
      eventsResult,
      releasesResult,
    ] =
      await Promise.allSettled([
        marketEventsProvider.getEvents({
          ...dates,
          symbols: [
            symbol.providerSymbol ??
              symbol.ticker,
            symbol.ticker,
          ],
        }),
        (
          symbol.assetClass ===
            "stock" ||
          symbol.assetClass ===
            "etf"
            ? companyFeedProvider
                .getFeed({
                  symbols: [symbol],
                  outputSize: 4,
                })
            : Promise.resolve([])
        ),
      ]);

    const events =
      eventsResult.status ===
      "fulfilled"
        ? eventsResult.value
        : [];

    const releases =
      releasesResult.status ===
      "fulfilled"
        ? releasesResult.value
        : [];

    const status =
      marketDataProvider
        .getStatus();

    const calibrationConfig =
      calibrationPlan(symbol);
    const calibrationCandles =
      candleHistory.get(
        calibrationConfig.timeframe,
      );
    const calibration =
      calibrationCandles
        ? buildForecastCalibration({
            timeframe:
              calibrationConfig.timeframe,
            candles:
              calibrationCandles,
            lookaheadBars:
              calibrationConfig.lookaheadBars,
          })
        : null;

    const forecast =
      buildAnalystForecast({
        symbol,
        quote,
        multiTimeframe,
        events,
        releases,
        dataProvider:
          marketDataProvider.id,
        dataMode: status.mode,
        calibration,
      });

    return json(200, {
      ok: true,
      forecast,
      evaluationPlan: realDataRequired() && calibrationCandles ? makeEvaluationPlan(forecast, calibrationCandles, quote) : undefined,
      providers: {
        market:
          marketDataProvider.id,
        events:
          marketEventsProvider.id,
        feed:
          companyFeedProvider.id,
      },
    });
  } catch (error) {
    if (error instanceof ProductionGateError) return json(error.status, { ok: false, code: error.code, error: error.message });
    if (realDataRequired()) return json(502, { ok: false, code: "FORECAST_UNAVAILABLE", error: "Real market evidence could not be loaded. No demo forecast was substituted." });
    const message =
      error instanceof Error
        ? error.message
        : "Analyst forecast request failed.";

    return json(400, {
      ok: false,
      error: message,
    });
  }
}

app.http("analystForecast", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "analyst/forecast",
  handler: analystForecast,
});
