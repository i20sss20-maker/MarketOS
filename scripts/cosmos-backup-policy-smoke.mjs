import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import ts from "typescript";

const dataUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(source).toString(
    "base64",
  );

const policyUrl = dataUrl(`
export class ProductionGateError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function realDataRequired(env = {}) {
  return env.MARKETOS_ENVIRONMENT === "production" ||
    env.MARKETOS_REQUIRE_REAL_DATA === "true";
}
`);

let compiled =
  ts.transpileModule(
    readFileSync(
      "services/api/src/production/cosmosBackupPolicy.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module:
          ts.ModuleKind.ES2022,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

compiled =
  compiled.replace(
    '"./policy.js"',
    JSON.stringify(policyUrl),
  );

const {
  cosmosBackupPolicy,
  assertCosmosBackupPolicy,
} = await import(
  dataUrl(compiled),
);

const now =
  new Date(
    "2026-09-22T12:00:00Z",
  );
const production = {
  MARKETOS_ENVIRONMENT:
    "production",
};

assert.equal(
  cosmosBackupPolicy(
    production,
    now,
  ).configured,
  false,
);

assert.throws(
  () =>
    assertCosmosBackupPolicy(
      production,
      now,
    ),
  (error) =>
    error.code ===
    "COSMOS_BACKUP_NOT_VERIFIED",
);

assert.throws(
  () =>
    assertCosmosBackupPolicy(
      {
        ...production,
        MARKETOS_COSMOS_BACKUP_VERIFIED:
          "true",
      },
      now,
    ),
  (error) =>
    error.code ===
    "COSMOS_BACKUP_MODE_UNKNOWN",
);

for (
  const date
  of [
    "2026-08-22",
    "2026-09-23",
  ]
) {
  assert.throws(
    () =>
      assertCosmosBackupPolicy(
        {
          ...production,
          MARKETOS_COSMOS_BACKUP_VERIFIED:
            "true",
          MARKETOS_COSMOS_BACKUP_MODE:
            "periodic",
          MARKETOS_COSMOS_BACKUP_VERIFIED_AT:
            date,
        },
        now,
      ),
    (error) =>
      error.code ===
      "COSMOS_BACKUP_VERIFICATION_STALE",
  );
}

for (
  const mode
  of [
    "periodic",
    "continuous",
  ]
) {
  const result =
    assertCosmosBackupPolicy(
      {
        ...production,
        MARKETOS_COSMOS_BACKUP_VERIFIED:
          "true",
        MARKETOS_COSMOS_BACKUP_MODE:
          mode,
        MARKETOS_COSMOS_BACKUP_VERIFIED_AT:
          "2026-09-22",
      },
      now,
    );

  assert.equal(
    result.configured,
    true,
  );
  assert.equal(
    result.mode,
    mode,
  );
}

assert.equal(
  assertCosmosBackupPolicy(
    {
      MARKETOS_ENVIRONMENT:
        "local",
    },
    now,
  ).configured,
  false,
);

const verifier =
  readFileSync(
    "infrastructure/azure/verify-cosmos-backup-policy.ps1",
    "utf8",
  );

for (
  const marker
  of [
    "az cosmosdb show",
    "MARKETOS_COSMOS_BACKUP_VERIFIED=true",
    "MARKETOS_COSMOS_BACKUP_MODE=",
    "MARKETOS_COSMOS_BACKUP_VERIFIED_AT=",
    "read-only for the Cosmos backup policy",
    "restore drill remains a separate acceptance gate",
  ]
) {
  assert.ok(
    verifier.includes(
      marker,
    ),
    `Missing backup verifier marker: ${marker}`,
  );
}

assert.doesNotMatch(
  verifier,
  /az cosmosdb (create|update|delete)/,
);
assert.doesNotMatch(
  verifier,
  /COSMOS_CONNECTION_STRING|AccountKey=/,
);

const readiness =
  readFileSync(
    "services/api/src/functions/productionReadiness.ts",
    "utf8",
  );
assert.match(
  readiness,
  /assertCosmosBackupPolicy\(\)/,
);
assert.match(
  readiness,
  /COSMOS_RESTORE_RUNBOOK_DRILL/,
);

const preflight =
  readFileSync(
    "infrastructure/azure/production-cutover-preflight.ps1",
    "utf8",
  );
assert.match(
  preflight,
  /MARKETOS_COSMOS_BACKUP_VERIFIED/,
);
assert.match(
  preflight,
  /older than 30 days/,
);

const panel =
  readFileSync(
    "apps/web/src/components/SystemPanel.tsx",
    "utf8",
  );
assert.match(
  panel,
  /Cosmos Backup/,
);
assert.match(
  panel,
  /تمرين الاستعادة يبقى بوابة قبول مستقلة/,
);
assert.match(
  panel,
  /HOSTED_SERVER_OUTCOME_EVALUATION/,
);
assert.match(
  panel,
  /HOSTED_ACCOUNT_ERASURE/,
);

console.log(
  "Cosmos backup/recovery gate smoke passed: production requires fresh read-only backup verification, no backup mutation occurs, and restore remains an explicit separate acceptance gate.",
);
