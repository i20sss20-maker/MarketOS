import type { UserCloudState } from "./types.js";

const MAX_STATE_BYTES = 256 * 1024;
const MAX_WATCHLIST = 80;
const MAX_WORKSPACES = 20;
const MAX_ALERTS = 150;
const MAX_CUSTOM_INDICATORS = 30;
const MAX_UI_KEYS = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function boundedArray(value: unknown, maxItems: number) {
  return Array.isArray(value)
    ? value.slice(0, maxItems)
    : [];
}

function boundedObject(
  value: unknown,
  maxKeys: number,
): Record<string, unknown> {
  if (!isObject(value)) return {};

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, maxKeys)) {
    if (typeof key !== "string" || key.length > 120) continue;
    output[key] = item;
  }
  return output;
}

export function sanitizeUserCloudState(
  value: unknown,
): UserCloudState {
  if (!isObject(value)) {
    throw new Error("Invalid cloud state payload.");
  }

  const state: UserCloudState = {
    version: 1,
    updatedAt:
      typeof value.updatedAt === "number" &&
      Number.isFinite(value.updatedAt)
        ? Math.floor(value.updatedAt)
        : Date.now(),
    watchlist: boundedArray(value.watchlist, MAX_WATCHLIST),
    workspaces: boundedArray(value.workspaces, MAX_WORKSPACES),
    alerts: boundedArray(value.alerts, MAX_ALERTS),
    chartSettings: isObject(value.chartSettings)
      ? value.chartSettings
      : null,
    customIndicators: boundedArray(
      value.customIndicators,
      MAX_CUSTOM_INDICATORS,
    ),
    ui: boundedObject(value.ui, MAX_UI_KEYS),
  };

  if (jsonSize(state) > MAX_STATE_BYTES) {
    throw new Error("Cloud state payload is too large.");
  }

  return state;
}
