import type {
  ChartAnalysisResponse,
  MultiTimeframeAlignment,
  MultiTimeframeAnalysisResponse,
  MultiTimeframeFailure,
  MultiTimeframeItem,
  MultiTimeframeTrend,
  Timeframe,
} from "@marketos/market-core";

function trendFromAnalysis(analysis: ChartAnalysisResponse): MultiTimeframeTrend {
  if (analysis.metrics.change20 > 1) return "up";
  if (analysis.metrics.change20 < -1) return "down";
  return "sideways";
}

function alignmentLabel(alignment: MultiTimeframeAlignment) {
  if (alignment === "up") return "غالبًا صاعد";
  if (alignment === "down") return "غالبًا هابط";
  if (alignment === "sideways") return "غالبًا جانبي";
  return "مختلط";
}

function timeframeLabel(timeframe: Timeframe) {
  return timeframe.toUpperCase();
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildMultiTimeframeAnalysis(
  symbol: string,
  requestedTimeframes: Timeframe[],
  analyses: Array<{ timeframe: Timeframe; analysis: ChartAnalysisResponse }>,
  failures: MultiTimeframeFailure[] = [],
): MultiTimeframeAnalysisResponse {
  if (analyses.length === 0) {
    throw new Error("No timeframe analysis is available.");
  }

  const items: MultiTimeframeItem[] = analyses.map(({ timeframe, analysis }) => ({
    timeframe,
    trend: trendFromAnalysis(analysis),
    analysis,
  }));

  const upCount = items.filter((item) => item.trend === "up").length;
  const downCount = items.filter((item) => item.trend === "down").length;
  const sidewaysCount = items.filter((item) => item.trend === "sideways").length;
  const total = items.length;
  const majorityThreshold = Math.max(2, Math.ceil(total * 0.6));

  let alignment: MultiTimeframeAlignment = "mixed";
  if (upCount >= majorityThreshold && upCount > downCount && upCount > sidewaysCount) {
    alignment = "up";
  } else if (downCount >= majorityThreshold && downCount > upCount && downCount > sidewaysCount) {
    alignment = "down";
  } else if (sidewaysCount >= Math.ceil(total * 0.75)) {
    alignment = "sideways";
  }

  const rangeLow = Math.min(...items.map((item) => item.analysis.metrics.rangeLow20));
  const rangeHigh = Math.max(...items.map((item) => item.analysis.metrics.rangeHigh20));

  const observations = items.map((item) => {
    const metrics = item.analysis.metrics;
    const position =
      metrics.distanceFromSma20 > 0.35
        ? "فوق SMA20"
        : metrics.distanceFromSma20 < -0.35
          ? "تحت SMA20"
          : "قريب من SMA20";

    return `${timeframeLabel(item.timeframe)}: ${item.trend === "up" ? "صاعد" : item.trend === "down" ? "هابط" : "جانبي"}، حركة 20 شمعة ${round(metrics.change20, 2)}%، والسعر ${position}.`;
  });

  if (failures.length > 0) {
    observations.push(
      `تعذر تحليل ${failures.length} فريم: ${failures.map((failure) => timeframeLabel(failure.timeframe)).join("، ")}.`,
    );
  }

  const summary =
    `${symbol}: ${upCount}/${total} فريمات صاعدة، ${downCount}/${total} هابطة، ` +
    `${sidewaysCount}/${total} جانبية. التوافق العام ${alignmentLabel(alignment)}.`;

  return {
    engine: analyses[0].analysis.engine,
    generatedAt: Math.floor(Date.now() / 1000),
    symbol,
    requestedTimeframes,
    items,
    failures,
    alignment,
    upCount,
    downCount,
    sidewaysCount,
    rangeLow: round(rangeLow),
    rangeHigh: round(rangeHigh),
    summary,
    observations,
  };
}
