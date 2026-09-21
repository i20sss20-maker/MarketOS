import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";

const raw =
  process.env.MARKETOS_ACCEPTANCE_BASE_URL ??
  "";
const total =
  Number(
    process.env.MARKETOS_LOAD_REQUESTS ??
      "100",
  );
const concurrency =
  Number(
    process.env.MARKETOS_LOAD_CONCURRENCY ??
      "5",
  );

let base;
try {
  base = new URL(raw);
} catch {
  throw new Error(
    "MARKETOS_ACCEPTANCE_BASE_URL must be a valid URL.",
  );
}

assert.equal(
  base.protocol,
  "https:",
);
assert.ok(
  base.pathname === "/" ||
    base.pathname === "",
  "Base URL must be an origin.",
);
assert.ok(
  Number.isInteger(total) &&
    total >= 20 &&
    total <= 500,
  "MARKETOS_LOAD_REQUESTS must be an integer from 20 to 500.",
);
assert.ok(
  Number.isInteger(concurrency) &&
    concurrency >= 1 &&
    concurrency <= 20,
  "MARKETOS_LOAD_CONCURRENCY must be an integer from 1 to 20.",
);
assert.ok(
  concurrency <= total,
);

const origin =
  base.origin;
const results = [];
let next = 0;

async function one(index) {
  const started =
    performance.now();
  try {
    const response =
      await fetch(
        new URL(
          "/api/health",
          origin,
        ),
        {
          headers: {
            Accept:
              "application/json",
          },
          redirect: "manual",
          signal:
            AbortSignal.timeout(
              10_000,
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
    results[index] = {
      status:
        response.status,
      ok:
        response.status ===
          200 &&
        body?.ok === true,
      latencyMs:
        Math.round(
          (
            performance.now() -
            started
          ) * 100,
        ) / 100,
    };
  } catch (error) {
    results[index] = {
      status: 0,
      ok: false,
      latencyMs:
        Math.round(
          (
            performance.now() -
            started
          ) * 100,
        ) / 100,
      error:
        error instanceof Error
          ? error.name
          : "unknown",
    };
  }
}

async function worker() {
  while (true) {
    const index =
      next++;
    if (index >= total) {
      return;
    }
    await one(index);
  }
}

const startedAt =
  new Date().toISOString();
const wallStart =
  performance.now();

await Promise.all(
  Array.from(
    {
      length:
        concurrency,
    },
    () => worker(),
  ),
);

const wallMs =
  performance.now() -
  wallStart;
const latencies =
  results
    .map(
      (item) =>
        item.latencyMs,
    )
    .sort(
      (a, b) => a - b,
    );

function percentile(p) {
  const index =
    Math.min(
      latencies.length - 1,
      Math.max(
        0,
        Math.ceil(
          latencies.length *
            p,
        ) - 1,
      ),
    );
  return latencies[index];
}

const succeeded =
  results.filter(
    (item) => item.ok,
  ).length;
const failed =
  total - succeeded;
const summary = {
  origin,
  endpoint:
    "/api/health",
  startedAt,
  total,
  concurrency,
  succeeded,
  failed,
  successRate:
    succeeded / total,
  wallMs:
    Math.round(
      wallMs * 100,
    ) / 100,
  requestsPerSecond:
    Math.round(
      (
        total /
        (wallMs / 1000)
      ) * 100,
    ) / 100,
  latencyMs: {
    p50:
      percentile(0.5),
    p95:
      percentile(0.95),
    p99:
      percentile(0.99),
    max:
      latencies[
        latencies.length - 1
      ],
  },
  statusCounts:
    Object.fromEntries(
      Object.entries(
        results.reduce(
          (counts, item) => {
            const key =
              String(
                item.status,
              );
            counts[key] =
              (
                counts[key] ??
                0
              ) + 1;
            return counts;
          },
          {},
        ),
      ).sort(),
    ),
  scope:
    "bounded ingress/managed-function health load only; no provider, Cosmos, authenticated user, or recovery/failover load",
};

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/hosted-ingress-load-acceptance.json",
  JSON.stringify(
    summary,
    null,
    2,
  ),
);

assert.equal(
  failed,
  0,
  `Hosted health load had ${failed} failed requests.`,
);
assert.ok(
  summary.latencyMs.p95 <=
    5000,
  `Hosted health p95 latency ${summary.latencyMs.p95}ms exceeded the conservative 5000ms acceptance ceiling.`,
);

console.log(
  `Hosted ingress load acceptance passed: ${total}/${total} successful at concurrency ${concurrency}; p95 ${summary.latencyMs.p95}ms. This does not prove provider/Cosmos/failover capacity.`,
);
