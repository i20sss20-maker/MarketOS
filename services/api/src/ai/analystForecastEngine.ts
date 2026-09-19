import type {
  AnalystCatalyst,
  AnalystForecastBias,
  AnalystForecastResponse,
  AnalystForecastScenario,
  AnalystMarketRegime,
  AnalystRiskLevel,
  CompanyRelease,
  MarketEvent,
  MarketSymbol,
  MultiTimeframeAnalysisResponse,
  Quote,
  Timeframe,
} from "@marketos/market-core";

type ForecastInput = {
  symbol: MarketSymbol;
  quote: Quote | null;
  multiTimeframe: MultiTimeframeAnalysisResponse;
  events: MarketEvent[];
  releases: CompanyRelease[];
  dataProvider: string;
  dataMode: "demo" | "provider";
};

const weights: Partial<Record<Timeframe, number>> = {
  "1m": 0.05,
  "5m": 0.08,
  "15m": 0.12,
  "1h": 0.2,
  "4h": 0.28,
  "1d": 0.32,
  "1w": 0.38,
  "1M": 0.45,
};

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

function round(
  value: number,
  decimals = 2,
) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(
  values: number[],
) {
  return values.length === 0
    ? 0
    : values.reduce(
        (sum, value) => sum + value,
        0,
      ) / values.length;
}

function scenarioProbabilities(
  score: number,
) {
  const normalized =
    clamp(score, -1, 1);

  let bull =
    33 + normalized * 28;
  let bear =
    33 - normalized * 28;
  let base =
    34 - Math.abs(normalized) * 10;

  bull = Math.max(10, bull);
  bear = Math.max(10, bear);
  base = Math.max(16, base);

  const total =
    bull + bear + base;

  const bullRounded =
    Math.round(
      (bull / total) * 100,
    );
  const bearRounded =
    Math.round(
      (bear / total) * 100,
    );
  const baseRounded =
    100 -
    bullRounded -
    bearRounded;

  return {
    bull: bullRounded,
    base: baseRounded,
    bear: bearRounded,
  };
}

function timeframeScore(
  metrics:
    MultiTimeframeAnalysisResponse["items"][number]["analysis"]["metrics"],
) {
  const momentum =
    clamp(
      metrics.change20 / 5,
      -1,
      1,
    );
  const position =
    clamp(
      metrics.distanceFromSma20 / 3,
      -1,
      1,
    );
  const rsi =
    metrics.rsi14 === undefined
      ? 0
      : clamp(
          (metrics.rsi14 - 50) /
            25,
          -1,
          1,
        );
  const macd =
    metrics.macdHistogram ===
    undefined
      ? 0
      : metrics.macdHistogram > 0
        ? 1
        : metrics.macdHistogram < 0
          ? -1
          : 0;

  return (
    momentum * 0.5 +
    position * 0.25 +
    rsi * 0.15 +
    macd * 0.1
  );
}

function biasFromScore(
  score: number,
): AnalystForecastBias {
  if (score >= 0.18) {
    return "bullish";
  }

  if (score <= -0.18) {
    return "bearish";
  }

  return "neutral";
}

function regimeFrom(
  alignment:
    MultiTimeframeAnalysisResponse["alignment"],
  averageRange: number,
  score: number,
): AnalystMarketRegime {
  if (averageRange >= 9) {
    return "volatile";
  }

  if (
    (alignment === "up" ||
      alignment === "down") &&
    Math.abs(score) >= 0.2
  ) {
    return "trend";
  }

  return "range";
}

function riskFrom(
  averageRange: number,
  highImpactEvents: number,
  failures: number,
): AnalystRiskLevel {
  if (
    averageRange >= 9 ||
    highImpactEvents > 0 ||
    failures >= 2
  ) {
    return "high";
  }

  if (
    averageRange >= 4 ||
    failures > 0
  ) {
    return "medium";
  }

  return "low";
}

function horizonFor(
  symbol: MarketSymbol,
) {
  if (
    symbol.assetClass === "stock" ||
    symbol.assetClass === "etf" ||
    symbol.assetClass === "index"
  ) {
    return "عدة أيام إلى عدة أسابيع";
  }

  if (
    symbol.assetClass === "crypto" ||
    symbol.assetClass === "forex" ||
    symbol.assetClass === "future" ||
    symbol.assetClass === "commodity"
  ) {
    return "24–72 ساعة مع سياق يومي";
  }

  return "قصير إلى متوسط المدى";
}

function catalystsFrom(
  events: MarketEvent[],
  releases: CompanyRelease[],
): AnalystCatalyst[] {
  const catalysts: AnalystCatalyst[] = [];

  for (
    const event
    of events.slice(0, 4)
  ) {
    catalysts.push({
      kind: "event",
      title: event.title,
      date: event.date,
      importance:
        event.importance,
      source: event.source,
    });
  }

  for (
    const release
    of releases.slice(0, 3)
  ) {
    catalysts.push({
      kind: "release",
      title: release.title,
      date: release.datetime,
      source: release.source,
    });
  }

  return catalysts.slice(0, 6);
}

export function buildAnalystForecast(
  input: ForecastInput,
): AnalystForecastResponse {
  const items =
    input.multiTimeframe.items;

  if (items.length === 0) {
    throw new Error(
      "No timeframe evidence is available for forecasting.",
    );
  }

  let weightedScore = 0;
  let totalWeight = 0;

  for (const item of items) {
    const weight =
      weights[item.timeframe] ??
      0.2;

    weightedScore +=
      timeframeScore(
        item.analysis.metrics,
      ) *
      weight;

    totalWeight += weight;
  }

  const score =
    totalWeight > 0
      ? weightedScore /
        totalWeight
      : 0;

  const bias =
    biasFromScore(score);

  const referencePrice =
    input.quote?.price ??
    items[
      items.length - 1
    ].analysis.metrics
      .lastPrice;

  const anchor =
    [...items]
      .sort(
        (a, b) =>
          (weights[b.timeframe] ??
            0) -
          (weights[a.timeframe] ??
            0),
      )[0];

  const anchorLow =
    anchor.analysis.metrics
      .rangeLow20;
  const anchorHigh =
    anchor.analysis.metrics
      .rangeHigh20;

  const support =
    Math.min(
      referencePrice,
      anchorLow,
    );
  const resistance =
    Math.max(
      referencePrice,
      anchorHigh,
    );

  const span =
    Math.max(
      resistance - support,
      Math.abs(referencePrice) *
        0.01,
    );

  const averageRange =
    average(
      items.map(
        (item) =>
          item.analysis.metrics
            .realizedRangePercent20,
      ),
    );

  const atrPercents =
    items
      .map(
        (item) =>
          item.analysis.metrics
            .atrPercent,
      )
      .filter(
        (value): value is number =>
          value !== undefined,
      );

  const averageAtrPercent =
    average(atrPercents);

  const highImpactEvents =
    input.events.filter(
      (event) =>
        event.importance === "high",
    ).length;

  const risk =
    riskFrom(
      Math.max(
        averageRange,
        averageAtrPercent * 4,
      ),
      highImpactEvents,
      input.multiTimeframe
        .failures.length,
    );

  const regime =
    regimeFrom(
      input.multiTimeframe
        .alignment,
      averageRange,
      score,
    );

  const alignmentStrength =
    Math.max(
      input.multiTimeframe
        .upCount,
      input.multiTimeframe
        .downCount,
      input.multiTimeframe
        .sidewaysCount,
    ) / items.length;

  const confidence =
    Math.round(
      clamp(
        42 +
          Math.abs(score) *
            28 +
          alignmentStrength *
            22 -
          highImpactEvents * 6 -
          input.multiTimeframe
            .failures.length *
            5,
        35,
        90,
      ),
    );

  const probabilities =
    scenarioProbabilities(score);

  const bullTargetLow =
    Math.max(
      referencePrice +
        span * 0.18,
      resistance,
    );
  const bullTargetHigh =
    bullTargetLow +
    span * 0.28;

  const bearTargetHigh =
    Math.min(
      referencePrice -
        span * 0.18,
      support,
    );
  const bearTargetLow =
    bearTargetHigh -
    span * 0.28;

  const baseHalf =
    span * 0.16;

  const bullScenario:
    AnalystForecastScenario = {
      id: "bull",
      label: "سيناريو صاعد",
      probability:
        probabilities.bull,
      targetLow:
        round(bullTargetLow, 4),
      targetHigh:
        round(bullTargetHigh, 4),
      trigger:
        `ثبات فوق ${round(resistance, 4)} مع استمرار الزخم على الفريمات الأعلى.`,
      invalidation:
        `عودة واضحة تحت ${round(referencePrice - span * 0.12, 4)} تقلل السيناريو الصاعد.`,
      rationale: [
        `درجة الاتجاه الموزونة ${round(score, 3)}.`,
        `${input.multiTimeframe.upCount}/${items.length} من الفريمات صاعدة.`,
      ],
    };

  const baseScenario:
    AnalystForecastScenario = {
      id: "base",
      label: "سيناريو محايد",
      probability:
        probabilities.base,
      targetLow:
        round(
          referencePrice -
            baseHalf,
          4,
        ),
      targetHigh:
        round(
          referencePrice +
            baseHalf,
          4,
        ),
      trigger:
        `بقاء السعر داخل النطاق بين الدعم ${round(support, 4)} والمقاومة ${round(resistance, 4)}.`,
      invalidation:
        "اختراق مؤكد لأحد طرفي النطاق يحوّل الترجيح للسيناريو الاتجاهي.",
      rationale: [
        `حالة السوق الحالية: ${regime}.`,
        `متوسط نطاق التذبذب المحقق ${round(averageRange, 2)}%.`,
      ],
    };

  const bearScenario:
    AnalystForecastScenario = {
      id: "bear",
      label: "سيناريو هابط",
      probability:
        probabilities.bear,
      targetLow:
        round(bearTargetLow, 4),
      targetHigh:
        round(bearTargetHigh, 4),
      trigger:
        `كسر ${round(support, 4)} مع استمرار الضعف على الفريمات الأعلى.`,
      invalidation:
        `استعادة ${round(referencePrice + span * 0.12, 4)} تقلل السيناريو الهابط.`,
      rationale: [
        `درجة الاتجاه الموزونة ${round(score, 3)}.`,
        `${input.multiTimeframe.downCount}/${items.length} من الفريمات هابطة.`,
      ],
    };

  const evidence = [
    input.multiTimeframe.summary,
    ...input.multiTimeframe.observations.slice(0, 4),
  ];

  const rsiValues =
    items
      .map(
        (item) =>
          item.analysis.metrics
            .rsi14,
      )
      .filter(
        (value): value is number =>
          value !== undefined,
      );

  if (rsiValues.length > 0) {
    evidence.push(
      `متوسط RSI14 عبر الفريمات المتاحة ${round(average(rsiValues), 1)}.`,
    );
  }

  const positiveMacd =
    items.filter(
      (item) =>
        (
          item.analysis.metrics
            .macdHistogram ?? 0
        ) > 0,
    ).length;

  const negativeMacd =
    items.filter(
      (item) =>
        (
          item.analysis.metrics
            .macdHistogram ?? 0
        ) < 0,
    ).length;

  if (
    positiveMacd +
      negativeMacd >
    0
  ) {
    evidence.push(
      `MACD: ${positiveMacd} فريم بزخم موجب مقابل ${negativeMacd} فريم بزخم سالب.`,
    );
  }

  if (atrPercents.length > 0) {
    evidence.push(
      `متوسط ATR14 النسبي عبر الفريمات ${round(averageAtrPercent, 2)}%.`,
    );
  }

  if (input.events.length > 0) {
    evidence.push(
      `يوجد ${input.events.length} حدث سوقي قريب ضمن نافذة التحليل.`,
    );
  }

  if (input.releases.length > 0) {
    evidence.push(
      `تمت مراجعة ${input.releases.length} إفصاحات/إعلانات حديثة متاحة للمصدر.`,
    );
  }

  const biasLabel =
    bias === "bullish"
      ? "صاعد"
      : bias === "bearish"
        ? "هابط"
        : "محايد";

  return {
    engine: "marketos-forecast-v1",
    generatedAt:
      Math.floor(Date.now() / 1000),
    symbol: input.symbol,
    dataProvider:
      input.dataProvider,
    dataMode: input.dataMode,
    timeframes:
      input.multiTimeframe
        .requestedTimeframes,
    bias,
    confidence,
    risk,
    regime,
    horizon:
      horizonFor(input.symbol),
    referencePrice:
      round(referencePrice, 4),
    support:
      round(support, 4),
    resistance:
      round(resistance, 4),
    expectedRangeLow:
      round(bearTargetLow, 4),
    expectedRangeHigh:
      round(bullTargetHigh, 4),
    summary:
      `${input.symbol.ticker}: الميل الاحتمالي ${biasLabel} بثقة ${confidence}٪. السيناريو الأعلى حاليًا ${[
        bullScenario,
        baseScenario,
        bearScenario,
      ].sort(
        (a, b) =>
          b.probability -
          a.probability,
      )[0].label}.`,
    scenarios: [
      bullScenario,
      baseScenario,
      bearScenario,
    ],
    catalysts:
      catalystsFrom(
        input.events,
        input.releases,
      ),
    evidence:
      evidence.slice(0, 8),
    uncertaintyNote:
      "هذه سيناريوهات احتمالية مبنية على البيانات المتاحة وليست ضمانًا للحركة المستقبلية. الأحداث المفاجئة والسيولة وتغيرات السوق قد تبطل الترجيح بسرعة.",
  };
}
