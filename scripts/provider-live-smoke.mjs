import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import {
  TwelveDataMarketDataProvider,
} from "../services/api/dist/src/providers/twelveDataProvider.js";
import {
  assertMarketDataPolicy,
} from "../services/api/dist/src/production/marketDataPolicy.js";

const apiKey =
  process.env.TWELVE_DATA_API_KEY?.trim();

if (!apiKey) {
  throw new Error(
    "TWELVE_DATA_API_KEY is required for the live provider integration check.",
  );
}

const now =
  new Date();

const policy =
  assertMarketDataPolicy(
    process.env,
    now,
  );

const provider =
  new TwelveDataMarketDataProvider(
    apiKey,
  );

function requireMatch(
  symbols,
  predicate,
  label,
) {
  const match =
    symbols.find(predicate);
  assert.ok(match, label);
  return match;
}

function assertRecentDaily(
  candles,
  label,
  maxAgeDays = 10,
) {
  assert.ok(
    candles.length > 0,
    `${label} must return at least one daily candle.`,
  );

  assert.ok(
    candles.every(
      (candle, index) =>
        index === 0 ||
        candle.time >
          candles[index - 1].time,
    ),
    `${label} daily candles must be ascending.`,
  );

  const latest =
    candles[
      candles.length - 1
    ];

  const ageSeconds =
    now.getTime() / 1000 -
    latest.time;

  assert.ok(
    ageSeconds >= -300,
    `${label} latest daily candle cannot be in the future.`,
  );

  assert.ok(
    ageSeconds <=
      maxAgeDays *
        24 *
        60 *
        60,
    `${label} latest daily candle is unexpectedly old; verify entitlement and exchange availability.`,
  );

  return latest;
}

const evidence = {
  checkedAt:
    now.toISOString(),
  provider:
    "twelvedata",
  declaredPolicy:
    policy,
  checks: {},
};

console.log(
  "Running live Twelve Data integration check (no API key will be printed)...",
);

const appleResults =
  await provider.searchSymbols(
    "Apple",
  );

const aapl =
  requireMatch(
    appleResults,
    symbol =>
      symbol.ticker.toUpperCase() ===
        "AAPL" &&
      symbol.micCode?.toUpperCase() ===
        "XNAS",
    "AAPL must resolve to MIC XNAS.",
  );

const aaplQuote =
  await provider.getQuote(aapl);

assert.ok(
  Number.isFinite(
    aaplQuote.price,
  ) &&
    aaplQuote.price > 0,
  "AAPL quote must have a positive price.",
);

assert.equal(
  aaplQuote.source,
  "twelvedata",
);

assert.ok(
  Number.isSafeInteger(
    aaplQuote.timestamp,
  ) &&
    aaplQuote.timestamp > 0 &&
    aaplQuote.timestamp <=
      now.getTime() / 1000 +
        300,
  "AAPL quote must expose a valid provider timestamp.",
);

if (
  (
    policy.timing ===
      "realtime" ||
    policy.timing ===
      "delayed"
  ) &&
  aaplQuote.isMarketOpen !==
    false
) {
  assert.equal(
    aaplQuote.timestampKind,
    "last-quote",
    "Open realtime/delayed acceptance requires Twelve Data last_quote_at, not the daily interval-open timestamp.",
  );

  const allowedMinutes =
    policy.timing ===
    "realtime"
      ? 15
      : (
          policy.delayMinutes ??
          0
        ) + 15;

  const ageSeconds =
    now.getTime() / 1000 -
    aaplQuote.timestamp;

  assert.ok(
    ageSeconds <=
      allowedMinutes * 60,
    "Open-market quote is older than the declared timing policy plus the acceptance allowance.",
  );
}

const aaplCandles =
  await provider.getCandles(
    aapl,
    "1d",
    10,
  );

const latestAaplDaily =
  assertRecentDaily(
    aaplCandles,
    "AAPL",
  );

evidence.checks.us = {
  symbol: aapl.ticker,
  micCode: aapl.micCode,
  quoteTimestamp:
    aaplQuote.timestamp,
  quoteTimestampKind:
    aaplQuote.timestampKind ??
    "unknown",
  marketOpen:
    aaplQuote.isMarketOpen ??
    null,
  latestDailyBar:
    latestAaplDaily.time,
};

const elmResults =
  await provider.searchSymbols(
    "7203",
  );

const elm =
  requireMatch(
    elmResults,
    symbol =>
      symbol.ticker.replace(
        /\s+/g,
        "",
      ) === "7203" &&
      symbol.micCode?.toUpperCase() ===
        "XSAU",
    "Saudi trial symbol 7203 must resolve to MIC XSAU.",
  );

const elmCandles =
  await provider.getCandles(
    elm,
    "1d",
    10,
  );

const latestElmDaily =
  assertRecentDaily(
    elmCandles,
    "XSAU:7203",
  );

const aramcoResults =
  await provider.searchSymbols(
    "2222",
  );

const aramco =
  requireMatch(
    aramcoResults,
    symbol =>
      symbol.ticker.replace(
        /\s+/g,
        "",
      ) === "2222" &&
      symbol.micCode?.toUpperCase() ===
        "XSAU",
    "Saudi Aramco 2222 must resolve to MIC XSAU.",
  );

evidence.checks.saudi = {
  trialSymbol:
    elm.ticker,
  trialMicCode:
    elm.micCode,
  latestTrialDailyBar:
    latestElmDaily.time,
  aramcoSymbol:
    aramco.ticker,
  aramcoMicCode:
    aramco.micCode,
  timingClaim:
    "No realtime claim is made by this test; XSAU availability/timing must match the declared provider/exchange rights.",
};

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);

writeFileSync(
  "artifacts/provider-live-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  "Real provider integration check passed. Evidence contains timestamps and symbols only; no API key or price is written.",
);
