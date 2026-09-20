import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}

function dataUrl(source) {
  return (
    "data:text/javascript;base64," +
    Buffer.from(source).toString(
      "base64",
    )
  );
}

const journalUrl =
  dataUrl(
    transpile(
      readFileSync(
        "apps/web/src/lib/forecastJournal.ts",
        "utf8",
      ),
    ),
  );

let performanceCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/forecastPerformance.ts",
      "utf8",
    ),
  ).replaceAll(
    '"./forecastJournal"',
    JSON.stringify(journalUrl),
  );

const performanceUrl =
  dataUrl(
    performanceCompiled,
  );

let healthCompiled =
  transpile(
    readFileSync(
      "apps/web/src/lib/analystModelHealth.ts",
      "utf8",
    ),
  ).replaceAll(
    '"./forecastPerformance"',
    JSON.stringify(
      performanceUrl,
    ),
  );

const healthUrl =
  dataUrl(
    healthCompiled,
  );

const {
  buildAnalystModelHealth,
} = await import(
  healthUrl
);

function record({
  id,
  expectedProbability,
  correct,
  evaluatedAt,
}) {
  return {
    id,
    symbolId: "TEST:A",
    ticker: "A",
    engine:
      "marketos-forecast-v3",
    generatedAt:
      evaluatedAt - 3600,
    dueAt:
      evaluatedAt - 60,
    referencePrice: 100,
    confidence: 75,
    dataMode: "provider",
    expectedOutcome: "bull",
    expectedProbability,
    probabilities: {
      bull:
        expectedProbability,
      base: 20,
      bear:
        80 -
        expectedProbability,
    },
    thresholdPercent: 1,
    status: "resolved",
    evaluatedAt,
    evaluationPrice:
      correct ? 103 : 97,
    realizedReturnPercent:
      correct ? 3 : -3,
    realizedOutcome:
      correct ? "bull" : "bear",
    correct,
  };
}

const learning =
  buildAnalystModelHealth(
    Array.from(
      { length: 4 },
      (_, index) =>
        record({
          id:
            `learn-${index}`,
          expectedProbability:
            60,
          correct:
            index < 3,
          evaluatedAt:
            1000 - index,
        }),
    ),
  );

assert.equal(
  learning.status,
  "learning",
);
assert.equal(
  learning.resolved,
  4,
);
assert.equal(
  learning.driftStatus,
  "insufficient",
);
assert.equal(
  learning.reliabilityStatus,
  "insufficient",
);

const healthyRecords = [
  ...Array.from(
    { length: 10 },
    (_, index) =>
      record({
        id:
          `healthy-recent-${index}`,
        expectedProbability:
          60,
        correct:
          index < 6,
        evaluatedAt:
          3000 - index,
      }),
  ),
  ...Array.from(
    { length: 10 },
    (_, index) =>
      record({
        id:
          `healthy-base-${index}`,
        expectedProbability:
          60,
        correct:
          index < 6,
        evaluatedAt:
          2900 - index,
      }),
  ),
];

const healthy =
  buildAnalystModelHealth(
    healthyRecords,
  );

assert.equal(
  healthy.status,
  "healthy",
);
assert.equal(
  healthy.resolved,
  20,
);
assert.equal(
  healthy.driftStatus,
  "stable",
);
assert.equal(
  healthy.reliabilityStatus,
  "good",
);
assert.equal(
  healthy.reliabilityEce,
  0,
);

const watchRecords = [
  ...Array.from(
    { length: 10 },
    (_, index) =>
      record({
        id:
          `watch-recent-${index}`,
        expectedProbability:
          60,
        correct:
          index < 6,
        evaluatedAt:
          5000 - index,
      }),
  ),
  ...Array.from(
    { length: 10 },
    (_, index) =>
      record({
        id:
          `watch-base-${index}`,
        expectedProbability:
          70,
        correct:
          index < 5,
        evaluatedAt:
          4900 - index,
      }),
  ),
];

const watch =
  buildAnalystModelHealth(
    watchRecords,
  );

assert.equal(
  watch.status,
  "watch",
);
assert.equal(
  watch.reliabilityStatus,
  "watch",
);
assert.equal(
  watch.reliabilityEce,
  10,
);

const degradedRecords = [
  ...Array.from(
    { length: 8 },
    (_, index) =>
      record({
        id:
          `degraded-recent-${index}`,
        expectedProbability:
          70,
        correct:
          index < 2,
        evaluatedAt:
          7000 - index,
      }),
  ),
  ...Array.from(
    { length: 8 },
    (_, index) =>
      record({
        id:
          `degraded-base-${index}`,
        expectedProbability:
          70,
        correct:
          index < 7,
        evaluatedAt:
          6900 - index,
      }),
  ),
];

const degraded =
  buildAnalystModelHealth(
    degradedRecords,
  );

assert.equal(
  degraded.status,
  "degraded",
);
assert.equal(
  degraded.driftStatus,
  "degrading",
);
assert.equal(
  degraded.reliabilityStatus,
  "insufficient",
);

const view =
  readFileSync(
    "apps/web/src/components/AnalystForecastView.tsx",
    "utf8",
  );
const brief =
  readFileSync(
    "apps/web/src/lib/analystBrief.ts",
    "utf8",
  );
const card =
  readFileSync(
    "apps/web/src/components/AnalystBriefCard.tsx",
    "utf8",
  );

assert.match(
  view,
  /MODEL HEALTH/,
);
assert.match(
  view,
  /buildAnalystModelHealth/,
);
assert.match(
  view,
  /صحة المحرك/,
);
assert.match(
  brief,
  /modelHealth/,
);
assert.match(
  card,
  /modelHealthBriefLabel/,
);
assert.match(
  card,
  /home-model-health/,
);

console.log(
  "Analyst Model Health smoke passed:",
  JSON.stringify({
    learning:
      learning.status,
    healthy:
      healthy.status,
    watch:
      watch.status,
    degraded:
      degraded.status,
  }),
);
