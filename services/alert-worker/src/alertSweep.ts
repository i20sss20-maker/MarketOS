export type SweepPageResponse = {
  ok: boolean;
  processedUsers: number;
  checkedGroups: number;
  triggeredCount: number;
  failureCount: number;
  cappedUsers: number;
  nextContinuationToken?: string | null;
  error?: string;
};

export type SweepSummary = {
  pages: number;
  processedUsers: number;
  checkedGroups: number;
  triggeredCount: number;
  failureCount: number;
  cappedUsers: number;
};

function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

export async function runAlertSweep(
  fetchImpl: typeof fetch = fetch,
): Promise<SweepSummary> {
  const endpoint =
    process.env.MARKETOS_INTERNAL_SWEEP_URL?.trim() ?? "";
  const secret =
    process.env.MARKETOS_WORKER_SECRET?.trim() ?? "";

  if (!endpoint.startsWith("https://")) {
    throw new Error(
      "MARKETOS_INTERNAL_SWEEP_URL must be an HTTPS URL.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "MARKETOS_WORKER_SECRET must contain at least 32 characters.",
    );
  }

  const maxPages = positiveInteger(
    process.env.ALERT_SWEEP_MAX_PAGES,
    5,
    20,
  );

  const summary: SweepSummary = {
    pages: 0,
    processedUsers: 0,
    checkedGroups: 0,
    triggeredCount: 0,
    failureCount: 0,
    cappedUsers: 0,
  };

  let continuationToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-marketos-worker-secret": secret,
      },
      body: JSON.stringify({
        ...(continuationToken
          ? { continuationToken }
          : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const payload = await response.json()
      .catch(() => null) as SweepPageResponse | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.error ??
        `Alert sweep endpoint failed (${response.status}).`,
      );
    }

    summary.pages += 1;
    summary.processedUsers += payload.processedUsers ?? 0;
    summary.checkedGroups += payload.checkedGroups ?? 0;
    summary.triggeredCount += payload.triggeredCount ?? 0;
    summary.failureCount += payload.failureCount ?? 0;
    summary.cappedUsers += payload.cappedUsers ?? 0;

    continuationToken =
      typeof payload.nextContinuationToken === "string" &&
      payload.nextContinuationToken
        ? payload.nextContinuationToken
        : undefined;

    if (!continuationToken) break;
  }

  return summary;
}
