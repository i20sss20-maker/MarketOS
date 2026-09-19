import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import type { AssetClass, MarketSymbol, Timeframe } from "@marketos/market-core";
import { analyzeChartContext, sanitizeChartContext } from "../ai/localChartEngine.js";
import { buildMultiTimeframeAnalysis } from "../ai/multiTimeframeEngine.js";
import { json, preflight } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";

const allowedTimeframes = new Set<Timeframe>([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
]);

const allowedAssetClasses = new Set<AssetClass>([
  "stock",
  "index",
  "etf",
  "forex",
  "future",
  "crypto",
  "commodity",
]);

const defaultTimeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];

function sanitizeSymbol(value: unknown): MarketSymbol {
  if (!value || typeof value !== "object") throw new Error("Invalid market symbol.");
  const input = value as Partial<MarketSymbol>;

  if (
    typeof input.id !== "string" ||
    typeof input.ticker !== "string" ||
    typeof input.name !== "string" ||
    typeof input.exchange !== "string" ||
    typeof input.currency !== "string" ||
    typeof input.assetClass !== "string" ||
    !allowedAssetClasses.has(input.assetClass as AssetClass)
  ) {
    throw new Error("Invalid market symbol.");
  }

  return {
    id: input.id.slice(0, 160),
    ticker: input.ticker.slice(0, 80),
    name: input.name.slice(0, 180),
    exchange: input.exchange.slice(0, 100),
    assetClass: input.assetClass as AssetClass,
    currency: input.currency.slice(0, 20),
    providerSymbol: typeof input.providerSymbol === "string" ? input.providerSymbol.slice(0, 100) : undefined,
    micCode: typeof input.micCode === "string" ? input.micCode.slice(0, 20) : undefined,
    country: typeof input.country === "string" ? input.country.slice(0, 80) : undefined,
  };
}

function sanitizeTimeframes(value: unknown): Timeframe[] {
  const source = Array.isArray(value) ? value : defaultTimeframes;
  const output: Timeframe[] = [];

  for (const item of source) {
    if (typeof item !== "string") continue;
    if (!allowedTimeframes.has(item as Timeframe)) continue;
    if (output.includes(item as Timeframe)) continue;
    output.push(item as Timeframe);
    if (output.length >= 4) break;
  }

  return output.length > 0 ? output : defaultTimeframes;
}

function sanitizeIndicators(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, 20)
        .map((item) => item.slice(0, 60))
    : [];
}

export async function multiTimeframeAnalyze(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  try {
    const body = await request.json() as Record<string, unknown>;
    const symbol = sanitizeSymbol(body.symbol);
    const timeframes = sanitizeTimeframes(body.timeframes);
    const indicators = sanitizeIndicators(body.indicators);
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1200) : undefined;

    const quote = await marketDataProvider.getQuote(symbol).catch(() => null);

    const settled = await Promise.allSettled(
      timeframes.map(async (timeframe) => {
        const candles = await marketDataProvider.getCandles(symbol, timeframe, 220);
        const context = sanitizeChartContext({
          symbol,
          timeframe,
          visibleCandles: candles,
          quote,
          indicators,
          userDrawings: [],
          prompt,
        });
        return {
          timeframe,
          analysis: analyzeChartContext(context),
        };
      }),
    );

    const analyses: Array<{ timeframe: Timeframe; analysis: ReturnType<typeof analyzeChartContext> }> = [];
    const failures: Array<{ timeframe: Timeframe; error: string }> = [];

    settled.forEach((result, index) => {
      const timeframe = timeframes[index];
      if (result.status === "fulfilled") {
        analyses.push(result.value);
      } else {
        failures.push({
          timeframe,
          error: result.reason instanceof Error ? result.reason.message : "Unknown timeframe error.",
        });
      }
    });

    if (analyses.length === 0) {
      return json(502, {
        ok: false,
        error: "No requested timeframe could be analyzed.",
        failures,
      });
    }

    const analysis = buildMultiTimeframeAnalysis(
      symbol.ticker,
      timeframes,
      analyses,
      failures,
    );

    return json(200, {
      ok: true,
      provider: marketDataProvider.id,
      analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid multi-timeframe request.";
    return json(400, {
      ok: false,
      error: message,
    });
  }
}

app.http("multiTimeframeAnalyze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai/multi-timeframe",
  handler: multiTimeframeAnalyze,
});
