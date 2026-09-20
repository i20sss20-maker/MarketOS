import type {
  AnalystRadarItem,
} from "./analystRadar";
import type {
  MarketSymbol,
} from "@marketos/market-core";

export type AnalystRadarCache = {
  version: 2;
  updatedAt: number;
  signature: string;
  items: AnalystRadarItem[];
  previousUpdatedAt?: number;
  previousItems: AnalystRadarItem[];
};

const STORAGE_KEY =
  "marketos:analyst-radar-cache-v3";

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
      parsed.version !== 2 ||
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

    const previousItems =
      Array.isArray(
        parsed.previousItems,
      )
        ? parsed.previousItems
            .filter(validItem)
            .slice(0, 8)
        : [];

    return {
      version: 2,
      updatedAt:
        Math.floor(
          parsed.updatedAt,
        ),
      signature:
        parsed.signature,
      items,
      previousUpdatedAt:
        typeof parsed.previousUpdatedAt ===
          "number" &&
        Number.isFinite(
          parsed.previousUpdatedAt,
        )
          ? Math.floor(
              parsed.previousUpdatedAt,
            )
          : undefined,
      previousItems,
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
  if (!store) return null;

  try {
    const signature =
      analystRadarSignature(
        symbols,
      );
    const existing =
      loadAnalystRadarCache(
        symbols,
      );
    const normalizedItems =
      items
        .filter(validItem)
        .slice(0, 8);

    const payload:
      AnalystRadarCache = {
        version: 2,
        updatedAt:
          Math.floor(
            updatedAt,
          ),
        signature,
        items:
          normalizedItems,
        previousUpdatedAt:
          existing?.updatedAt,
        previousItems:
          existing?.items ?? [],
      };

    store.setItem(
      STORAGE_KEY,
      JSON.stringify(
        payload,
      ),
    );

    return payload;
  } catch {
    // Cache writes are best effort.
    return null;
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
