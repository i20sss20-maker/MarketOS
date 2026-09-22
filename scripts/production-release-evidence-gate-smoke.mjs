import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  evaluateReleaseEvidence,
  selectSuccessfulRun,
} from "./production-release-evidence-lib.mjs";

const sha =
  "a".repeat(40);
const otherSha =
  "b".repeat(40);
const now =
  Date.parse(
    "2026-09-21T12:00:00Z",
  );

function run({
  id,
  event =
    "workflow_dispatch",
  headSha = sha,
  updatedAt =
    "2026-09-21T11:00:00Z",
  conclusion =
    "success",
  status =
    "completed",
  branch = "main",
  jobs = [],
}) {
  return {
    id,
    run_number: id,
    event,
    head_sha:
      headSha,
    head_branch:
      branch,
    status,
    conclusion,
    created_at:
      updatedAt,
    updated_at:
      updatedAt,
    html_url:
      `https://github.invalid/run/${id}`,
    jobs,
  };
}

function job(
  name,
  {
    id = 1,
    status = "completed",
    conclusion = "success",
  } = {},
) {
  return {
    id,
    name,
    status,
    conclusion,
    started_at:
      "2026-09-21T10:00:00Z",
    completed_at:
      "2026-09-21T10:01:00Z",
    html_url:
      `https://github.invalid/job/${id}`,
  };
}

assert.equal(
  selectSuccessfulRun(
    [
      run({
        id: 1,
        headSha:
          otherSha,
      }),
      run({
        id: 2,
        conclusion:
          "failure",
      }),
      run({
        id: 3,
      }),
    ],
    {
      sha,
      event:
        "workflow_dispatch",
    },
  ).id,
  3,
);

const required = [
  {
    id: "deployment",
    workflow:
      "azure-production.yml",
    event:
      "workflow_dispatch",
    requiredJobs: [
      "Deploy exact verified strict bundle",
    ],
  },
  {
    id: "load",
    workflow:
      "hosted-ingress-load-acceptance.yml",
    event:
      "workflow_dispatch",
    requiredJobs: [
      "Bounded hosted ingress load",
    ],
    afterDeployment: true,
  },
  {
    id: "provider",
    workflow:
      "provider-integration.yml",
    event:
      "workflow_dispatch",
    requiredJobs: [
      "Twelve Data live acceptance",
    ],
  },
];

const greenRuns =
  new Map([
    [
      "deployment",
      run({
        id: 10,
        updatedAt:
          "2026-09-21T10:00:00Z",
        jobs: [
          job(
            "Deploy exact verified strict bundle",
            { id: 101 },
          ),
        ],
      }),
    ],
    [
      "load",
      run({
        id: 11,
        updatedAt:
          "2026-09-21T10:30:00Z",
        jobs: [
          job(
            "Bounded hosted ingress load",
            { id: 102 },
          ),
        ],
      }),
    ],
    [
      "provider",
      run({
        id: 12,
        updatedAt:
          "2026-09-21T09:30:00Z",
        jobs: [
          job(
            "Twelve Data live acceptance",
            { id: 103 },
          ),
        ],
      }),
    ],
  ]);

const green =
  await evaluateReleaseEvidence({
    required,
    lookup:
      async (item) =>
        greenRuns.get(
          item.id,
        ) ??
        null,
    sha,
    now,
    maxAgeHours: 72,
  });

assert.equal(
  green.missing.length,
  0,
);
assert.equal(
  Object.keys(
    green.results,
  ).length,
  3,
);

const stale =
  await evaluateReleaseEvidence({
    required,
    lookup:
      async (item) =>
        item.id ===
        "provider"
          ? run({
              id: 20,
              updatedAt:
                "2026-09-15T10:00:00Z",
            })
          : greenRuns.get(
              item.id,
            ),
    sha,
    now,
    maxAgeHours: 72,
  });

assert.ok(
  stale.missing.some(
    (item) =>
      item.id ===
        "provider" &&
      item.reason.includes(
        "older",
      ),
  ),
);

const beforeDeploy =
  await evaluateReleaseEvidence({
    required,
    lookup:
      async (item) =>
        item.id ===
        "load"
          ? run({
              id: 21,
              updatedAt:
                "2026-09-21T09:59:59Z",
              jobs: [
                job(
                  "Bounded hosted ingress load",
                  { id: 104 },
                ),
              ],
            })
          : greenRuns.get(
              item.id,
            ),
    sha,
    now,
    maxAgeHours: 72,
  });

assert.ok(
  beforeDeploy.missing.some(
    (item) =>
      item.id ===
        "load" &&
      item.reason.includes(
        "predates",
      ),
  ),
);
assert.equal(
  beforeDeploy.results.load,
  undefined,
);

const skippedJob =
  await evaluateReleaseEvidence({
    required,
    lookup:
      async (item) =>
        item.id ===
        "deployment"
          ? run({
              id: 30,
              updatedAt:
                "2026-09-21T10:00:00Z",
              jobs: [
                job(
                  "Deploy exact verified strict bundle",
                  {
                    id: 105,
                    conclusion:
                      "skipped",
                  },
                ),
              ],
            })
          : greenRuns.get(
              item.id,
            ),
    sha,
    now,
    maxAgeHours: 72,
  });

assert.ok(
  skippedJob.missing.some(
    (item) =>
      item.id ===
        "deployment" &&
      item.reason.includes(
        "required workflow jobs",
      ) &&
      item.jobs?.some(
        (entry) =>
          entry.name ===
            "Deploy exact verified strict bundle" &&
          entry.conclusion ===
            "skipped",
      ),
  ),
);
assert.equal(
  skippedJob.results.deployment,
  undefined,
);

const missing =
  await evaluateReleaseEvidence({
    required,
    lookup:
      async (item) =>
        item.id ===
        "provider"
          ? null
          : greenRuns.get(
              item.id,
            ),
    sha,
    now,
    maxAgeHours: 72,
  });

assert.ok(
  missing.missing.some(
    (item) =>
      item.id ===
      "provider",
  ),
);

const workflow =
  readFileSync(
    ".github/workflows/production-release-evidence-gate.yml",
    "utf8",
  );
const gate =
  readFileSync(
    "scripts/production-release-evidence-gate.mjs",
    "utf8",
  );

assert.match(
  workflow,
  /workflow_dispatch:/,
);
assert.match(
  workflow,
  /actions: read/,
);
assert.match(
  workflow,
  /environment: azure-production/,
);
assert.match(
  workflow,
  /VERIFY MARKETOS RELEASE/,
);
assert.doesNotMatch(
  workflow,
  /TWELVE_DATA_API_KEY|COSMOS_CONNECTION_STRING|MARKETOS_WORKER_SECRET|AZURE_STATIC_WEB_APPS_API_TOKEN/,
);

for (
  const file
  of [
    "azure-production.yml",
    "provider-integration.yml",
    "cosmos-live-acceptance.yml",
    "live-quota-concurrency-acceptance.yml",
    "live-account-erasure-storage-acceptance.yml",
    "hosted-ingress-load-acceptance.yml",
    "live-forecast-evaluation-acceptance.yml",
    "application-insights-live-acceptance.yml",
    "cosmos-restore-drill-acceptance.yml",
  ]
) {
  assert.ok(
    gate.includes(file),
    `Release gate must require ${file}`,
  );
}

assert.match(
  gate,
  /head_sha/,
);
assert.match(
  gate,
  /status: "success"/,
);
assert.match(
  gate,
  /afterDeployment: true/,
);
assert.match(
  gate,
  /requiredJobs/,
);
assert.match(
  gate,
  /\/jobs\?filter=latest/,
);

console.log(
  "Production release evidence gate smoke passed: exact SHA, freshness, required job execution, missing evidence and post-deployment ordering are enforced without production secrets.",
);
