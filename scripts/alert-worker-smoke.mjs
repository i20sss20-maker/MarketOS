import assert from "node:assert/strict";

process.env.MARKETOS_INTERNAL_SWEEP_URL =
  "https://marketos.example/api/internal/alerts/sweep";
process.env.MARKETOS_WORKER_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ALERT_SWEEP_MAX_PAGES = "5";

const { runAlertSweep } =
  await import("../services/alert-worker/dist/src/alertSweep.js");

const calls = [];
const mockFetch = async (url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  calls.push({
    url: String(url),
    secret: init?.headers?.["x-marketos-worker-secret"],
    body,
  });

  if (calls.length === 1) {
    return new Response(
      JSON.stringify({
        ok: true,
        processedUsers: 10,
        checkedGroups: 34,
        triggeredCount: 3,
        failureCount: 1,
        cappedUsers: 2,
        nextContinuationToken: "page-2",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processedUsers: 4,
      checkedGroups: 12,
      triggeredCount: 1,
      failureCount: 0,
      cappedUsers: 0,
      nextContinuationToken: null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};

const summary = await runAlertSweep(mockFetch);

assert.equal(calls.length, 2);
assert.equal(calls[0].url, process.env.MARKETOS_INTERNAL_SWEEP_URL);
assert.equal(calls[0].secret, process.env.MARKETOS_WORKER_SECRET);
assert.deepEqual(calls[0].body, {});
assert.deepEqual(calls[1].body, {
  continuationToken: "page-2",
});

assert.deepEqual(summary, {
  pages: 2,
  processedUsers: 14,
  checkedGroups: 46,
  triggeredCount: 4,
  failureCount: 1,
  cappedUsers: 2,
});

process.env.MARKETOS_INTERNAL_SWEEP_URL = "http://not-secure.example";
await assert.rejects(
  () => runAlertSweep(mockFetch),
  /must be an HTTPS URL/,
);

process.env.MARKETOS_INTERNAL_SWEEP_URL =
  "https://marketos.example/api/internal/alerts/sweep";
process.env.MARKETOS_WORKER_SECRET = "short";
await assert.rejects(
  () => runAlertSweep(mockFetch),
  /at least 32 characters/,
);

console.log(
  `Alert worker smoke passed: pages=${summary.pages}, users=${summary.processedUsers}, triggered=${summary.triggeredCount}`,
);
