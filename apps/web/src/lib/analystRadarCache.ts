import type {
  AnalystRadarItem,
} from "./analystRadar";
import type {
  MarketSymbol,
} from "@marketos/market-core";

export type AnalystRadarCache = {
  version: 1;
  updatedAt: number;
  signature: string;
  items: AnalystRadarItem[];
};

const STORAGE_KEY =
  "marketos:analyst-radar-cache-v2";

export const ANALYST_RADAR_CACHE_TTL_MS =
  15 * 60 * 1000;

function storage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function analystRadarSignature(
  symbols: MarketSymbol[],
) {
  return symbols
    .map(
      (symbol) =>
        symbol.id,
    )
    .join("|");
}

function validItem(
  value: unknown,
): value is AnalystRadarItem {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const item =
    value as Partial<
      AnalystRadarItem
    >;

  return Boolean(
    item.symbol &&
    typeof item.symbol.id ===
      "string" &&
    typeof item.symbol.ticker ===
      "string" &&
    item.forecast &&
    typeof item.forecast
      .generatedAt === "number" &&
    (
      item.direction ===
        "bull" ||
      item.direction ===
        "base" ||
      item.direction ===
        "bear"
    ) &&
    typeof item
      .directionProbability ===
      "number" &&
    typeof item.confidence ===
      "number" &&
    typeof item.clarity ===
      "number",
  );
}

export function loadAnalystRadarCache(
  symbols: MarketSymbol[],
): AnalystRadarCache | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw =
      store.getItem(
        STORAGE_KEY,
      );

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as
      Partial<
        AnalystRadarCache
      >;

    if (
      parsed.version !== 1 ||
      typeof parsed.updatedAt !==
        "number" ||
      !Number.isFinite(
        parsed.updatedAt,
      ) ||
      typeof parsed.signature !==
        "string" ||
      parsed.signature !==
        analystRadarSignature(
          symbols,
        ) ||
      !Array.isArray(
        parsed.items,
      )
    ) {
      return null;
    }

    const items =
      parsed.items
        .filter(validItem)
        .slice(0, 8);

    if (items.length === 0) {
      return null;
    }

    return {
      version: 1,
      updatedAt:
        Math.floor(
          parsed.updatedAt,
        ),
      signature:
        parsed.signature,
      items,
    };
  } catch {
    return null;
  }
}

export function saveAnalystRadarCache(
  symbols: MarketSymbol[],
  items: AnalystRadarItem[],
  updatedAt = Date.now(),
) {
  const store = storage();
  if (!store) return;

  try {
    const payload:
      AnalystRadarCache = {
        version: 1,
        updatedAt:
          Math.floor(
            updatedAt,
          ),
        signature:
          analystRadarSignature(
            symbols,
          ),
        items:
          items
            .filter(validItem)
            .slice(0, 8),
      };

    store.setItem(
      STORAGE_KEY,
      JSON.stringify(
        payload,
      ),
    );
  } catch {
    // Cache writes are best effort.
  }
}

export function isAnalystRadarCacheStale(
  cache:
    AnalystRadarCache | null,
  now = Date.now(),
) {
  if (!cache) return true;

  return (
    now -
      cache.updatedAt >=
    ANALYST_RADAR_CACHE_TTL_MS
  );
}
