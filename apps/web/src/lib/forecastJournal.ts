import type {
  AnalystForecastResponse,
  MarketSymbol,
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
  symbol?: MarketSymbol;
  engine?: string;
  generatedAt: number;
  dueAt: number;
  evaluationTimeframe?: Timeframe;
  evaluationBars?: number;
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
  evaluationMethod?:
    | "forecast"
    | "quote"
    | "horizon-candle"
    | "horizon-bars";
  evaluationDelaySeconds?: number;
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

function validTimeframe(
  value: unknown,
): value is Timeframe {
  return [
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
    "1w",
    "1M",
  ].includes(String(value));
}

function evaluationTimeframeFor(
  result:
    AnalystForecastResponse,
): Timeframe {
  if (result.calibration) {
    return result.calibration
      .timeframe;
  }

  if (
    result.symbol.assetClass ===
      "stock" ||
    result.symbol.assetClass ===
      "etf" ||
    result.symbol.assetClass ===
      "index"
  ) {
    return "1d";
  }

  return "4h";
}

function evaluationBarsFor(
  result:
    AnalystForecastResponse,
) {
  if (
    result.calibration &&
    Number.isFinite(
      result.calibration
        .lookaheadBars,
    )
  ) {
    return Math.max(
      1,
      Math.min(
        60,
        Math.floor(
          result.calibration
            .lookaheadBars,
        ),
      ),
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
    return 5;
  }

  return 6;
}

function evaluationToleranceSeconds(
  timeframe: Timeframe,
) {
  const tolerances: Record<
    Timeframe,
    number
  > = {
    "1m": 10 * 60,
    "5m": 30 * 60,
    "15m": 2 * 60 * 60,
    "1h": 8 * 60 * 60,
    "4h": 72 * 60 * 60,
    "1d": 5 * 24 * 60 * 60,
    "1w": 14 * 24 * 60 * 60,
    "1M": 45 * 24 * 60 * 60,
  };

  return tolerances[timeframe];
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
    engine:
      typeof item.engine ===
      "string"
        ? item.engine
            .trim()
            .slice(0, 120) ||
          undefined
        : undefined,
    symbol:
      item.symbol &&
      typeof item.symbol === "object" &&
      typeof item.symbol.id === "string" &&
      typeof item.symbol.ticker === "string" &&
      typeof item.symbol.name === "string" &&
      typeof item.symbol.exchange === "string" &&
      typeof item.symbol.assetClass === "string" &&
      typeof item.symbol.currency === "string"
        ? {
            id:
              item.symbol.id.slice(0, 160),
            ticker:
              item.symbol.ticker.slice(0, 80),
            name:
              item.symbol.name.slice(0, 180),
            exchange:
              item.symbol.exchange.slice(0, 100),
            assetClass:
              item.symbol.assetClass,
            currency:
              item.symbol.currency.slice(0, 20),
            providerSymbol:
              typeof item.symbol.providerSymbol === "string"
                ? item.symbol.providerSymbol.slice(0, 100)
                : undefined,
            micCode:
              typeof item.symbol.micCode === "string"
                ? item.symbol.micCode.slice(0, 20)
                : undefined,
            country:
              typeof item.symbol.country === "string"
                ? item.symbol.country.slice(0, 80)
                : undefined,
          }
        : undefined,
    generatedAt:
      Math.floor(item.generatedAt),
    dueAt:
      Math.floor(item.dueAt),
    evaluationTimeframe:
      validTimeframe(
        item.evaluationTimeframe,
      )
        ? item.evaluationTimeframe
        : undefined,
    evaluationBars:
      finite(
        item.evaluationBars,
      )
        ? Math.max(
            1,
            Math.min(
              60,
              Math.floor(
                item.evaluationBars,
              ),
            ),
          )
        : undefined,
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
    evaluationMethod:
      item.evaluationMethod ===
        "forecast" ||
      item.evaluationMethod ===
        "quote" ||
      item.evaluationMethod ===
        "horizon-candle" ||
      item.evaluationMethod ===
        "horizon-bars"
        ? item.evaluationMethod
        : undefined,
    evaluationDelaySeconds:
      finite(
        item.evaluationDelaySeconds,
      )
        ? Math.max(
            0,
            Math.floor(
              item.evaluationDelaySeconds,
            ),
          )
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
  if (import.meta.env?.VITE_MARKETOS_REQUIRE_REAL_DATA === "true") return [];
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
  if (import.meta.env?.VITE_MARKETOS_REQUIRE_REAL_DATA === "true") return;

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
    symbol:
      result.symbol,
    engine:
      result.engine,
    generatedAt:
      result.generatedAt,
    dueAt:
      forecastDueAt(result),
    evaluationTimeframe:
      evaluationTimeframeFor(
        result,
      ),
    evaluationBars:
      evaluationBarsFor(
        result,
      ),
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
    Boolean(
      record.evaluationTimeframe,
    ) ||
    record.symbolId !==
      result.symbol.id ||
    record.dueAt >
      result.generatedAt ||
    (
      record.dataMode ===
        "provider" &&
      result.dataMode !==
        "provider"
    )
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
    evaluationMethod:
      "forecast",
    evaluationDelaySeconds:
      Math.max(
        0,
        result.generatedAt -
          record.dueAt,
      ),
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

export function resolveForecastJournalWithPrice(
  current:
    ForecastJournalRecord[],
  input: {
    symbolId: string;
    price: number;
    timestamp: number;
    dataMode:
      "demo" | "provider";
  },
) {
  if (
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    !Number.isFinite(
      input.timestamp,
    )
  ) {
    return current;
  }

  return current.map(
    (record) => {
      if (
        record.status !==
          "pending" ||
        Boolean(
          record.evaluationTimeframe,
        ) ||
        record.symbolId !==
          input.symbolId ||
        record.dueAt >
          input.timestamp ||
        record.dataMode !==
          input.dataMode
      ) {
        return record;
      }

      const realizedReturnPercent =
        record.referencePrice === 0
          ? 0
          : (
              (
                input.price -
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
        status:
          "resolved" as const,
        evaluatedAt:
          Math.floor(
            input.timestamp,
          ),
        evaluationPrice:
          input.price,
        evaluationMethod:
          "quote" as const,
        evaluationDelaySeconds:
          Math.max(
            0,
            Math.floor(
              input.timestamp -
                record.dueAt,
            ),
          ),
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
    },
  );
}

export function maturedForecastSymbols(
  records:
    ForecastJournalRecord[],
  timestamp: number,
  dataMode:
    "demo" | "provider",
) {
  const unique =
    new Map<
      string,
      MarketSymbol
    >();

  for (const record of records) {
    if (
      record.status !==
        "pending" ||
      Boolean(
        record.evaluationTimeframe,
      ) ||
      record.dataMode !==
        dataMode ||
      record.dueAt >
        timestamp ||
      !record.symbol
    ) {
      continue;
    }

    unique.set(
      record.symbol.id,
      record.symbol,
    );
  }

  return [
    ...unique.values(),
  ];
}

export type MaturedForecastGroup = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
};

export function maturedForecastGroups(
  records:
    ForecastJournalRecord[],
  timestamp: number,
  dataMode:
    "demo" | "provider",
) {
  const groups =
    new Map<
      string,
      MaturedForecastGroup
    >();

  for (const record of records) {
    if (
      record.status !==
        "pending" ||
      record.dataMode !==
        dataMode ||
      record.dueAt >
        timestamp ||
      !record.symbol ||
      !record.evaluationTimeframe
    ) {
      continue;
    }

    const key =
      record.symbol.id +
      "|" +
      record.evaluationTimeframe;

    groups.set(key, {
      symbol:
        record.symbol,
      timeframe:
        record.evaluationTimeframe,
    });
  }

  return [
    ...groups.values(),
  ];
}

export function resolveForecastJournalWithCandles(
  current:
    ForecastJournalRecord[],
  input: {
    symbolId: string;
    timeframe: Timeframe;
    candles: Array<{
      time: number;
      close: number;
    }>;
    dataMode:
      "demo" | "provider";
  },
) {
  const candles =
    input.candles
      .filter(
        (candle) =>
          Number.isFinite(
            candle.time,
          ) &&
          Number.isFinite(
            candle.close,
          ) &&
          candle.close > 0,
      )
      .sort(
        (a, b) =>
          a.time - b.time,
      );

  if (candles.length === 0) {
    return current;
  }

  const tolerance =
    evaluationToleranceSeconds(
      input.timeframe,
    );

  return current.map(
    (record) => {
      if (
        record.status !==
          "pending" ||
        record.symbolId !==
          input.symbolId ||
        record.dataMode !==
          input.dataMode ||
        record.evaluationTimeframe !==
          input.timeframe
      ) {
        return record;
      }

      let candle:
        | {
            time: number;
            close: number;
          }
        | undefined;
      let evaluationMethod:
        | "horizon-bars"
        | "horizon-candle" =
        "horizon-candle";

      if (
        record.evaluationBars !==
        undefined
      ) {
        let anchorIndex = -1;

        for (
          let index = 0;
          index < candles.length;
          index += 1
        ) {
          if (
            candles[index].time <=
            record.generatedAt
          ) {
            anchorIndex =
              index;
          } else {
            break;
          }
        }

        if (anchorIndex >= 0) {
          const targetIndex =
            anchorIndex +
            record.evaluationBars;

          if (
            targetIndex <
            candles.length
          ) {
            candle =
              candles[
                targetIndex
              ];
            evaluationMethod =
              "horizon-bars";
          }
        }
      } else {
        candle =
          candles.find(
            (item) =>
              item.time >=
                record.dueAt &&
              item.time -
                record.dueAt <=
                tolerance,
          );
      }

      if (!candle) {
        return record;
      }

      const realizedReturnPercent =
        record.referencePrice === 0
          ? 0
          : (
              (
                candle.close -
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
        status:
          "resolved" as const,
        evaluatedAt:
          Math.floor(
            candle.time,
          ),
        evaluationPrice:
          candle.close,
        evaluationMethod,
        evaluationDelaySeconds:
          Math.max(
            0,
            Math.floor(
              candle.time -
                record.dueAt,
            ),
          ),
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
    },
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
