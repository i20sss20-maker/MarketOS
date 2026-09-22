export function selectSuccessfulRun(
  runs,
  {
    sha,
    event,
  },
) {
  return (
    (Array.isArray(runs)
      ? runs
      : [])
      .filter(
        (run) =>
          run.head_sha?.toLowerCase() ===
            sha.toLowerCase() &&
          run.head_branch ===
            "main" &&
          run.event ===
            event &&
          run.status ===
            "completed" &&
          run.conclusion ===
            "success",
      )
      .sort(
        (a, b) =>
          Date.parse(
            b.updated_at ??
              b.created_at,
          ) -
          Date.parse(
            a.updated_at ??
              a.created_at,
          ),
      )[0] ??
    null
  );
}

export function evaluateRequiredJobs(
  jobs,
  requiredJobs = [],
) {
  const available =
    Array.isArray(jobs)
      ? jobs
      : [];
  const passed = [];
  const missing = [];

  for (
    const jobName
    of requiredJobs
  ) {
    const matches =
      available.filter(
        (job) =>
          job.name ===
          jobName,
      );
    const successful =
      matches.find(
        (job) =>
          job.status ===
            "completed" &&
          job.conclusion ===
            "success",
      );

    if (!successful) {
      const observed =
        matches[0] ??
        null;
      missing.push({
        name: jobName,
        status:
          observed?.status ??
          null,
        conclusion:
          observed?.conclusion ??
          null,
      });
      continue;
    }

    passed.push({
      id: successful.id,
      name: successful.name,
      status:
        successful.status,
      conclusion:
        successful.conclusion,
      startedAt:
        successful.started_at ??
        null,
      completedAt:
        successful.completed_at ??
        null,
      htmlUrl:
        successful.html_url ??
        null,
    });
  }

  return {
    passed,
    missing,
  };
}

export async function evaluateReleaseEvidence({
  required,
  lookup,
  sha,
  now,
  maxAgeHours,
}) {
  const maxAgeMs =
    maxAgeHours *
    60 *
    60 *
    1000;
  const results = {};
  const missing = [];

  for (
    const item
    of required
  ) {
    const run =
      await lookup(item);

    if (!run) {
      missing.push({
        id: item.id,
        workflow:
          item.workflow,
        reason:
          "no successful exact-SHA run",
      });
      continue;
    }

    const completedAt =
      Date.parse(
        run.updated_at ??
          run.created_at,
      );
    const ageMs =
      now - completedAt;

    if (
      !Number.isFinite(
        completedAt,
      ) ||
      ageMs < 0 ||
      ageMs > maxAgeMs
    ) {
      missing.push({
        id: item.id,
        workflow:
          item.workflow,
        reason:
          `successful run is older than ${maxAgeHours} hours`,
        runId:
          run.id,
      });
      continue;
    }

    const jobEvidence =
      evaluateRequiredJobs(
        run.jobs,
        item.requiredJobs,
      );

    if (
      jobEvidence.missing.length >
      0
    ) {
      missing.push({
        id: item.id,
        workflow:
          item.workflow,
        reason:
          "one or more required workflow jobs did not complete successfully",
        runId:
          run.id,
        jobs:
          jobEvidence.missing,
      });
      continue;
    }

    results[item.id] = {
      workflow:
        item.workflow,
      label:
        item.label,
      runId:
        run.id,
      runNumber:
        run.run_number,
      event:
        run.event,
      headSha:
        run.head_sha,
      createdAt:
        run.created_at,
      updatedAt:
        run.updated_at,
      htmlUrl:
        run.html_url,
      jobs:
        jobEvidence.passed,
    };
  }

  const deployment =
    results.deployment;

  if (deployment) {
    const deployedAt =
      Date.parse(
        deployment.updatedAt ??
          deployment.createdAt,
      );

    for (
      const item
      of required.filter(
        (entry) =>
          entry.afterDeployment,
      )
    ) {
      const accepted =
        results[item.id];

      if (!accepted) {
        continue;
      }

      const acceptedAt =
        Date.parse(
          accepted.updatedAt ??
            accepted.createdAt,
        );

      if (
        acceptedAt <
        deployedAt
      ) {
        delete results[
          item.id
        ];
        missing.push({
          id: item.id,
          workflow:
            item.workflow,
          reason:
            "acceptance run predates the exact production deployment",
          runId:
            accepted.runId,
        });
      }
    }
  }

  return {
    results,
    missing,
  };
}
