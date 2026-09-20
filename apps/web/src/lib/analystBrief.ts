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
  rankAnalystRadar,
  type AnalystRadarDelta,
  type AnalystRadarItem,
} from "./analystRadar";
import type {
  AnalystRadarCache,
} from "./analystRadarCache";
import {
  buildForecastPerformance,
} from "./forecastPerformance";
import type {
  ForecastJournalRecord,
} from "./forecastJournal";
import {
  buildForecastWatchSpec,
} from "./forecastWatch";
import {
  buildAnalystAttentionQueue,
  type AnalystAttentionQueue,
} from "./analystAttention";
import {
  buildAnalystModelHealth,
  type AnalystModelHealth,
} from "./analystModelHealth";

export type AnalystBriefSetup = {
  symbol: MarketSymbol;
  direction:
    "bull" | "base" | "bear";
  probability: number;
  confidence: number;
  clarity: number;
  risk:
    AnalystForecastResponse["risk"];
  provider: string;
  dataMode:
    "demo" | "provider";
};

export type AnalystBriefChange = {
  symbol: MarketSymbol;
  change:
    AnalystRadarDelta["change"];
  previousDirection?:
    AnalystRadarDelta["previousDirection"];
  currentDirection:
    AnalystRadarDelta["currentDirection"];
  probabilityDelta: number;
  clarityDelta: number;
};

export type AnalystBriefCatalyst = {
  symbol: MarketSymbol;
  direction:
    "positive" | "negative";
  score: number;
  weight: number;
  latestSurprisePercent?: number;
  sampleSize: number;
};

export type AnalystBriefSnapshot = {
  available: boolean;
  radarUpdatedAt: number | null;
  radarProviderCount: number;
  radarDemoCount: number;
  topSetup:
    AnalystBriefSetup | null;
  topChange:
    AnalystBriefChange | null;
  catalyst:
    AnalystBriefCatalyst | null;
  watchCount: number;
  attention:
    AnalystAttentionQueue;
  modelHealth:
    AnalystModelHealth;
  performance: {
    engine: string | null;
    scope:
      | "current-engine"
      | "all-history";
    sampleStatus:
      | "insufficient"
      | "early"
      | "established"
      | null;
    currentEngineResolved: number;
    driftStatus:
      | "insufficient"
      | "stable"
      | "improving"
      | "watch"
      | "degrading";
    driftAccuracyDelta:
      number | null;
    driftBrierDelta:
      number | null;
    driftRecentSize: number;
    driftBaselineSize: number;
    reliabilityStatus:
      | "insufficient"
      | "good"
      | "watch"
      | "poor";
    reliabilityResolved: number;
    reliabilityEce:
      number | null;
    reliabilityMaxGap:
      number | null;
    accuracyLow95: number | null;
    accuracyHigh95: number | null;
    accuracy: number | null;
    resolved: number;
    correct: number;
    brier: number | null;
    pending: number;
    calibrationGap:
      number | null;
  };
};

function tolerance(
  value: number,
) {
  return Math.max(
    Math.abs(value) *
      0.0001,
    0.000001,
  );
}

function alertMatchesSpec(
  alert: AdvancedAlert,
  item: AnalystRadarItem,
  side: "bull" | "bear",
) {
  if (
    !alert.enabled ||
    alert.triggeredAt ||
    alert.symbol.id !==
      item.symbol.id
  ) {
    return false;
  }

  const spec =
    buildForecastWatchSpec(
      item.forecast,
      side,
    );

  if (!spec) {
    return false;
  }

  const epsilon =
    tolerance(spec.value);

  return alert.conditions.some(
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
  );
}

function watchedScenarioCount(
  alerts: AdvancedAlert[],
  radarItems:
    AnalystRadarItem[],
) {
  return alerts.filter(
    (alert) =>
      radarItems.some(
        (item) =>
          alertMatchesSpec(
            alert,
            item,
            "bull",
          ) ||
          alertMatchesSpec(
            alert,
            item,
            "bear",
          ),
      ),
  ).length;
}

function changePriority(
  delta: AnalystRadarDelta,
) {
  if (
    delta.change ===
    "reversal"
  ) {
    return 500 +
      Math.abs(
        delta.clarityDelta,
      );
  }

  if (
    delta.change ===
    "strengthening"
  ) {
    return 300 +
      Math.max(
        0,
        delta.clarityDelta,
      ) +
      Math.max(
        0,
        delta.probabilityDelta,
      ) *
        0.5;
  }

  if (
    delta.change ===
    "weakening"
  ) {
    return 200 +
      Math.abs(
        delta.clarityDelta,
      ) +
      Math.abs(
        delta.probabilityDelta,
      ) *
        0.5;
  }

  if (
    delta.change ===
    "new"
  ) {
    return 100;
  }

  return 0;
}

function topRadarChange(
  cache:
    AnalystRadarCache | null,
): AnalystBriefChange | null {
  if (
    !cache ||
    cache.previousItems.length ===
      0
  ) {
    return null;
  }

  const deltas =
    buildAnalystRadarDeltas(
      cache.items,
      cache.previousItems,
    )
      .filter(
        (delta) =>
          delta.change !==
          "stable",
      )
      .sort(
        (a, b) =>
          changePriority(b) -
          changePriority(a),
      );

  const delta =
    deltas[0];

  if (!delta) {
    return null;
  }

  const item =
    cache.items.find(
      (candidate) =>
        candidate.symbol.id ===
        delta.symbolId,
    );

  if (!item) {
    return null;
  }

  return {
    symbol:
      item.symbol,
    change:
      delta.change,
    previousDirection:
      delta.previousDirection,
    currentDirection:
      delta.currentDirection,
    probabilityDelta:
      delta.probabilityDelta,
    clarityDelta:
      delta.clarityDelta,
  };
}

function topCatalyst(
  radarItems:
    AnalystRadarItem[],
): AnalystBriefCatalyst | null {
  const candidates =
    radarItems
      .map((item) => ({
        item,
        catalyst:
          item.forecast
            .catalystImpact,
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          item:
            AnalystRadarItem;
          catalyst:
            NonNullable<
              AnalystForecastResponse[
                "catalystImpact"
              ]
            >;
        } =>
          Boolean(
            candidate.catalyst,
          ) &&
          candidate.catalyst
            ?.direction !==
            "neutral",
      )
      .sort(
        (a, b) =>
          Math.abs(
            b.catalyst.score *
              b.catalyst.weight,
          ) -
          Math.abs(
            a.catalyst.score *
              a.catalyst.weight,
          ),
      );

  const selected =
    candidates[0];

  if (!selected) {
    return null;
  }

  return {
    symbol:
      selected.item.symbol,
    direction:
      selected.catalyst
        .direction as
        | "positive"
        | "negative",
    score:
      selected.catalyst.score,
    weight:
      selected.catalyst.weight,
    latestSurprisePercent:
      selected.catalyst
        .latestSurprisePercent,
    sampleSize:
      selected.catalyst.sampleSize,
  };
}

export function buildAnalystBrief(
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
  },
): AnalystBriefSnapshot {
  const ranked =
    input.radarCache
      ? rankAnalystRadar(
          input.radarCache.items,
        )
      : [];

  const top =
    ranked[0] ?? null;
  const performance =
    buildForecastPerformance(
      input.journal,
    );
  const modelHealth =
    buildAnalystModelHealth(
      input.journal,
    );

  return {
    available:
      ranked.length > 0 ||
      performance.summary
        .providerResolved > 0 ||
      performance.summary
        .pending > 0,
    radarUpdatedAt:
      input.radarCache
        ?.updatedAt ?? null,
    radarProviderCount:
      ranked.filter(
        (item) =>
          item.forecast
            .dataMode ===
          "provider",
      ).length,
    radarDemoCount:
      ranked.filter(
        (item) =>
          item.forecast
            .dataMode ===
          "demo",
      ).length,
    topSetup:
      top
        ? {
            symbol:
              top.symbol,
            direction:
              top.direction,
            probability:
              top.directionProbability,
            confidence:
              top.confidence,
            clarity:
              top.clarity,
            risk:
              top.forecast.risk,
            provider:
              top.forecast
                .dataProvider,
            dataMode:
              top.forecast
                .dataMode,
          }
        : null,
    topChange:
      topRadarChange(
        input.radarCache,
      ),
    catalyst:
      topCatalyst(ranked),
    watchCount:
      watchedScenarioCount(
        input.alerts,
        ranked,
      ),
    attention:
      buildAnalystAttentionQueue({
        radarCache:
          input.radarCache,
        journal:
          input.journal,
        alerts:
          input.alerts,
        overview:
          input.overview,
        overviewMode:
          input.overviewMode,
      }),
    modelHealth,
    performance: {
      engine:
        performance
          .currentEnginePerformance
          ?.engine ??
        performance.currentEngine,
      scope:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? "current-engine"
          : "all-history",
      sampleStatus:
        performance
          .currentEnginePerformance
          ?.sampleStatus ??
        null,
      currentEngineResolved:
        performance
          .currentEnginePerformance
          ?.resolved ?? 0,
      driftStatus:
        performance.drift.status,
      driftAccuracyDelta:
        performance.drift
          .accuracyDelta,
      driftBrierDelta:
        performance.drift
          .brierDelta,
      driftRecentSize:
        performance.drift
          .recentSize,
      driftBaselineSize:
        performance.drift
          .baselineSize,
      reliabilityStatus:
        performance.reliability
          .status,
      reliabilityResolved:
        performance.reliability
          .resolved,
      reliabilityEce:
        performance.reliability
          .ece,
      reliabilityMaxGap:
        performance.reliability
          .maxGap,
      accuracyLow95:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.accuracyLow95 ??
            null
          : null,
      accuracyHigh95:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.accuracyHigh95 ??
            null
          : null,
      accuracy:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.accuracy ??
            null
          : performance.summary
              .providerAccuracy,
      resolved:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.resolved ?? 0
          : performance.summary
              .providerResolved,
      correct:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.correct ?? 0
          : performance.summary
              .providerCorrect,
      brier:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.brierScore ??
            null
          : performance.summary
              .providerBrierScore,
      pending:
        performance.summary
          .pending,
      calibrationGap:
        (
          performance
            .currentEnginePerformance
            ?.resolved ?? 0
        ) >= 5
          ? performance
              .currentEnginePerformance
              ?.calibrationGap ??
            null
          : performance
              .calibrationGap,
    },
  };
}
