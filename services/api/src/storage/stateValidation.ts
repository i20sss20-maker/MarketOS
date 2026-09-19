import type { UserCloudState } from "./types.js";

const MAX_STATE_BYTES = 256 * 1024;
const MAX_WATCHLIST = 80;
const MAX_WATCHLIST_COLLECTIONS = 20;
const MAX_WATCHLIST_ITEMS_PER_COLLECTION = 100;
const MAX_WORKSPACES = 20;
const MAX_ALERTS = 150;
const MAX_CUSTOM_INDICATORS = 30;
const MAX_CHART_TEMPLATES = 30;
const MAX_DRAWING_SYMBOLS = 80;
const MAX_DRAWINGS_PER_SYMBOL = 150;
const MAX_UI_KEYS = 50;

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function jsonSize(value: unknown) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8",
  );
}

function boundedArray(
  value: unknown,
  maxItems: number,
) {
  return Array.isArray(value)
    ? value.slice(0, maxItems)
    : [];
}

function boundedWatchlistCollections(
  value: unknown,
) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_WATCHLIST_COLLECTIONS)
    .flatMap((raw) => {
      if (!isObject(raw)) return [];

      const id =
        typeof raw.id === "string"
          ? raw.id.trim().slice(0, 120)
          : "";
      const name =
        typeof raw.name === "string"
          ? raw.name.trim().slice(0, 60)
          : "";

      if (!id || !name) return [];

      return [{
        id,
        name,
        symbols: Array.isArray(raw.symbols)
          ? raw.symbols.slice(
              0,
              MAX_WATCHLIST_ITEMS_PER_COLLECTION,
            )
          : [],
        createdAt:
          typeof raw.createdAt === "number" &&
          Number.isFinite(raw.createdAt)
            ? Math.floor(raw.createdAt)
            : Date.now(),
        updatedAt:
          typeof raw.updatedAt === "number" &&
          Number.isFinite(raw.updatedAt)
            ? Math.floor(raw.updatedAt)
            : Date.now(),
      }];
    });
}

function boundedDrawings(
  value: unknown,
): Record<string, unknown[]> {
  if (!isObject(value)) return {};

  const output: Record<string, unknown[]> = {};

  for (
    const [symbolId, drawings]
    of Object.entries(value)
      .slice(0, MAX_DRAWING_SYMBOLS)
  ) {
    if (
      !symbolId ||
      symbolId.length > 180 ||
      !Array.isArray(drawings)
    ) {
      continue;
    }

    output[symbolId] =
      drawings.slice(
        0,
        MAX_DRAWINGS_PER_SYMBOL,
      );
  }

  return output;
}

function boundedObject(
  value: unknown,
  maxKeys: number,
): Record<string, unknown> {
  if (!isObject(value)) return {};

  const output: Record<string, unknown> = {};

  for (
    const [key, item]
    of Object.entries(value).slice(0, maxKeys)
  ) {
    if (
      typeof key !== "string" ||
      key.length > 120
    ) {
      continue;
    }

    output[key] = item;
  }

  return output;
}

export function sanitizeUserCloudState(
  value: unknown,
): UserCloudState {
  if (!isObject(value)) {
    throw new Error(
      "Invalid cloud state payload.",
    );
  }

  const state: UserCloudState = {
    version: 1,
    updatedAt:
      typeof value.updatedAt === "number" &&
      Number.isFinite(value.updatedAt)
        ? Math.floor(value.updatedAt)
        : Date.now(),
    watchlist: boundedArray(
      value.watchlist,
      MAX_WATCHLIST,
    ),
    watchlistCollections:
      boundedWatchlistCollections(
        value.watchlistCollections,
      ),
    workspaces: boundedArray(
      value.workspaces,
      MAX_WORKSPACES,
    ),
    alerts: boundedArray(
      value.alerts,
      MAX_ALERTS,
    ),

    // Alert inbox history and Push registrations are server-owned.
    // Browser uploads can never forge or replace them.
    alertEvents: [],
    pushSubscriptions: [],

    chartSettings:
      isObject(value.chartSettings)
        ? value.chartSettings
        : null,

    customIndicators: boundedArray(
      value.customIndicators,
      MAX_CUSTOM_INDICATORS,
    ),

    chartTemplates: boundedArray(
      value.chartTemplates,
      MAX_CHART_TEMPLATES,
    ),

    drawings:
      boundedDrawings(value.drawings),

    ui:
      boundedObject(
        value.ui,
        MAX_UI_KEYS,
      ),
  };

  if (jsonSize(state) > MAX_STATE_BYTES) {
    throw new Error(
      "Cloud state payload is too large.",
    );
  }

  return state;
}
