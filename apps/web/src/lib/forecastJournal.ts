import type {
  AnalystForecastResponse,
  Timeframe,
} from "@marketos/market-core";

export type ForecastOutcome =
  | "bull"
  | "base"
  | "bear";

export type ForecastJournalRecord = {
  id: string;
  symbolId: string;
  ticker: string;
  generatedAt: number;
  dueAt: number;
  referencePrice: number;
  confidence: number;
  dataMode: "demo" | "provider";
  expectedOutcome: ForecastOutcome;
  expectedProbability: number;
  probabilities: {
    bull: number;
    base: number;
    bear: number;
  };
  thresholdPercent: number;
  status: "pending" | "resolved";
  evaluatedAt?: number;
  evaluationPrice?: number;
  realizedReturnPercent?: number;
  realizedOutcome?: ForecastOutcome;
  correct?: boolean;
};

export type ForecastJournalSummary = {
  pending: number;
  resolved: number;
  providerResolved: number;
  providerCorrect: number;
  providerAccuracy: number | null;
  providerBrierScore: number | null;
};

const STORAGE_KEY =
  "marketos:forecast-journal";
export const MAX_FORECAST_JOURNAL_RECORDS =
  120;

function storage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function finite(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

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
  return (
    Math.round(value * factor) /
    factor
  );
}

function timeframeSeconds(
  timeframe: Timeframe,
) {
  const map: Record<
    Timeframe,
    number
  > = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1M": 30 * 24 * 60 * 60,
  };

  return map[timeframe];
}

function normalizeOutcome(
  value: unknown,
): ForecastOutcome | null {
  return (
    value === "bull" ||
    value === "base" ||
    value === "bear"
  )
    ? value
    : null;
}

function normalizeRecord(
  value: unknown,
): ForecastJournalRecord | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const item =
    value as Partial<
      ForecastJournalRecord
    >;

  const expectedOutcome =
    normalizeOutcome(
      item.expectedOutcome,
    );

  if (
    typeof item.id !== "string" ||
    typeof item.symbolId !== "string" ||
    typeof item.ticker !== "string" ||
    !finite(item.generatedAt) ||
    !finite(item.dueAt) ||
    !finite(item.referencePrice) ||
    !finite(item.confidence) ||
    !expectedOutcome ||
    (
      item.dataMode !== "demo" &&
      item.dataMode !== "provider"
    ) ||
    (
      item.status !== "pending" &&
      item.status !== "resolved"
    ) ||
    !item.probabilities ||
    !finite(
      item.probabilities.bull,
    ) ||
    !finite(
      item.probabilities.base,
    ) ||
    !finite(
      item.probabilities.bear,
    ) ||
    !finite(
      item.expectedProbability,
    ) ||
    !finite(
      item.thresholdPercent,
    )
  ) {
    return null;
  }

  const realizedOutcome =
    item.realizedOutcome ===
    undefined
      ? undefined
      : normalizeOutcome(
          item.realizedOutcome,
        ) ?? undefined;

  return {
    id: item.id.slice(0, 220),
    symbolId:
      item.symbolId.slice(0, 160),
    ticker:
      item.ticker.slice(0, 80),
    generatedAt:
      Math.floor(item.generatedAt),
    dueAt:
      Math.floor(item.dueAt),
    referencePrice:
      item.referencePrice,
    confidence:
      clamp(
        Math.round(item.confidence),
        0,
        100,
      ),
    dataMode: item.dataMode,
    expectedOutcome,
    expectedProbability:
      clamp(
        Math.round(
          item.expectedProbability,
        ),
        0,
        100,
      ),
    probabilities: {
      bull:
        clamp(
          Math.round(
            item.probabilities.bull,
          ),
          0,
          100,
        ),
      base:
        clamp(
          Math.round(
            item.probabilities.base,
          ),
          0,
          100,
        ),
      bear:
        clamp(
          Math.round(
            item.probabilities.bear,
          ),
          0,
          100,
        ),
    },
    thresholdPercent:
      clamp(
        item.thresholdPercent,
        0.05,
        20,
      ),
    status: item.status,
    evaluatedAt:
      finite(item.evaluatedAt)
        ? Math.floor(
            item.evaluatedAt,
          )
        : undefined,
    evaluationPrice:
      finite(
        item.evaluationPrice,
      )
        ? item.evaluationPrice
        : undefined,
    realizedReturnPercent:
      finite(
        item.realizedReturnPercent,
      )
        ? item.realizedReturnPercent
        : undefined,
    realizedOutcome,
    correct:
      typeof item.correct ===
      "boolean"
        ? item.correct
        : undefined,
  };
}

export function loadForecastJournal():
ForecastJournalRecord[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw =
      store.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed =
      JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeRecord)
      .filter(
        (
          item,
        ): item is ForecastJournalRecord =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b.generatedAt -
          a.generatedAt,
      )
      .slice(
        0,
        MAX_FORECAST_JOURNAL_RECORDS,
      );
  } catch {
    return [];
  }
}

export function saveForecastJournal(
  records:
    ForecastJournalRecord[],
) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify(
        records
          .map(normalizeRecord)
          .filter(
            (
              item,
            ): item is ForecastJournalRecord =>
              item !== null,
          )
          .sort(
            (a, b) =>
              b.generatedAt -
              a.generatedAt,
          )
          .slice(
            0,
            MAX_FORECAST_JOURNAL_RECORDS,
          ),
      ),
    );
  } catch {
    // Ignore restricted storage.
  }
}

function forecastDueAt(
  result:
    AnalystForecastResponse,
) {
  if (result.calibration) {
    return (
      result.generatedAt +
      timeframeSeconds(
        result.calibration.timeframe,
      ) *
        result.calibration
          .lookaheadBars
    );
  }

  if (
    result.symbol.assetClass ===
      "stock" ||
    result.symbol.assetClass ===
      "etf" ||
    result.symbol.assetClass ===
      "index"
  ) {
    return (
      result.generatedAt +
      5 * 24 * 60 * 60
    );
  }

  return (
    result.generatedAt +
    3 * 24 * 60 * 60
  );
}

function topScenario(
  result:
    AnalystForecastResponse,
) {
  return [...result.scenarios].sort(
    (a, b) =>
      b.probability -
      a.probability,
  )[0];
}

function scenarioProbabilities(
  result:
    AnalystForecastResponse,
) {
  return {
    bull:
      result.scenarios.find(
        (item) =>
          item.id === "bull",
      )?.probability ?? 0,
    base:
      result.scenarios.find(
        (item) =>
          item.id === "base",
      )?.probability ?? 0,
    bear:
      result.scenarios.find(
        (item) =>
          item.id === "bear",
      )?.probability ?? 0,
  };
}

function thresholdFor(
  result:
    AnalystForecastResponse,
) {
  return (
    result.calibration
      ?.outcomeThresholdPercent ??
    1
  );
}

function createRecord(
  result:
    AnalystForecastResponse,
): ForecastJournalRecord {
  const scenario =
    topScenario(result);

  return {
    id:
      result.symbol.id +
      ":" +
      result.generatedAt,
    symbolId:
      result.symbol.id,
    ticker:
      result.symbol.ticker,
    generatedAt:
      result.generatedAt,
    dueAt:
      forecastDueAt(result),
    referencePrice:
      result.referencePrice,
    confidence:
      result.confidence,
    dataMode:
      result.dataMode,
    expectedOutcome:
      scenario.id,
    expectedProbability:
      scenario.probability,
    probabilities:
      scenarioProbabilities(
        result,
      ),
    thresholdPercent:
      thresholdFor(result),
    status: "pending",
  };
}

function classifyOutcome(
  returnPercent: number,
  thresholdPercent: number,
): ForecastOutcome {
  if (
    returnPercent >
    thresholdPercent
  ) {
    return "bull";
  }

  if (
    returnPercent <
    -thresholdPercent
  ) {
    return "bear";
  }

  return "base";
}

function resolveAgainst(
  record:
    ForecastJournalRecord,
  result:
    AnalystForecastResponse,
): ForecastJournalRecord {
  if (
    record.status !== "pending" ||
    record.symbolId !==
      result.symbol.id ||
    record.dueAt >
      result.generatedAt
  ) {
    return record;
  }

  const realizedReturnPercent =
    record.referencePrice === 0
      ? 0
      : (
          (
            result.referencePrice -
            record.referencePrice
          ) /
          record.referencePrice
        ) *
        100;

  const realizedOutcome =
    classifyOutcome(
      realizedReturnPercent,
      record.thresholdPercent,
    );

  return {
    ...record,
    status: "resolved",
    evaluatedAt:
      result.generatedAt,
    evaluationPrice:
      result.referencePrice,
    realizedReturnPercent:
      round(
        realizedReturnPercent,
        2,
      ),
    realizedOutcome,
    correct:
      realizedOutcome ===
      record.expectedOutcome,
  };
}

export function updateForecastJournal(
  current:
    ForecastJournalRecord[],
  result:
    AnalystForecastResponse,
) {
  let next =
    current
      .map(
        (record) =>
          resolveAgainst(
            record,
            result,
          ),
      )
      .map(normalizeRecord)
      .filter(
        (
          item,
        ): item is ForecastJournalRecord =>
          item !== null,
      );

  const id =
    result.symbol.id +
    ":" +
    result.generatedAt;

  if (
    !next.some(
      (record) =>
        record.id === id,
    )
  ) {
    next = [
      createRecord(result),
      ...next,
    ];
  }

  return next
    .sort(
      (a, b) =>
        b.generatedAt -
        a.generatedAt,
    )
    .slice(
      0,
      MAX_FORECAST_JOURNAL_RECORDS,
    );
}

function brierScore(
  record:
    ForecastJournalRecord,
) {
  if (
    record.status !== "resolved" ||
    !record.realizedOutcome
  ) {
    return null;
  }

  const probabilities = {
    bull:
      record.probabilities.bull /
      100,
    base:
      record.probabilities.base /
      100,
    bear:
      record.probabilities.bear /
      100,
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

export function summarizeForecastJournal(
  records:
    ForecastJournalRecord[],
): ForecastJournalSummary {
  const pending =
    records.filter(
      (item) =>
        item.status === "pending",
    ).length;
  const resolvedRecords =
    records.filter(
      (item) =>
        item.status === "resolved",
    );
  const providerResolved =
    resolvedRecords.filter(
      (item) =>
        item.dataMode ===
        "provider",
    );
  const providerCorrect =
    providerResolved.filter(
      (item) =>
        item.correct === true,
    ).length;

  const scores =
    providerResolved
      .map(brierScore)
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  return {
    pending,
    resolved:
      resolvedRecords.length,
    providerResolved:
      providerResolved.length,
    providerCorrect,
    providerAccuracy:
      providerResolved.length > 0
        ? Math.round(
            (
              providerCorrect /
              providerResolved.length
            ) *
              100,
          )
        : null,
    providerBrierScore:
      scores.length > 0
        ? round(
            scores.reduce(
              (
                sum,
                value,
              ) =>
                sum + value,
              0,
            ) /
              scores.length,
            3,
          )
        : null,
  };
}
