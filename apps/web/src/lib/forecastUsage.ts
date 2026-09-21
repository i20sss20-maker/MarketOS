export const FORECAST_USAGE_EVENT =
  "marketos:forecast-usage";
const STORAGE_KEY =
  "marketos:forecast-usage:v1";

export type ForecastUsageSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
  updatedAt: number;
};

function validInteger(
  value: unknown,
) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  );
}

export function normalizeForecastUsage(
  value: unknown,
): ForecastUsageSnapshot | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const input =
    value as Partial<
      ForecastUsageSnapshot
    >;

  if (
    !validInteger(input.used) ||
    !validInteger(input.limit) ||
    !validInteger(input.remaining) ||
    !validInteger(input.resetAt) ||
    input.used! < 0 ||
    input.limit! < 1 ||
    input.limit! > 500 ||
    input.remaining! < 0 ||
    input.remaining! >
      input.limit! ||
    input.used! <
      input.limit! -
        input.remaining! ||
    input.resetAt! <=
      Date.now()
  ) {
    return null;
  }

  return {
    used: input.used!,
    limit: input.limit!,
    remaining:
      input.remaining!,
    resetAt: input.resetAt!,
    updatedAt:
      validInteger(
        input.updatedAt,
      ) &&
      input.updatedAt! > 0
        ? input.updatedAt!
        : Date.now(),
  };
}

export function loadForecastUsage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    const raw =
      window.sessionStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) return null;

    const usage =
      normalizeForecastUsage(
        JSON.parse(raw),
      );

    if (!usage) {
      window.sessionStorage.removeItem(
        STORAGE_KEY,
      );
    }

    return usage;
  } catch {
    return null;
  }
}

export function recordForecastUsage(
  value: unknown,
) {
  const usage =
    normalizeForecastUsage(value);

  if (
    !usage ||
    typeof window ===
      "undefined"
  ) {
    return usage;
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(usage),
    );
  } catch {
    // Session persistence is optional.
  }

  window.dispatchEvent(
    new CustomEvent(
      FORECAST_USAGE_EVENT,
      {
        detail: usage,
      },
    ),
  );

  return usage;
}
