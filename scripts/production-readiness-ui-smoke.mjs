import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const api =
  readFileSync(
    "apps/web/src/lib/systemApi.ts",
    "utf8",
  );

assert.match(
  api,
  /export type ProductionReadiness/,
);
assert.match(
  api,
  /production\/readiness/,
);
assert.match(
  api,
  /response\.status !== 503/,
);
assert.match(
  api,
  /productionReady: false/,
);

const readinessHandler =
  readFileSync(
    "services/api/src/functions/productionReadiness.ts",
    "utf8",
  );
assert.match(
  readinessHandler,
  /PRODUCTION_RELEASE_EVIDENCE_GATE/,
);

const app =
  readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

assert.match(
  app,
  /getProductionReadiness/,
);
assert.match(
  app,
  /Promise\.allSettled/,
);
assert.match(
  app,
  /productionReadinessError/,
);

const panel =
  readFileSync(
    "apps/web/src/components/SystemPanel.tsx",
    "utf8",
  );

for (
  const marker
  of [
    "Production Gate",
    "Configuration checks passed",
    "اختبارات القبول المتبقية",
    "نجاح الإعدادات لا يعني أن الإطلاق التجاري معتمد",
    "APPLICATION_INSIGHTS_AND_LOG_REVIEW",
    "HOSTED_AUTH_AND_OWNER_ISOLATION",
    "PRODUCTION_RELEASE_EVIDENCE_GATE",
  ]
) {
  assert.ok(
    panel.includes(marker),
    `Missing readiness UI marker: ${marker}`,
  );
}

assert.doesNotMatch(
  panel,
  /productionReady\s*\?\s*["']Ready/,
  "UI must not convert the deliberately-false productionReady field into a false launch claim.",
);

console.log(
  "Production readiness UI smoke passed: HTTP 503 blockers are displayed as state, live acceptance remains separate from configuration readiness.",
);
