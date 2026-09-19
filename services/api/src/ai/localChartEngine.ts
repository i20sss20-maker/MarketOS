import type {
  Candle,
  ChartAnalysisResponse,
  ChartContext,
  ChartDrawingContext,
  MarketSymbol,
  Quote,
  Timeframe,
} from "@marketos/market-core";

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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeSymbol(value: unknown): MarketSymbol {
  if (!value || typeof value !== "object") throw new Error("Invalid chart symbol.");
  const input = value as Partial<MarketSymbol>;

  if (
    typeof input.id !== "string" ||
    typeof input.ticker !== "string" ||
    typeof input.name !== "string" ||
    typeof input.exchange !== "string" ||
    typeof input.assetClass !== "string" ||
    typeof input.currency !== "string"
  ) {
    throw new Error("Invalid chart symbol.");
  }

  return {
    id: input.id.slice(0, 160),
    ticker: input.ticker.slice(0, 80),
    name: input.name.slice(0, 180),
    exchange: input.exchange.slice(0, 100),
    assetClass: input.assetClass,
    currency: input.currency.slice(0, 20),
    providerSymbol: typeof input.providerSymbol === "string" ? input.providerSymbol.slice(0, 100) : undefined,
    micCode: typeof input.micCode === "string" ? input.micCode.slice(0, 20) : undefined,
    country: typeof input.country === "string" ? input.country.slice(0, 80) : undefined,
  };
}

function sanitizeCandle(value: unknown): Candle | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<Candle>;

  if (
    !finiteNumber(input.time) ||
    !finiteNumber(input.open) ||
    !finiteNumber(input.high) ||
    !finiteNumber(input.low) ||
    !finiteNumber(input.close) ||
    input.high < input.low
  ) {
    return null;
  }

  return {
    time: Math.floor(input.time),
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    volume: finiteNumber(input.volume) && input.volume >= 0 ? input.volume : undefined,
  };
}

function sanitizeQuote(value: unknown): Quote | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<Quote>;
  if (!finiteNumber(input.price) || typeof input.symbol !== "string" || !finiteNumber(input.timestamp)) return null;

  return {
    symbol: input.symbol.slice(0, 80),
    price: input.price,
    open: finiteNumber(input.open) ? input.open : undefined,
    high: finiteNumber(input.high) ? input.high : undefined,
    low: finiteNumber(input.low) ? input.low : undefined,
    previousClose: finiteNumber(input.previousClose) ? input.previousClose : undefined,
    change: finiteNumber(input.change) ? input.change : undefined,
    percentChange: finiteNumber(input.percentChange) ? input.percentChange : undefined,
    volume: finiteNumber(input.volume) ? input.volume : undefined,
    currency: typeof input.currency === "string" ? input.currency.slice(0, 20) : undefined,
    timestamp: Math.floor(input.timestamp),
    isMarketOpen: typeof input.isMarketOpen === "boolean" ? input.isMarketOpen : undefined,
    isExtendedHours: typeof input.isExtendedHours === "boolean" ? input.isExtendedHours : undefined,
    source: typeof input.source === "string" ? input.source.slice(0, 80) : "unknown",
  };
}

function sanitizeDrawing(value: unknown): ChartDrawingContext | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;

  if (input.type === "horizontal" && finiteNumber(input.price)) {
    return { type: "horizontal", price: input.price };
  }

  if (
    (input.type === "trend" || input.type === "zone" || input.type === "fibonacci") &&
    Array.isArray(input.points) &&
    input.points.length === 2
  ) {
    const points = input.points.map((point) => {
      if (!point || typeof point !== "object") return null;
      const record = point as Record<string, unknown>;
      if (!finiteNumber(record.time) || !finiteNumber(record.price)) return null;
      return { time: Math.floor(record.time), price: record.price };
    });

    if (points[0] && points[1]) {
      return {
        type: input.type,
        points: [points[0], points[1]],
      };
    }
  }

  return null;
}

export function sanitizeChartContext(value: unknown): ChartContext {
  if (!value || typeof value !== "object") throw new Error("Missing chart context.");
  const input = value as Record<string, unknown>;
  const timeframe = input.timeframe;

  if (typeof timeframe !== "string" || !allowedTimeframes.has(timeframe as Timeframe)) {
    throw new Error("Invalid chart timeframe.");
  }

  const candles = Array.isArray(input.visibleCandles)
    ? input.visibleCandles
        .slice(-500)
        .map(sanitizeCandle)
        .filter((candle): candle is Candle => candle !== null)
        .sort((a, b) => a.time - b.time)
    : [];

  if (candles.length < 20) throw new Error("At least 20 valid candles are required.");

  const indicators = Array.isArray(input.indicators)
    ? input.indicators
        .filter((item): item is string => typeof item === "string")
        .slice(0, 20)
        .map((item) => item.slice(0, 60))
    : [];

  const userDrawings = Array.isArray(input.userDrawings)
    ? input.userDrawings
        .slice(0, 100)
        .map(sanitizeDrawing)
        .filter((drawing): drawing is ChartDrawingContext => drawing !== null)
    : [];

  return {
    symbol: sanitizeSymbol(input.symbol),
    timeframe: timeframe as Timeframe,
    visibleCandles: candles,
    quote: sanitizeQuote(input.quote),
    indicators,
    userDrawings,
    prompt: typeof input.prompt === "string" ? input.prompt.slice(0, 1200) : undefined,
  };
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(from: number, to: number) {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function analyzeChartContext(context: ChartContext): ChartAnalysisResponse {
  const candles = context.visibleCandles;
  const recent = candles.slice(-20);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const closes = recent.map((candle) => candle.close);
  const rangeLow20 = Math.min(...recent.map((candle) => candle.low));
  const rangeHigh20 = Math.max(...recent.map((candle) => candle.high));
  const sma20 = average(closes);
  const change20 = percentChange(first.open, last.close);
  const distanceFromSma20 = percentChange(sma20, last.close);
  const realizedRangePercent20 = rangeLow20 === 0
    ? 0
    : ((rangeHigh20 - rangeLow20) / rangeLow20) * 100;

  const volumes = recent
    .map((candle) => candle.volume)
    .filter((value): value is number => finiteNumber(value));
  const averageVolume20 = volumes.length ? average(volumes) : undefined;
  const latestVolume = finiteNumber(last.volume) ? last.volume : undefined;
  const latestVolumeRatio =
    averageVolume20 && latestVolume !== undefined && averageVolume20 > 0
      ? latestVolume / averageVolume20
      : undefined;

  const trend =
    change20 > 1
      ? "صاعد"
      : change20 < -1
        ? "هابط"
        : "جانبي";

  const position =
    distanceFromSma20 > 0.35
      ? "فوق متوسط 20 شمعة"
      : distanceFromSma20 < -0.35
        ? "تحت متوسط 20 شمعة"
        : "قريب من متوسط 20 شمعة";

  const observations = [
    `الحركة خلال آخر 20 شمعة: ${round(change20, 2)}%، والاتجاه الوصفي ${trend}.`,
    `السعر الأخير ${round(last.close)} وهو ${position} بفارق ${round(distanceFromSma20, 2)}%.`,
    `نطاق آخر 20 شمعة بين ${round(rangeLow20)} و${round(rangeHigh20)}، بعرض نسبي ${round(realizedRangePercent20, 2)}%.`,
  ];

  if (latestVolumeRatio !== undefined) {
    observations.push(
      `حجم آخر شمعة يساوي ${round(latestVolumeRatio, 2)}× متوسط أحجام آخر 20 شمعة.`,
    );
  }

  const horizontalLevels = context.userDrawings.filter((drawing) => drawing.type === "horizontal");
  if (horizontalLevels.length > 0) {
    observations.push(`يوجد ${horizontalLevels.length} مستوى أفقي محفوظ على الشارت ضمن سياق المستخدم.`);
  }

  const trendLines = context.userDrawings.filter((drawing) => drawing.type === "trend");
  if (trendLines.length > 0) {
    observations.push(`يوجد ${trendLines.length} خط اتجاه مرسوم ضمن سياق المستخدم.`);
  }

  const zones = context.userDrawings.filter((drawing) => drawing.type === "zone");
  if (zones.length > 0) {
    observations.push(`يوجد ${zones.length} منطقة سعر محددة ضمن سياق المستخدم.`);
  }

  const fibonacciDrawings = context.userDrawings.filter((drawing) => drawing.type === "fibonacci");
  if (fibonacciDrawings.length > 0) {
    observations.push(`يوجد ${fibonacciDrawings.length} رسم Fibonacci ضمن سياق المستخدم.`);
  }

  if (context.indicators.length > 0) {
    observations.push(`المؤشرات النشطة في مساحة العمل: ${context.indicators.join("، ")}.`);
  }

  return {
    engine: process.env.AI_PROVIDER?.trim() || "local-chart-engine",
    generatedAt: Math.floor(Date.now() / 1000),
    symbol: context.symbol.ticker,
    timeframe: context.timeframe,
    summary: `${context.symbol.ticker} على ${context.timeframe.toUpperCase()}: اتجاه وصفي ${trend} خلال آخر 20 شمعة، والسعر ${position}.`,
    observations,
    metrics: {
      lastPrice: round(last.close),
      change20: round(change20, 4),
      rangeLow20: round(rangeLow20),
      rangeHigh20: round(rangeHigh20),
      sma20: round(sma20),
      distanceFromSma20: round(distanceFromSma20, 4),
      averageVolume20: averageVolume20 === undefined ? undefined : round(averageVolume20, 2),
      latestVolumeRatio: latestVolumeRatio === undefined ? undefined : round(latestVolumeRatio, 4),
      realizedRangePercent20: round(realizedRangePercent20, 4),
    },
    activeIndicators: context.indicators,
    drawingCount: context.userDrawings.length,
  };
}
