import type {
  Candle,
  MarketDataPolicy,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import {
  ProductionGateError,
} from "../production/policy.js";

const MAX_FUTURE_SECONDS = 300;
const CLOSED_MARKET_MAX_AGE_SECONDS =
  10 * 24 * 60 * 60;

const timeframeSeconds:
  Partial<Record<Timeframe, number>> = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "2h": 2 * 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1M": 31 * 24 * 60 * 60,
  };

function fail(
  code:
    | "INVALID_MARKET_EVIDENCE"
    | "STALE_MARKET_EVIDENCE",
  message: string,
): never {
  throw new ProductionGateError(
    code,
    message,
    502,
  );
}

function assertTimestamp(
  value: number,
  label: string,
  nowSeconds: number,
) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value >
      nowSeconds +
        MAX_FUTURE_SECONDS
  ) {
    fail(
      "INVALID_MARKET_EVIDENCE",
      `${label} has an invalid provider timestamp.`,
    );
  }
}

function quoteMaxAge(
  quote: Quote,
  policy: MarketDataPolicy,
) {
  const marketOpen =
    quote.isMarketOpen !==
    false;

  if (
    marketOpen &&
    (
      policy.timing ===
        "realtime" ||
      policy.timing ===
        "delayed"
    )
  ) {
    const delaySeconds =
      (
        policy.timing ===
          "delayed"
          ? policy.delayMinutes ??
            0
          : 0
      ) * 60;

    return (
      delaySeconds +
      15 * 60
    );
  }

  return CLOSED_MARKET_MAX_AGE_SECONDS;
}

function candleMaxAge(
  timeframe: Timeframe,
  quote: Quote,
  policy: MarketDataPolicy,
) {
  const seconds =
    timeframeSeconds[
      timeframe
    ] ?? 24 * 60 * 60;
  const marketOpen =
    quote.isMarketOpen !==
    false;

  if (
    policy.timing ===
    "end-of-day" ||
    !marketOpen
  ) {
    return Math.max(
      CLOSED_MARKET_MAX_AGE_SECONDS,
      seconds * 3,
    );
  }

  const delaySeconds =
    (
      policy.timing ===
        "delayed"
        ? policy.delayMinutes ??
          0
        : 0
    ) * 60;

  if (
    seconds >=
    24 * 60 * 60
  ) {
    return Math.max(
      4 * 24 * 60 * 60,
      seconds * 2,
    );
  }

  return (
    delaySeconds +
    Math.max(
      15 * 60,
      Math.ceil(
        seconds * 2.5,
      ),
    )
  );
}

export function assertForecastEvidenceFresh(
  input: {
    providerId: string;
    policy:
      MarketDataPolicy;
    quote: Quote;
    candleHistory:
      Map<
        Timeframe,
        Candle[]
      >;
    nowSeconds?: number;
  },
) {
  const nowSeconds =
    input.nowSeconds ??
    Math.floor(
      Date.now() / 1000,
    );

  if (
    !Number.isSafeInteger(
      nowSeconds,
    ) ||
    nowSeconds <= 0
  ) {
    fail(
      "INVALID_MARKET_EVIDENCE",
      "Forecast evidence clock is invalid.",
    );
  }

  const providerId =
    input.providerId.trim();

  if (
    !providerId ||
    /demo|sample|fallback/i.test(
      providerId,
    ) ||
    input.quote.source !==
      providerId
  ) {
    fail(
      "INVALID_MARKET_EVIDENCE",
      "Forecast quote source does not match the configured real provider.",
    );
  }

  assertTimestamp(
    input.quote.timestamp,
    "Forecast quote",
    nowSeconds,
  );

  if (
    (
      input.policy.timing ===
        "realtime" ||
      input.policy.timing ===
        "delayed"
    ) &&
    input.quote.isMarketOpen !==
      false &&
    input.quote.timestampKind !==
      "last-quote"
  ) {
    fail(
      "INVALID_MARKET_EVIDENCE",
      "Open-market realtime/delayed forecasts require a last-quote provider timestamp.",
    );
  }

  const quoteAge =
    nowSeconds -
    input.quote.timestamp;

  if (
    quoteAge >
    quoteMaxAge(
      input.quote,
      input.policy,
    )
  ) {
    fail(
      "STALE_MARKET_EVIDENCE",
      "Forecast quote is older than the declared market-data timing policy allows.",
    );
  }

  if (
    input.candleHistory.size <
    2
  ) {
    fail(
      "INVALID_MARKET_EVIDENCE",
      "Forecast requires at least two verified candle timeframes.",
    );
  }

  for (
    const [
      timeframe,
      candles,
    ]
    of input.candleHistory
  ) {
    if (
      candles.length === 0
    ) {
      fail(
        "INVALID_MARKET_EVIDENCE",
        `Forecast ${timeframe} candle evidence is empty.`,
      );
    }

    for (
      let index = 0;
      index <
      candles.length;
      index += 1
    ) {
      const candle =
        candles[index];

      assertTimestamp(
        candle.time,
        `Forecast ${timeframe} candle`,
        nowSeconds,
      );

      if (
        index > 0 &&
        candle.time <=
          candles[
            index - 1
          ].time
      ) {
        fail(
          "INVALID_MARKET_EVIDENCE",
          `Forecast ${timeframe} candles are not strictly ascending.`,
        );
      }
    }

    const latest =
      candles[
        candles.length - 1
      ];
    const age =
      nowSeconds -
      latest.time;

    if (
      age >
      candleMaxAge(
        timeframe,
        input.quote,
        input.policy,
      )
    ) {
      fail(
        "STALE_MARKET_EVIDENCE",
        `Forecast ${timeframe} candles are too old for the current market-data timing state.`,
      );
    }
  }

  return {
    quoteTimestamp:
      input.quote.timestamp,
    latestByTimeframe:
      Object.fromEntries(
        [
          ...input
            .candleHistory,
        ].map(
          ([
            timeframe,
            candles,
          ]) => [
            timeframe,
            candles[
              candles.length -
              1
            ].time,
          ],
        ),
      ),
  };
}
