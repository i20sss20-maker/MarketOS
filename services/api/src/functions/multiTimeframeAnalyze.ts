import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { canUseFeature } from "@marketos/entitlements-core";
import type { AssetClass, Candle, MarketSymbol, Timeframe } from "@marketos/market-core";
import { analyzeChartContext, sanitizeChartContext } from "../ai/localChartEngine.js";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { getResolvedUserEntitlement } from "../entitlements/index.js";
import { buildMultiTimeframeAnalysis } from "../ai/multiTimeframeEngine.js";
import { assertForecastEvidenceFresh } from "../ai/forecastEvidence.js";
import { json, preflight } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { assertProductionMarketAccess, consumeProductionMarketQuota } from "../production/marketAccess.js";
import { assertMarketDataPolicy } from "../production/marketDataPolicy.js";
import { assertRealProvider, ProductionGateError, realDataRequired } from "../production/policy.js";
import { consumeProductionAiQuery, type AiQueryQuotaResult } from "../usage/aiQueryQuota.js";

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

  let aiUsage: AiQueryQuotaResult | null = null;

  const user = getAuthenticatedUser(request);
  if (!user) {
    return json(401, {
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Authentication required for Multi-Timeframe AI.",
    });
  }

  try {
    const productionUser =
      assertProductionMarketAccess(
        request,
      );
    const entitlement =
      await getResolvedUserEntitlement(
        user.userId,
      );

    if (
      !canUseFeature(
        entitlement,
        "multiTimeframeAi",
      )
    ) {
      return json(403, {
        ok: false,
        code: "PLAN_FEATURE",
        error:
          "Multi-Timeframe AI is not included in the current MarketOS plan.",
        plan: entitlement.plan,
        feature: "multiTimeframeAi",
      });
    }
    const body = await request.json() as Record<string, unknown>;
    const symbol = sanitizeSymbol(body.symbol);
    const timeframes = sanitizeTimeframes(body.timeframes);
    const indicators = sanitizeIndicators(body.indicators);
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1200) : undefined;

    if (realDataRequired()) {
      assertRealProvider(
        marketDataProvider,
      );
    }

    // Multi-Timeframe AI shares the same persistent daily AI/forecast budget.
    // Reserve the AI unit before any provider-backed analysis starts.
    aiUsage =
      await consumeProductionAiQuery(
        request,
      );

    await consumeProductionMarketQuota(
      productionUser,
      1 + timeframes.length,
    );

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
          candles,
          analysis: analyzeChartContext(context),
        };
      }),
    );

    const analyses: Array<{ timeframe: Timeframe; analysis: ReturnType<typeof analyzeChartContext> }> = [];
    const candleHistory =
      new Map<
        Timeframe,
        Candle[]
      >();
    const failures: Array<{ timeframe: Timeframe; error: string }> = [];

    settled.forEach((result, index) => {
      const timeframe = timeframes[index];
      if (result.status === "fulfilled") {
        analyses.push({
          timeframe:
            result.value.timeframe,
          analysis:
            result.value.analysis,
        });
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
              : result.reason instanceof Error
                ? result.reason.message
                : "Unknown timeframe error.",
        });
      }
    });

    if (analyses.length === 0) {
      return json(502, {
        ok: false,
        error: "No requested timeframe could be analyzed.",
        failures,
        ...(aiUsage
          ? { usage: aiUsage }
          : {}),
      });
    }

    if (realDataRequired()) {
      if (!quote) {
        throw new ProductionGateError(
          "INCOMPLETE_MARKET_EVIDENCE",
          "Multi-Timeframe AI requires a verified provider quote.",
          502,
        );
      }

      assertForecastEvidenceFresh({
        providerId:
          marketDataProvider.id,
        policy:
          assertMarketDataPolicy(),
        quote,
        candleHistory,
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
      ...(aiUsage
        ? { usage: aiUsage }
        : {}),
    });
  } catch (error) {
    if (error instanceof ProductionGateError) {
      return json(error.status, {
        ok: false,
        code: error.code,
        error: error.message,
        ...(aiUsage
          ? { usage: aiUsage }
          : {}),
      });
    }

    const message = error instanceof Error ? error.message : "Invalid multi-timeframe request.";
    return json(400, {
      ok: false,
      error: message,
      ...(aiUsage
        ? { usage: aiUsage }
        : {}),
    });
  }
}

app.http("multiTimeframeAnalyze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai/multi-timeframe",
  handler: multiTimeframeAnalyze,
});
