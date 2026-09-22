import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import {
  evaluateReleaseEvidence,
  selectSuccessfulRun,
} from "./production-release-evidence-lib.mjs";

const repository =
  process.env.GITHUB_REPOSITORY?.trim() ??
  "";
const sha =
  process.env.GITHUB_SHA?.trim().toLowerCase() ??
  "";
const token =
  process.env.GITHUB_TOKEN?.trim() ??
  "";
const maxAgeHours =
  Number(
    process.env.MARKETOS_RELEASE_EVIDENCE_MAX_AGE_HOURS ??
      "72",
  );

assert.match(
  repository,
  /^[^/]+\/[^/]+$/,
  "GITHUB_REPOSITORY is invalid.",
);
assert.match(
  sha,
  /^[0-9a-f]{40}$/,
  "Release evidence must be bound to a full Git commit SHA.",
);
assert.ok(
  token.length > 0,
  "GITHUB_TOKEN is required to read workflow-run evidence.",
);
assert.ok(
  Number.isInteger(
    maxAgeHours,
  ) &&
    maxAgeHours >= 1 &&
    maxAgeHours <= 168,
  "Evidence max age must be 1-168 hours.",
);

const [owner, repo] =
  repository.split("/");
const apiBase =
  `https://api.github.com/repos/${owner}/${repo}`;
const now =
  Date.now();

const required = [
  {
    id: "ci",
    workflow: "ci.yml",
    event: "push",
    label: "Full MarketOS CI",
  },
  {
    id: "deployment",
    workflow: "azure-production.yml",
    event: "workflow_dispatch",
    label: "Exact verified Azure production deployment and hosted boundary",
  },
  {
    id: "provider",
    workflow: "provider-integration.yml",
    event: "workflow_dispatch",
    label: "Live provider entitlement/timestamp acceptance",
  },
  {
    id: "cosmos",
    workflow: "cosmos-live-acceptance.yml",
    event: "workflow_dispatch",
    label: "Live Cosmos persistence/isolation acceptance",
  },
  {
    id: "quota",
    workflow: "live-quota-concurrency-acceptance.yml",
    event: "workflow_dispatch",
    label: "Live Cosmos quota concurrency acceptance",
  },
  {
    id: "erasure",
    workflow: "live-account-erasure-storage-acceptance.yml",
    event: "workflow_dispatch",
    label: "Live account-erasure persistent-store acceptance",
  },
  {
    id: "load",
    workflow: "hosted-ingress-load-acceptance.yml",
    event: "workflow_dispatch",
    label: "Bounded hosted ingress load acceptance",
    afterDeployment: true,
  },
  {
    id: "evaluator",
    workflow: "live-forecast-evaluation-acceptance.yml",
    event: "workflow_dispatch",
    label: "Live hosted server forecast evaluator acceptance",
    afterDeployment: true,
  },
  {
    id: "telemetry",
    workflow: "application-insights-live-acceptance.yml",
    event: "workflow_dispatch",
    label: "Live Application Insights telemetry acceptance",
    afterDeployment: true,
  },
  {
    id: "restore",
    workflow: "cosmos-restore-drill-acceptance.yml",
    event: "workflow_dispatch",
    label: "Separate-account Cosmos backup restore drill acceptance",
  },
];

async function githubJson(
  path,
) {
  const response =
    await fetch(
      `${apiBase}${path}`,
      {
        headers: {
          Accept:
            "application/vnd.github+json",
          Authorization:
            `Bearer ${token}`,
          "X-GitHub-Api-Version":
            "2022-11-28",
          "User-Agent":
            "MarketOS-production-release-gate",
        },
        redirect: "error",
        signal:
          AbortSignal.timeout(
            15_000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `GitHub Actions evidence query failed for ${path} (HTTP ${response.status}).`,
    );
  }

  return response.json();
}

async function lookup(
  item,
) {
  const params =
    new URLSearchParams({
      branch: "main",
      event: item.event,
      head_sha: sha,
      status: "success",
      per_page: "100",
    });

  const payload =
    await githubJson(
      `/actions/workflows/${encodeURIComponent(item.workflow)}/runs?${params.toString()}`,
    );

  return selectSuccessfulRun(
    payload.workflow_runs,
    {
      sha,
      event:
        item.event,
    },
  );
}

const {
  results,
  missing,
} =
  await evaluateReleaseEvidence({
    required,
    lookup,
    sha,
    now,
    maxAgeHours,
  });

const evidence = {
  repository,
  sha,
  checkedAt:
    new Date(now).toISOString(),
  maxAgeHours,
  releaseReady:
    missing.length === 0,
  requiredCount:
    required.length,
  passedCount:
    Object.keys(
      results,
    ).length,
  runs:
    results,
  missing,
  note:
    "This gate verifies successful exact-SHA workflow evidence. It does not independently re-run the underlying market, storage, deployment or hosted checks.",
};

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/production-release-evidence.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

if (
  missing.length > 0
) {
  for (
    const item
    of missing
  ) {
    console.error(
      `MISSING ${item.id}: ${item.workflow} — ${item.reason}`,
    );
  }

  throw new Error(
    `MarketOS production release evidence is incomplete for ${sha.slice(0, 12)}: ${missing.length} required acceptance run(s) are missing or stale.`,
  );
}

console.log(
  `MarketOS production release evidence gate passed for ${sha}: ${required.length}/${required.length} exact-SHA checks are green and within ${maxAgeHours} hours.`,
);
