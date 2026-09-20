import type {
  ForecastJournalRecord,
  ForecastOutcome,
} from "./forecastJournal";
import {
  summarizeForecastJournal,
} from "./forecastJournal";

export type ForecastPerformanceDirection = {
  outcome: ForecastOutcome;
  resolved: number;
  correct: number;
  accuracy: number | null;
  averageProbability: number | null;
  averageReturn: number | null;
};

export type ForecastPerformanceBucket = {
  id: string;
  label: string;
  min: number;
  max: number;
  resolved: number;
  correct: number;
  accuracy: number | null;
  averageConfidence: number | null;
};

export type ForecastPerformanceSymbol = {
  symbolId: string;
  ticker: string;
  resolved: number;
  correct: number;
  accuracy: number;
  averageReturn: number;
};

export type ForecastPerformanceSampleStatus =
  | "insufficient"
  | "early"
  | "established";

export type ForecastPerformanceEngine = {
  engine: string;
  resolved: number;
  correct: number;
  accuracy: number | null;
  accuracyLow95: number | null;
  accuracyHigh95: number | null;
  sampleStatus:
    ForecastPerformanceSampleStatus;
  brierScore: number | null;
  averageExpectedProbability:
    number | null;
  calibrationGap:
    number | null;
  lastEvaluatedAt: number;
  isCurrent: boolean;
};

export type ForecastPerformanceDriftStatus =
  | "insufficient"
  | "stable"
  | "improving"
  | "watch"
  | "degrading";

export type ForecastPerformanceDrift = {
  engine: string | null;
  status:
    ForecastPerformanceDriftStatus;
  recentSize: number;
  baselineSize: number;
  recentAccuracy: number | null;
  baselineAccuracy: number | null;
  accuracyDelta: number | null;
  recentBrier: number | null;
  baselineBrier: number | null;
  brierDelta: number | null;
  recentCalibrationGap:
    number | null;
  baselineCalibrationGap:
    number | null;
  calibrationGapDelta:
    number | null;
  reason: string[];
};

export type ForecastPerformanceReport = {
  summary:
    ReturnType<
      typeof summarizeForecastJournal
    >;
  providerRecords: number;
  currentEngine: string | null;
  currentEnginePerformance:
    ForecastPerformanceEngine | null;
  engines:
    ForecastPerformanceEngine[];
  drift:
    ForecastPerformanceDrift;
  averageExpectedProbability:
    number | null;
  calibrationGap:
    number | null;
  currentStreak: number;
  bestStreak: number;
  directions:
    ForecastPerformanceDirection[];
  confidenceBuckets:
    ForecastPerformanceBucket[];
  symbols:
    ForecastPerformanceSymbol[];
  recent:
    ForecastJournalRecord[];
};

function round(
  value: number,
  decimals = 1,
) {
  const factor = 10 ** decimals;
  return (
    Math.round(value * factor) /
    factor
  );
}

function average(
  values: number[],
) {
  if (values.length === 0) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    values.length
  );
}

function accuracy(
  correct: number,
  total: number,
) {
  return total > 0
    ? Math.round(
        (correct / total) *
          100,
      )
    : null;
}

function sampleStatus(
  total: number,
): ForecastPerformanceSampleStatus {
  if (total < 5) {
    return "insufficient";
  }

  if (total < 20) {
    return "early";
  }

  return "established";
}

function wilsonInterval95(
  correct: number,
  total: number,
) {
  if (total <= 0) {
    return {
      low: null,
      high: null,
    };
  }

  const z = 1.96;
  const p =
    correct / total;
  const z2 =
    z * z;
  const denominator =
    1 + z2 / total;
  const center =
    (
      p +
      z2 /
        (2 * total)
    ) /
    denominator;
  const margin =
    (
      z *
      Math.sqrt(
        (
          p *
            (1 - p) /
            total
        ) +
          z2 /
            (
              4 *
              total *
              total
            ),
      )
    ) /
    denominator;

  return {
    low:
      Math.round(
        Math.max(
          0,
          center - margin,
        ) * 100,
      ),
    high:
      Math.round(
        Math.min(
          1,
          center + margin,
        ) * 100,
      ),
  };
}

function recordBrierScore(
  record:
    ForecastJournalRecord,
) {
  if (
    record.status !==
      "resolved" ||
    !record.realizedOutcome
  ) {
    return null;
  }

  const probabilities = {
    bull:
      record.probabilities
        .bull / 100,
    base:
      record.probabilities
        .base / 100,
    bear:
      record.probabilities
        .bear / 100,
  };

  const outcomes = {
    bull:
      record.realizedOutcome ===
      "bull"
        ? 1
        : 0,
    base:
      record.realizedOutcome ===
      "base"
        ? 1
        : 0,
    bear:
      record.realizedOutcome ===
      "bear"
        ? 1
        : 0,
  };

  return (
    (
      probabilities.bull -
      outcomes.bull
    ) ** 2 +
    (
      probabilities.base -
      outcomes.base
    ) ** 2 +
    (
      probabilities.bear -
      outcomes.bear
    ) ** 2
  );
}

function engineLabel(
  record:
    ForecastJournalRecord,
) {
  return (
    record.engine?.trim() ||
    "legacy"
  );
}

function currentEngineFrom(
  records:
    ForecastJournalRecord[],
) {
  const newest =
    records
      .filter(
        (record) =>
          record.dataMode ===
            "provider" &&
          Boolean(
            record.engine
              ?.trim(),
          ),
      )
      .sort(
        (a, b) =>
          b.generatedAt -
          a.generatedAt,
      )[0];

  return (
    newest?.engine?.trim() ??
    null
  );
}

function enginePerformance(
  records:
    ForecastJournalRecord[],
  currentEngine: string | null,
): ForecastPerformanceEngine[] {
  const groups =
    new Map<
      string,
      ForecastJournalRecord[]
    >();

  for (const record of records) {
    const engine =
      engineLabel(record);
    const group =
      groups.get(engine) ?? [];

    group.push(record);
    groups.set(
      engine,
      group,
    );
  }

  return [
    ...groups.entries(),
  ]
    .map(
      ([engine, items]) => {
        const correct =
          items.filter(
            (item) =>
              item.correct ===
              true,
          ).length;
        const observed =
          accuracy(
            correct,
            items.length,
          );
        const interval =
          wilsonInterval95(
            correct,
            items.length,
          );
        const expected =
          average(
            items.map(
              (item) =>
                item.expectedProbability,
            ),
          );
        const brierValues =
          items
            .map(
              recordBrierScore,
            )
            .filter(
              (
                value,
              ): value is number =>
                value !== null,
            );
        const brier =
          average(
            brierValues,
          );

        return {
          engine,
          resolved:
            items.length,
          correct,
          accuracy:
            observed,
          accuracyLow95:
            interval.low,
          accuracyHigh95:
            interval.high,
          sampleStatus:
            sampleStatus(
              items.length,
            ),
          brierScore:
            brier === null
              ? null
              : round(
                  brier,
                  3,
                ),
          averageExpectedProbability:
            expected === null
              ? null
              : round(
                  expected,
                  1,
                ),
          calibrationGap:
            expected === null ||
            observed === null
              ? null
              : round(
                  observed -
                    expected,
                  1,
                ),
          lastEvaluatedAt:
            Math.max(
              ...items.map(
                (item) =>
                  item.evaluatedAt ??
                  item.generatedAt,
              ),
            ),
          isCurrent:
            currentEngine !== null &&
            engine ===
              currentEngine,
        };
      },
    )
    .sort(
      (a, b) =>
        Number(
          b.isCurrent,
        ) -
          Number(
            a.isCurrent,
          ) ||
        b.lastEvaluatedAt -
          a.lastEvaluatedAt,
    );
}

function performanceWindow(
  records:
    ForecastJournalRecord[],
) {
  const correct =
    records.filter(
      (record) =>
        record.correct ===
        true,
    ).length;
  const observed =
    accuracy(
      correct,
      records.length,
    );
  const expected =
    average(
      records.map(
        (record) =>
          record.expectedProbability,
      ),
    );
  const brierValues =
    records
      .map(
        recordBrierScore,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );
  const brier =
    average(brierValues);

  return {
    size:
      records.length,
    accuracy:
      observed,
    brier:
      brier === null
        ? null
        : round(
            brier,
            3,
          ),
    calibrationGap:
      expected === null ||
      observed === null
        ? null
        : round(
            observed -
              expected,
            1,
          ),
  };
}

function buildPerformanceDrift(
  records:
    ForecastJournalRecord[],
  currentEngine: string | null,
): ForecastPerformanceDrift {
  if (!currentEngine) {
    return {
      engine: null,
      status:
        "insufficient",
      recentSize: 0,
      baselineSize: 0,
      recentAccuracy: null,
      baselineAccuracy: null,
      accuracyDelta: null,
      recentBrier: null,
      baselineBrier: null,
      brierDelta: null,
      recentCalibrationGap: null,
      baselineCalibrationGap: null,
      calibrationGapDelta: null,
      reason: [
        "لا يوجد محرك حالي قابل للمقارنة.",
      ],
    };
  }

  const current =
    records
      .filter(
        (record) =>
          engineLabel(
            record,
          ) === currentEngine,
      )
      .sort(
        (a, b) =>
          (
            b.evaluatedAt ??
            b.generatedAt
          ) -
          (
            a.evaluatedAt ??
            a.generatedAt
          ),
      );

  if (current.length < 12) {
    return {
      engine:
        currentEngine,
      status:
        "insufficient",
      recentSize:
        Math.min(
          6,
          current.length,
        ),
      baselineSize:
        Math.max(
          0,
          current.length -
            Math.min(
              6,
              current.length,
            ),
        ),
      recentAccuracy: null,
      baselineAccuracy: null,
      accuracyDelta: null,
      recentBrier: null,
      baselineBrier: null,
      brierDelta: null,
      recentCalibrationGap: null,
      baselineCalibrationGap: null,
      calibrationGapDelta: null,
      reason: [
        `يلزم 12 نتيجة محسومة على الأقل؛ المتاح ${current.length}.`,
      ],
    };
  }

  const recentSize =
    Math.min(
      10,
      Math.max(
        6,
        Math.floor(
          current.length / 2,
        ),
      ),
    );
  const baselineSize =
    Math.min(
      20,
      current.length -
        recentSize,
    );

  const recent =
    performanceWindow(
      current.slice(
        0,
        recentSize,
      ),
    );
  const baseline =
    performanceWindow(
      current.slice(
        recentSize,
        recentSize +
          baselineSize,
      ),
    );

  const accuracyDelta =
    recent.accuracy === null ||
    baseline.accuracy === null
      ? null
      : round(
          recent.accuracy -
            baseline.accuracy,
          1,
        );
  const brierDelta =
    recent.brier === null ||
    baseline.brier === null
      ? null
      : round(
          recent.brier -
            baseline.brier,
          3,
        );
  const calibrationGapDelta =
    recent.calibrationGap ===
      null ||
    baseline.calibrationGap ===
      null
      ? null
      : round(
          Math.abs(
            recent.calibrationGap,
          ) -
            Math.abs(
              baseline.calibrationGap,
            ),
          1,
        );

  const reasons: string[] =
    [];
  let status:
    ForecastPerformanceDriftStatus =
    "stable";

  const severeAccuracy =
    accuracyDelta !== null &&
    accuracyDelta <= -30;
  const severeBrier =
    brierDelta !== null &&
    brierDelta >= 0.15;
  const combinedDegrade =
    accuracyDelta !== null &&
    accuracyDelta <= -20 &&
    brierDelta !== null &&
    brierDelta >= 0.05;

  if (
    severeAccuracy ||
    severeBrier ||
    combinedDegrade
  ) {
    status =
      "degrading";

    if (accuracyDelta !== null) {
      reasons.push(
        `الدقة الحديثة ${accuracyDelta} نقطة مقابل خط الأساس.`,
      );
    }
    if (brierDelta !== null) {
      reasons.push(
        `Brier تغيّر ${brierDelta > 0 ? "+" : ""}${brierDelta}؛ الارتفاع أسوأ.`,
      );
    }
  } else {
    const watchAccuracy =
      accuracyDelta !== null &&
      accuracyDelta <= -10;
    const watchBrier =
      brierDelta !== null &&
      brierDelta >= 0.08;
    const watchCalibration =
      calibrationGapDelta !==
        null &&
      calibrationGapDelta >=
        15;

    const improving =
      accuracyDelta !== null &&
      accuracyDelta >= 10 &&
      brierDelta !== null &&
      brierDelta <= -0.05;

    if (improving) {
      status =
        "improving";
      reasons.push(
        `الدقة الحديثة أفضل بـ ${accuracyDelta} نقطة مع تحسن Brier.`,
      );
    } else if (
      watchAccuracy ||
      watchBrier ||
      watchCalibration
    ) {
      status = "watch";

      if (watchAccuracy) {
        reasons.push(
          `الدقة الحديثة أقل بـ ${Math.abs(
            accuracyDelta ?? 0,
          )} نقطة.`,
        );
      }
      if (watchBrier) {
        reasons.push(
          `Brier الحديث أعلى بـ ${brierDelta}.`,
        );
      }
      if (watchCalibration) {
        reasons.push(
          `فجوة المعايرة اتسعت بـ ${calibrationGapDelta} نقطة.`,
        );
      }
    } else {
      reasons.push(
        "لا يظهر انحراف جوهري بين النافذة الحديثة وخط الأساس.",
      );
    }
  }

  return {
    engine:
      currentEngine,
    status,
    recentSize:
      recent.size,
    baselineSize:
      baseline.size,
    recentAccuracy:
      recent.accuracy,
    baselineAccuracy:
      baseline.accuracy,
    accuracyDelta,
    recentBrier:
      recent.brier,
    baselineBrier:
      baseline.brier,
    brierDelta,
    recentCalibrationGap:
      recent.calibrationGap,
    baselineCalibrationGap:
      baseline.calibrationGap,
    calibrationGapDelta,
    reason:
      reasons.slice(0, 3),
  };
}

function providerResolved(
  records:
    ForecastJournalRecord[],
) {
  return records
    .filter(
      (record) =>
        record.dataMode ===
          "provider" &&
        record.status ===
          "resolved" &&
        typeof record.correct ===
          "boolean",
    )
    .sort(
      (a, b) =>
        (b.evaluatedAt ??
          b.generatedAt) -
        (a.evaluatedAt ??
          a.generatedAt),
    );
}

function directionReport(
  records:
    ForecastJournalRecord[],
  outcome: ForecastOutcome,
): ForecastPerformanceDirection {
  const selected =
    records.filter(
      (record) =>
        record.expectedOutcome ===
        outcome,
    );

  const correct =
    selected.filter(
      (record) =>
        record.correct === true,
    ).length;

  const probabilities =
    selected.map(
      (record) =>
        record.expectedProbability,
    );

  const returns =
    selected
      .map(
        (record) =>
          record.realizedReturnPercent,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== undefined,
      );

  const averageProbability =
    average(probabilities);
  const averageReturn =
    average(returns);

  return {
    outcome,
    resolved:
      selected.length,
    correct,
    accuracy:
      accuracy(
        correct,
        selected.length,
      ),
    averageProbability:
      averageProbability === null
        ? null
        : round(
            averageProbability,
            1,
          ),
    averageReturn:
      averageReturn === null
        ? null
        : round(
            averageReturn,
            2,
          ),
  };
}

const bucketDefinitions = [
  {
    id: "lt55",
    label: "<55%",
    min: 0,
    max: 54,
  },
  {
    id: "55-64",
    label: "55–64%",
    min: 55,
    max: 64,
  },
  {
    id: "65-74",
    label: "65–74%",
    min: 65,
    max: 74,
  },
  {
    id: "75plus",
    label: "75%+",
    min: 75,
    max: 100,
  },
] as const;

function confidenceBuckets(
  records:
    ForecastJournalRecord[],
): ForecastPerformanceBucket[] {
  return bucketDefinitions.map(
    (bucket) => {
      const selected =
        records.filter(
          (record) =>
            record.confidence >=
              bucket.min &&
            record.confidence <=
              bucket.max,
        );
      const correct =
        selected.filter(
          (record) =>
            record.correct ===
            true,
        ).length;
      const avg =
        average(
          selected.map(
            (record) =>
              record.confidence,
          ),
        );

      return {
        ...bucket,
        resolved:
          selected.length,
        correct,
        accuracy:
          accuracy(
            correct,
            selected.length,
          ),
        averageConfidence:
          avg === null
            ? null
            : round(avg, 1),
      };
    },
  );
}

function symbolPerformance(
  records:
    ForecastJournalRecord[],
): ForecastPerformanceSymbol[] {
  const groups =
    new Map<
      string,
      ForecastJournalRecord[]
    >();

  for (const record of records) {
    const group =
      groups.get(
        record.symbolId,
      ) ?? [];

    group.push(record);
    groups.set(
      record.symbolId,
      group,
    );
  }

  return [
    ...groups.entries(),
  ]
    .map(
      ([symbolId, items]) => {
        const correct =
          items.filter(
            (item) =>
              item.correct ===
              true,
          ).length;
        const returns =
          items
            .map(
              (item) =>
                item.realizedReturnPercent,
            )
            .filter(
              (
                value,
              ): value is number =>
                value !==
                undefined,
            );
        const avgReturn =
          average(returns);

        return {
          symbolId,
          ticker:
            items[0]
              ?.ticker ??
            symbolId,
          resolved:
            items.length,
          correct,
          accuracy:
            accuracy(
              correct,
              items.length,
            ) ?? 0,
          averageReturn:
            avgReturn === null
              ? 0
              : round(
                  avgReturn,
                  2,
                ),
        };
      },
    )
    .sort(
      (a, b) =>
        b.resolved -
          a.resolved ||
        b.accuracy -
          a.accuracy ||
        a.ticker.localeCompare(
          b.ticker,
        ),
    )
    .slice(0, 8);
}

function streaks(
  records:
    ForecastJournalRecord[],
) {
  let current = 0;
  let best = 0;
  let running = 0;

  for (
    let index = 0;
    index < records.length;
    index += 1
  ) {
    if (
      records[index]
        .correct === true
    ) {
      running += 1;
      best = Math.max(
        best,
        running,
      );

      if (index === current) {
        current += 1;
      }
    } else {
      running = 0;
    }
  }

  return {
    current,
    best,
  };
}

export function buildForecastPerformance(
  records:
    ForecastJournalRecord[],
): ForecastPerformanceReport {
  const resolved =
    providerResolved(records);
  const summary =
    summarizeForecastJournal(
      records,
    );
  const currentEngine =
    currentEngineFrom(
      records,
    );
  const engines =
    enginePerformance(
      resolved,
      currentEngine,
    );
  const currentEnginePerformance =
    currentEngine === null
      ? null
      : engines.find(
          (item) =>
            item.engine ===
            currentEngine,
        ) ?? null;
  const drift =
    buildPerformanceDrift(
      resolved,
      currentEngine,
    );
  const expected =
    average(
      resolved.map(
        (record) =>
          record.expectedProbability,
      ),
    );
  const observed =
    summary.providerAccuracy;
  const streak =
    streaks(resolved);

  return {
    summary,
    providerRecords:
      resolved.length,
    currentEngine,
    currentEnginePerformance,
    engines,
    drift,
    averageExpectedProbability:
      expected === null
        ? null
        : round(
            expected,
            1,
          ),
    calibrationGap:
      expected === null ||
      observed === null
        ? null
        : round(
            observed -
              expected,
            1,
          ),
    currentStreak:
      streak.current,
    bestStreak:
      streak.best,
    directions: [
      directionReport(
        resolved,
        "bull",
      ),
      directionReport(
        resolved,
        "base",
      ),
      directionReport(
        resolved,
        "bear",
      ),
    ],
    confidenceBuckets:
      confidenceBuckets(
        resolved,
      ),
    symbols:
      symbolPerformance(
        resolved,
      ),
    recent:
      resolved.slice(0, 10),
  };
}
