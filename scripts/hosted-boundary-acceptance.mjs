import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";

const raw =
  process.env.MARKETOS_ACCEPTANCE_BASE_URL ??
  "";

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
  "Hosted acceptance requires HTTPS.",
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
  "Base URL must be an origin without a path.",
);

const origin =
  base.origin;

async function request(
  path,
  options = {},
) {
  const response =
    await fetch(
      new URL(path, origin),
      {
        redirect: "manual",
        signal:
          AbortSignal.timeout(
            15_000,
          ),
        ...options,
        headers: {
          Accept:
            "application/json",
          Origin:
            origin,
          ...(options.headers ??
            {}),
        },
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

const evidence = {
  origin,
  checkedAt:
    new Date().toISOString(),
  checks: {},
};

const health =
  await request(
    "/api/health",
  );
assert.equal(
  health.status,
  200,
);
assert.equal(
  health.body?.ok,
  true,
);
assert.ok(
  [
    "production",
    "azure-production",
  ].includes(
    health.body
      ?.environment,
  ),
  "Hosted API must identify itself as production.",
);
assert.equal(
  health.body
    ?.marketData?.mode,
  "provider",
);
assert.equal(
  health.body
    ?.marketData?.configured,
  true,
);
assert.equal(
  health.body
    ?.userData?.persistent,
  true,
);
assert.equal(
  health.body
    ?.forecastQuota
    ?.configured,
  true,
);
assert.equal(
  health.body
    ?.marketDataQuota
    ?.configured,
  true,
  "Hosted production requires a configured persistent market-data request cap.",
);
assert.equal(
  health.body
    ?.operations
    ?.metricAlertsConfigured,
  true,
  "Hosted production requires configured Azure metric alerts.",
);
assert.equal(
  health.body
    ?.operations
    ?.costBudgetConfigured,
  true,
  "Hosted production requires a configured Azure cost budget notification.",
);
assert.equal(
  health.body
    ?.operations
    ?.configured,
  true,
);
evidence.checks.health =
  health;

const readiness =
  await request(
    "/api/production/readiness",
  );
assert.equal(
  readiness.status,
  200,
  "Configuration readiness must be green before hosted acceptance continues.",
);
assert.equal(
  readiness.body
    ?.configured,
  true,
);
assert.equal(
  readiness.body
    ?.productionReady,
  false,
  "Configuration readiness must not falsely claim full production acceptance.",
);
assert.deepEqual(
  readiness.body
    ?.blockers,
  [],
);
evidence.checks.readiness =
  readiness;

const spoofedPrincipal =
  Buffer.from(
    JSON.stringify({
      userId:
        "spoofed-acceptance-user",
      identityProvider:
        "aad",
      userRoles: [
        "authenticated",
      ],
    }),
  ).toString("base64");

const spoofAttempt =
  await request(
    "/api/market/search",
    {
      headers: {
        "x-ms-client-principal":
          spoofedPrincipal,
      },
    },
  );

assert.ok(
  [401, 403].includes(
    spoofAttempt.status,
  ),
  "Static Web Apps must strip/reject a client-supplied principal header. The empty search query ensures this check cannot reach the market-data provider even if the boundary is broken; a broken boundary may still touch quota storage.",
);
evidence.checks
  .spoofedPrincipal =
  spoofAttempt;

const anonymousProviderChecks = [
  {
    name: "quote",
    path:
      "/api/market/quote",
  },
  {
    name: "candles",
    path:
      "/api/market/candles",
  },
  {
    name: "search",
    path:
      "/api/market/search?q=AAPL",
  },
  {
    name: "overview",
    path:
      "/api/market/overview",
    options: {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify({
          symbols: [],
        }),
    },
  },
  {
    name: "events",
    path:
      "/api/market/events",
    options: {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify({
          startDate:
            "2026-01-01",
          endDate:
            "2026-01-02",
        }),
    },
  },
  {
    name: "feed",
    path:
      "/api/market/feed",
    options: {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify({
          symbols: [],
        }),
    },
  },
];

for (
  const check
  of anonymousProviderChecks
) {
  const response =
    await request(
      check.path,
      check.options,
    );

  assert.equal(
    response.status,
    401,
    `Anonymous ${check.name} must be rejected before provider work.`,
  );

  assert.equal(
    response.body?.code,
    "AUTH_REQUIRED",
  );

  evidence.checks[
    `anonymous-${check.name}`
  ] = response;
}

const snapshot =
  await request(
    "/api/market/snapshot",
  );
assert.equal(
  snapshot.status,
  410,
);
assert.equal(
  snapshot.body?.code,
  "DEMO_DISABLED",
);
evidence.checks.snapshot =
  snapshot;

const journal =
  await request(
    "/api/user/forecasts",
  );
assert.ok(
  [401, 403].includes(
    journal.status,
  ),
  "Anonymous server forecast history must be blocked by SWA or the API.",
);
evidence.checks
  .anonymousJournal =
  journal;

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);
writeFileSync(
  "artifacts/hosted-boundary-acceptance.json",
  JSON.stringify(
    evidence,
    null,
    2,
  ),
);

console.log(
  "Hosted boundary acceptance passed: production configuration is green, forged principal headers are rejected, and anonymous provider access is blocked before paid work.",
);
