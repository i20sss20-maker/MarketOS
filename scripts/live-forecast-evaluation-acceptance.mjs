import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";

const raw =
  process.env.MARKETOS_ACCEPTANCE_BASE_URL?.trim() ??
  "";
const workerSecret =
  process.env.MARKETOS_WORKER_SECRET?.trim() ??
  "";

let base;
try {
  base =
    new URL(raw);
} catch {
  throw new Error(
    "MARKETOS_ACCEPTANCE_BASE_URL must be a valid URL.",
  );
}

assert.equal(
  base.protocol,
  "https:",
  "Live forecast evaluation acceptance requires HTTPS.",
);
assert.equal(
  base.username,
  "",
);
assert.equal(
  base.password,
  "",
);
assert.equal(
  base.search,
  "",
);
assert.equal(
  base.hash,
  "",
);
assert.ok(
  base.pathname === "/" ||
    base.pathname === "",
  "Base URL must be a plain HTTPS origin.",
);
assert.ok(
  workerSecret.length >= 32,
  "MARKETOS_WORKER_SECRET is missing or too short.",
);

const origin =
  base.origin;
const endpoint =
  new URL(
    "/api/internal/forecasts/evaluate",
    origin,
  );

async function evaluate(
  secret,
) {
  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          "x-marketos-worker-secret":
            secret,
        },
        body: "{}",
        signal:
          AbortSignal.timeout(
            100_000,
          ),
      },
    );

  const text =
    await response.text();
  let body = null;
  try {
    body =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    body = null;
  }

  return {
    status:
      response.status,
    location:
      response.headers.get(
        "location",
      ),
    body,
  };
}

const rejected =
  await evaluate(
    "invalid-acceptance-secret",
  );

assert.equal(
  rejected.status,
  401,
  "Invalid worker credentials must be rejected before evaluation work.",
);
assert.equal(
  rejected.location,
  null,
  "The internal evaluator must not redirect credentials.",
);

const accepted =
  await evaluate(
    workerSecret,
  );

assert.equal(
  accepted.status,
  200,
  "The hosted evaluator must accept the configured worker credential.",
);
assert.equal(
  accepted.location,
  null,
  "The internal evaluator must not redirect the worker credential.",
);
assert.equal(
  accepted.body?.ok,
  true,
);
assert.equal(
  accepted.body?.enabled,
  true,
  "The production evaluator feature flag must be enabled.",
);
assert.equal(
  accepted.body?.acquired,
  true,
  "The acceptance run must acquire the evaluator lease. If the scheduled timer ran recently, wait for the 15-minute window and retry.",
);

for (
  const key
  of [
    "checked",
    "resolved",
    "pending",
    "failed",
  ]
) {
  assert.ok(
    Number.isInteger(
      accepted.body?.[key],
    ) &&
      accepted.body[key] >=
        0,
    `Evaluator summary ${key} must be a non-negative integer.`,
  );
}

assert.ok(
  accepted.body.checked <= 3,
  "The live evaluator must keep its three-record batch cap.",
);
assert.equal(
  accepted.body.checked,
  accepted.body.resolved +
    accepted.body.pending +
    accepted.body.failed,
  "Every checked forecast must be accounted for as resolved, pending, or failed.",
);
assert.equal(
  typeof accepted.body.hasMore,
  "boolean",
);

const evidence = {
  origin,
  checkedAt:
    new Date().toISOString(),
  invalidCredentialRejected:
    true,
  enabled:
    true,
  leaseAcquired:
    true,
  checked:
    accepted.body.checked,
  resolved:
    accepted.body.resolved,
  pending:
    accepted.body.pending,
  failed:
    accepted.body.failed,
  hasMore:
    accepted.body.hasMore,
  batchCap:
    3,
};

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/live-forecast-evaluation-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  `Live forecast evaluation acceptance passed: invalid credentials were rejected; the real hosted evaluator acquired its lease and completed a bounded sweep (checked=${evidence.checked}, resolved=${evidence.resolved}, pending=${evidence.pending}, failed=${evidence.failed}).`,
);
