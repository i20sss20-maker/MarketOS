import type { MarketSymbol } from "@marketos/market-core";
import { loadWatchlist } from "./workspace";

export type WatchlistCollection = {
  id: string;
  name: string;
  symbols: MarketSymbol[];
  createdAt: number;
  updatedAt: number;
};

const COLLECTIONS_KEY =
  "marketos:watchlist-collections";
const ACTIVE_KEY =
  "marketos:active-watchlist";

const MAX_COLLECTIONS = 20;
const MAX_SYMBOLS_PER_COLLECTION = 100;

function storage() {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function id() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `watchlist-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function validSymbol(
  value: unknown,
): value is MarketSymbol {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const symbol =
    value as Partial<MarketSymbol>;

  return (
    typeof symbol.id === "string" &&
    typeof symbol.ticker === "string" &&
    typeof symbol.name === "string" &&
    typeof symbol.exchange === "string" &&
    typeof symbol.assetClass === "string" &&
    typeof symbol.currency === "string"
  );
}

function normalizeSymbols(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Map(
      value
        .filter(validSymbol)
        .map((symbol) => [
          symbol.id,
          symbol,
        ]),
    ).values(),
  ].slice(
    0,
    MAX_SYMBOLS_PER_COLLECTION,
  );
}

export function normalizeWatchlistCollection(
  value: unknown,
): WatchlistCollection | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const item =
    value as Partial<WatchlistCollection>;

  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string"
  ) {
    return null;
  }

  const collectionId =
    item.id.trim().slice(0, 120);
  const name =
    item.name.trim().slice(0, 60);

  if (!collectionId || !name) {
    return null;
  }

  const createdAt =
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt)
      ? Math.floor(item.createdAt)
      : Date.now();

  const updatedAt =
    typeof item.updatedAt === "number" &&
    Number.isFinite(item.updatedAt)
      ? Math.floor(item.updatedAt)
      : createdAt;

  return {
    id: collectionId,
    name,
    symbols:
      normalizeSymbols(
        item.symbols,
      ),
    createdAt,
    updatedAt,
  };
}

export function saveWatchlistCollections(
  collections: WatchlistCollection[],
) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      COLLECTIONS_KEY,
      JSON.stringify(
        collections
          .map(
            normalizeWatchlistCollection,
          )
          .filter(
            (
              item,
            ): item is WatchlistCollection =>
              item !== null,
          )
          .slice(0, MAX_COLLECTIONS),
      ),
    );
  } catch {
    // Ignore restricted storage.
  }
}

export function saveActiveWatchlistId(
  collectionId: string,
) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      ACTIVE_KEY,
      collectionId,
    );
  } catch {
    // Ignore restricted storage.
  }
}

export function createWatchlistCollection(
  name: string,
  symbols: MarketSymbol[] = [],
): WatchlistCollection {
  const normalizedName =
    name.trim().slice(0, 60);

  if (!normalizedName) {
    throw new Error(
      "Watchlist name is required.",
    );
  }

  const now = Date.now();

  return {
    id: id(),
    name: normalizedName,
    symbols:
      normalizeSymbols(symbols),
    createdAt: now,
    updatedAt: now,
  };
}

function defaultCollection(
  fallbackSymbols: MarketSymbol[],
) {
  return createWatchlistCollection(
    "قائمتي",
    loadWatchlist(
      fallbackSymbols,
    ),
  );
}

export function loadWatchlistCollections(
  fallbackSymbols: MarketSymbol[],
): WatchlistCollection[] {
  const store = storage();

  if (!store) {
    return [
      defaultCollection(
        fallbackSymbols,
      ),
    ];
  }

  try {
    const raw =
      store.getItem(
        COLLECTIONS_KEY,
      );

    if (raw) {
      const parsed =
        JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        const collections =
          parsed
            .map(
              normalizeWatchlistCollection,
            )
            .filter(
              (
                item,
              ): item is WatchlistCollection =>
                item !== null,
            )
            .slice(
              0,
              MAX_COLLECTIONS,
            );

        if (collections.length > 0) {
          return collections;
        }
      }
    }
  } catch {
    // Fall through to legacy migration.
  }

  const migrated = [
    defaultCollection(
      fallbackSymbols,
    ),
  ];

  saveWatchlistCollections(
    migrated,
  );
  saveActiveWatchlistId(
    migrated[0].id,
  );

  return migrated;
}

export function loadActiveWatchlistId(
  collections: WatchlistCollection[],
) {
  const fallback =
    collections[0]?.id ?? "";

  const store = storage();
  if (!store) return fallback;

  try {
    const saved =
      store.getItem(ACTIVE_KEY);

    if (
      saved &&
      collections.some(
        (collection) =>
          collection.id === saved,
      )
    ) {
      return saved;
    }
  } catch {
    // Use fallback.
  }

  if (fallback) {
    saveActiveWatchlistId(
      fallback,
    );
  }

  return fallback;
}

export function totalWatchlistItems(
  collections: WatchlistCollection[],
) {
  return collections.reduce(
    (sum, collection) =>
      sum + collection.symbols.length,
    0,
  );
}

export function updateCollectionSymbols(
  collections: WatchlistCollection[],
  collectionId: string,
  symbols: MarketSymbol[],
) {
  return collections.map(
    (collection) =>
      collection.id === collectionId
        ? {
            ...collection,
            symbols:
              normalizeSymbols(
                symbols,
              ),
            updatedAt: Date.now(),
          }
        : collection,
  );
}

export function renameWatchlistCollection(
  collections: WatchlistCollection[],
  collectionId: string,
  name: string,
) {
  const normalizedName =
    name.trim().slice(0, 60);

  if (!normalizedName) {
    return collections;
  }

  return collections.map(
    (collection) =>
      collection.id === collectionId
        ? {
            ...collection,
            name: normalizedName,
            updatedAt: Date.now(),
          }
        : collection,
  );
}
