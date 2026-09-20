import type {
  AnalystForecastResponse,
  MarketOverviewItem,
  MarketSymbol,
} from "@marketos/market-core";
import type {
  AdvancedAlert,
} from "@marketos/alert-core";
import {
  buildAnalystRadarDeltas,
  type AnalystRadarDelta,
  type AnalystRadarItem,
} from "./analystRadar";
import type {
  AnalystRadarCache,
} from "./analystRadarCache";
import type {
  ForecastJournalRecord,
} from "./forecastJournal";
import {
  buildForecastWatchSpec,
  type ForecastWatchSide,
} from "./forecastWatch";

export type AnalystAttentionKind =
  | "reversal"
  | "strengthening"
  | "watch-near"
  | "catalyst"
  | "verification";

export type AnalystAttentionItem = {
  id: string;
  kind: AnalystAttentionKind;
  symbol: MarketSymbol;
  title: string;
  detail: string;
  priority: number;
  dataMode?: "demo" | "provider";
  direction?: "bull" | "base" | "bear";
  probability?: number;
  distancePercent?: number;
  proximityPrice?: number;
  proximitySource?: "live" | "radar";
  dueAt?: number;
};

export type AnalystAttentionQueue = {
  items: AnalystAttentionItem[];
  criticalCount: number;
  watchNearCount: number;
  verificationCount: number;
};

function round(
  value: number,
  decimals = 2,
) {
  const factor =
    10 ** decimals;
  return (
    Math.round(
      value * factor,
    ) / factor
  );
}

function signed(
  value: number,
) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function directionLabel(
  direction:
    "bull" | "base" | "bear",
) {
  if (direction === "bull") {
    return "صاعد";
  }

  if (direction === "bear") {
    return "هابط";
  }

  return "محايد";
}

function matchingWatch(
  alerts: AdvancedAlert[],
  item: AnalystRadarItem,
  livePrice?: number,
) {
  const matches: Array<{
    side: ForecastWatchSide;
    distancePercent: number;
    probability: number;
    value: number;
    proximityPrice: number;
    proximitySource:
      "live" | "radar";
  }> = [];

  for (
    const side
    of ["bull", "bear"] as const
  ) {
    const spec =
      buildForecastWatchSpec(
        item.forecast,
        side,
      );

    if (!spec) {
      continue;
    }

    const epsilon =
      Math.max(
        Math.abs(
          spec.value,
        ) * 0.0001,
        0.000001,
      );

    const active =
      alerts.some(
        (alert) =>
          alert.enabled &&
          !alert.triggeredAt &&
          alert.symbol.id ===
            item.symbol.id &&
          alert.conditions.some(
            (condition) =>
              condition.type ===
                "numeric" &&
              condition.metric ===
                "price" &&
              condition.operator ===
                spec.operator &&
              Math.abs(
                condition.value -
                  spec.value,
              ) <= epsilon,
          ),
      );

    if (!active) {
      continue;
    }

    const proximityPrice =
      livePrice !== undefined &&
      Number.isFinite(
        livePrice,
      ) &&
      livePrice > 0
        ? livePrice
        : item.forecast
            .referencePrice;

    const distancePercent =
      Math.abs(
        (
          spec.value -
          proximityPrice
        ) /
          proximityPrice,
      ) * 100;

    matches.push({
      side,
      distancePercent:
        round(
          distancePercent,
          2,
        ),
      probability:
        spec.probability,
      value:
        spec.value,
      proximityPrice,
      proximitySource:
        livePrice !== undefined &&
        Number.isFinite(
          livePrice,
        ) &&
        livePrice > 0
          ? "live"
          : "radar",
    });
  }

  return matches.sort(
    (a, b) =>
      a.distancePercent -
      b.distancePercent,
  )[0] ?? null;
}

function deltaAttention(
  cache:
    AnalystRadarCache | null,
) {
  if (
    !cache ||
    cache.previousItems.length ===
      0
  ) {
    return [];
  }

  const currentBySymbol =
    new Map(
      cache.items.map(
        (item) => [
          item.symbol.id,
          item,
        ],
      ),
    );

  return buildAnalystRadarDeltas(
    cache.items,
    cache.previousItems,
  )
    .map(
      (
        delta,
      ):
        AnalystAttentionItem |
        null => {
        const item =
          currentBySymbol.get(
            delta.symbolId,
          );

        if (!item) {
          return null;
        }

        if (
          delta.change ===
          "reversal"
        ) {
          return {
            id:
              `reversal:${item.symbol.id}`,
            kind: "reversal",
            symbol:
              item.symbol,
            title:
              "انعكاس في Radar",
            detail:
              `${directionLabel(
                delta.previousDirection ??
                  item.direction,
              )} → ${directionLabel(
                delta.currentDirection,
              )} · وضوح ${signed(
                delta.clarityDelta,
              )}`,
            priority:
              95 +
              Math.min(
                5,
                Math.abs(
                  delta.clarityDelta,
                ),
              ),
            dataMode:
              item.forecast
                .dataMode,
            direction:
              item.direction,
            probability:
              item.directionProbability,
          };
        }

        if (
          delta.change ===
          "strengthening" &&
          (
            delta.clarityDelta >=
              4 ||
            delta.probabilityDelta >=
              5
          )
        ) {
          return {
            id:
              `strengthening:${item.symbol.id}`,
            kind:
              "strengthening",
            symbol:
              item.symbol,
            title:
              "الحالة تقوّت",
            detail:
              `احتمال ${signed(
                delta.probabilityDelta,
              )}% · وضوح ${signed(
                delta.clarityDelta,
              )}`,
            priority:
              72 +
              Math.min(
                18,
                Math.max(
                  0,
                  delta.clarityDelta,
                ) +
                  Math.max(
                    0,
                    delta.probabilityDelta,
                  ) *
                    0.6,
              ),
            dataMode:
              item.forecast
                .dataMode,
            direction:
              item.direction,
            probability:
              item.directionProbability,
          };
        }

        return null;
      },
    )
    .filter(
      (
        item,
      ): item is AnalystAttentionItem =>
        item !== null,
    );
}

function watchAttention(
  cache:
    AnalystRadarCache | null,
  alerts: AdvancedAlert[],
  livePrices:
    Map<string, number>,
) {
  if (!cache) {
    return [];
  }

  return cache.items
    .map(
      (
        item,
      ):
        AnalystAttentionItem |
        null => {
        const watch =
          matchingWatch(
            alerts,
            item,
            livePrices.get(
              item.symbol.id,
            ),
          );

        if (
          !watch ||
          watch.distancePercent >
            3
        ) {
          return null;
        }

        const sideLabel =
          watch.side === "bull"
            ? "اختراق المقاومة"
            : "كسر الدعم";

        return {
          id:
            `watch:${item.symbol.id}:${watch.side}`,
          kind: "watch-near",
          symbol:
            item.symbol,
          title:
            "Forecast Watch قريب",
          detail:
            `${sideLabel} على بُعد ${watch.distancePercent}% من ${watch.proximitySource === "live" ? "السعر الحالي" : "سعر الرادار"} · احتمال السيناريو ${watch.probability}%`,
          priority:
            86 -
            Math.min(
              20,
              watch.distancePercent *
                6,
            ),
          dataMode:
            item.forecast
              .dataMode,
          direction:
            watch.side,
          probability:
            watch.probability,
          distancePercent:
            watch.distancePercent,
          proximityPrice:
            watch.proximityPrice,
          proximitySource:
            watch.proximitySource,
        };
      },
    )
    .filter(
      (
        item,
      ): item is AnalystAttentionItem =>
        item !== null,
    );
}

function catalystAttention(
  cache:
    AnalystRadarCache | null,
) {
  if (!cache) {
    return [];
  }

  return cache.items
    .map(
      (
        item,
      ):
        AnalystAttentionItem |
        null => {
        const catalyst =
          item.forecast
            .catalystImpact;

        if (
          !catalyst ||
          catalyst.direction ===
            "neutral" ||
          Math.abs(
            catalyst.score *
              catalyst.weight,
          ) < 0.08
        ) {
          return null;
        }

        return {
          id:
            `catalyst:${item.symbol.id}`,
          kind: "catalyst",
          symbol:
            item.symbol,
          title:
            catalyst.direction ===
            "positive"
              ? "Catalyst كمي إيجابي"
              : "Catalyst كمي سلبي",
          detail:
            catalyst.latestSurprisePercent !==
            undefined
              ? `Surprise ${signed(
                  round(
                    catalyst.latestSurprisePercent,
                    1,
                  ),
                )}% · ${catalyst.sampleSize} عينة`
              : `Score ${round(
                  catalyst.score,
                  2,
                )} · ${catalyst.sampleSize} عينة`,
          priority:
            60 +
            Math.min(
              18,
              Math.abs(
                catalyst.score *
                  catalyst.weight,
              ) *
                60,
            ),
          dataMode:
            item.forecast
              .dataMode,
          direction:
            item.direction,
          probability:
            item.directionProbability,
        };
      },
    )
    .filter(
      (
        item,
      ): item is AnalystAttentionItem =>
        item !== null,
    );
}

function verificationAttention(
  records:
    ForecastJournalRecord[],
  nowSeconds: number,
) {
  const bySymbol =
    new Map<
      string,
      ForecastJournalRecord
    >();

  for (const record of records) {
    if (
      record.status !==
        "pending" ||
      record.dueAt >
        nowSeconds ||
      !record.symbol
    ) {
      continue;
    }

    const existing =
      bySymbol.get(
        record.symbolId,
      );

    if (
      !existing ||
      record.dueAt <
        existing.dueAt
    ) {
      bySymbol.set(
        record.symbolId,
        record,
      );
    }
  }

  return [
    ...bySymbol.values(),
  ].map(
    (
      record,
    ): AnalystAttentionItem => ({
      id:
        `verification:${record.symbolId}`,
      kind:
        "verification",
      symbol:
        record.symbol!,
      title:
        "توقع ناضج يحتاج تحقق",
      detail:
        `${directionLabel(
          record.expectedOutcome,
        )} ${record.expectedProbability}% · انتهى الأفق`,
      priority:
        64 +
        Math.min(
          10,
          Math.max(
            0,
            (
              nowSeconds -
              record.dueAt
            ) /
              3600,
          ),
        ),
      dataMode:
        record.dataMode,
      direction:
        record.expectedOutcome,
      probability:
        record.expectedProbability,
      dueAt:
        record.dueAt,
    }),
  );
}

export function buildAnalystAttentionQueue(
  input: {
    radarCache:
      AnalystRadarCache | null;
    journal:
      ForecastJournalRecord[];
    alerts:
      AdvancedAlert[];
    overview?:
      MarketOverviewItem[];
    overviewMode?:
      "demo" | "provider";
    nowSeconds?: number;
    limit?: number;
  },
): AnalystAttentionQueue {
  const nowSeconds =
    input.nowSeconds ??
    Math.floor(
      Date.now() / 1000,
    );
  const limit =
    Math.max(
      1,
      Math.min(
        12,
        input.limit ?? 6,
      ),
    );

  const livePrices =
    new Map<string, number>();

  for (
    const overviewItem
    of input.overview ?? []
  ) {
    const radarItem =
      input.radarCache
        ?.items.find(
          (item) =>
            item.symbol.id ===
            overviewItem.symbol.id,
        );

    if (
      !radarItem ||
      !Number.isFinite(
        overviewItem.quote
          .price,
      ) ||
      overviewItem.quote
        .price <= 0 ||
      input.overviewMode !==
        radarItem.forecast
          .dataMode
    ) {
      continue;
    }

    livePrices.set(
      overviewItem.symbol.id,
      overviewItem.quote.price,
    );
  }

  const items = [
    ...deltaAttention(
      input.radarCache,
    ),
    ...watchAttention(
      input.radarCache,
      input.alerts,
      livePrices,
    ),
    ...catalystAttention(
      input.radarCache,
    ),
    ...verificationAttention(
      input.journal,
      nowSeconds,
    ),
  ]
    .sort(
      (a, b) =>
        b.priority -
          a.priority ||
        a.symbol.ticker.localeCompare(
          b.symbol.ticker,
        ),
    )
    .slice(0, limit);

  return {
    items,
    criticalCount:
      items.filter(
        (item) =>
          item.kind ===
            "reversal" ||
          (
            item.kind ===
              "watch-near" &&
            (
              item.distancePercent ??
              Infinity
            ) <= 1
          ),
      ).length,
    watchNearCount:
      items.filter(
        (item) =>
          item.kind ===
          "watch-near",
      ).length,
    verificationCount:
      items.filter(
        (item) =>
          item.kind ===
          "verification",
      ).length,
  };
}
