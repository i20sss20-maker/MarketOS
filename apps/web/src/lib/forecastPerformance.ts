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

export type ForecastPerformanceReport = {
  summary:
    ReturnType<
      typeof summarizeForecastJournal
    >;
  providerRecords: number;
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
