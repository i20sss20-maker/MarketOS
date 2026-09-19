import { useState, type RefObject } from "react";
import type { MarketSymbol, Quote } from "@marketos/market-core";
import CommercialSkeleton from "./CommercialSkeleton";
import type { WatchlistCollection } from "../lib/watchlistCollections";

export type WatchlistFilter = "all" | "equities" | "forex" | "crypto" | "futures";
export type WatchlistSort = "manual" | "change-desc" | "change-asc" | "symbol";

type Props = {
  open: boolean;
  title: string;
  query: string;
  searchLoading: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  filter: WatchlistFilter;
  sort: WatchlistSort;
  collections: WatchlistCollection[];
  activeCollectionId: string;
  collectionLimit: number;
  totalItemCount: number;
  totalItemLimit: number;
  visibleSymbols: MarketSymbol[];
  activeId: string;
  activeQuote?: Quote;
  quoteMap: ReadonlyMap<string, Quote>;
  alertCounts: ReadonlyMap<string, number>;
  loading: boolean;
  replayActive: boolean;
  provider: string;
  updatedAt: number | null;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: WatchlistFilter) => void;
  onSortChange: (value: WatchlistSort) => void;
  onCollectionChange: (id: string) => void;
  onCreateCollection: (name: string) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onSelect: (symbol: MarketSymbol) => void;
  formatPrice: (value?: number) => string;
  formatPercent: (value?: number) => string;
};

export default function CommercialWatchlistPanel({
  open,
  title,
  query,
  searchLoading,
  searchInputRef,
  filter,
  sort,
  collections,
  activeCollectionId,
  collectionLimit,
  totalItemCount,
  totalItemLimit,
  visibleSymbols,
  activeId,
  activeQuote,
  quoteMap,
  alertCounts,
  loading,
  replayActive,
  provider,
  updatedAt,
  error,
  onClose,
  onRefresh,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onCollectionChange,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onSelect,
  formatPrice,
  formatPercent,
}: Props) {
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const canCreate =
    collections.length < collectionLimit;

  return (
    <aside className={open ? "watchlist panel commercial-side-panel" : "watchlist panel commercial-side-panel panel-collapsed"}>
      <div className="watchlist-head commercial-panel-head">
        <div>
          <div className="panel-title">{title}</div>
          {!query.trim() ? <small>{visibleSymbols.length} رمز</small> : null}
        </div>
        <div className="watchlist-head-actions">
          <button
            title="تحديث أسعار القائمة"
            onClick={onRefresh}
            disabled={loading || replayActive}
          >
            {loading ? "…" : "↻"}
          </button>
          <button title="بحث وإضافة رمز" onClick={() => searchInputRef.current?.focus()}>
            +
          </button>
          <button className="commercial-panel-close" title="إغلاق القائمة" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="watchlist-collection-bar">
        <select
          value={activeCollectionId}
          onChange={(event) =>
            onCollectionChange(
              event.target.value,
            )
          }
          aria-label="قائمة المتابعة النشطة"
        >
          {collections.map(
            (collection) => (
              <option
                key={collection.id}
                value={collection.id}
              >
                {collection.name} · {collection.symbols.length}
              </option>
            ),
          )}
        </select>

        <button
          className={manageOpen ? "active" : ""}
          onClick={() =>
            setManageOpen(
              (value) => !value,
            )
          }
          title="إدارة قوائم المتابعة"
        >
          ☷
        </button>
      </div>

      {manageOpen ? (
        <div
          className="watchlist-collection-manager"
          dir="rtl"
        >
          <div className="watchlist-collection-create">
            <input
              value={newName}
              maxLength={60}
              onChange={(event) =>
                setNewName(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  newName.trim() &&
                  canCreate
                ) {
                  onCreateCollection(
                    newName,
                  );
                  setNewName("");
                }
              }}
              placeholder="اسم قائمة جديدة…"
            />
            <button
              onClick={() => {
                if (!newName.trim()) return;
                onCreateCollection(
                  newName,
                );
                setNewName("");
              }}
              disabled={
                !newName.trim() ||
                !canCreate
              }
            >
              + قائمة
            </button>
          </div>

          <div className="watchlist-collection-list">
            {collections.map(
              (collection) => (
                <div
                  className={
                    collection.id ===
                    activeCollectionId
                      ? "watchlist-collection-row active"
                      : "watchlist-collection-row"
                  }
                  key={collection.id}
                >
                  <button
                    className="watchlist-collection-open"
                    onClick={() =>
                      onCollectionChange(
                        collection.id,
                      )
                    }
                  >
                    <strong>
                      {collection.name}
                    </strong>
                    <small>
                      {collection.symbols.length} رمز
                    </small>
                  </button>

                  <button
                    title="إعادة تسمية"
                    onClick={() => {
                      const next =
                        window.prompt(
                          "اسم القائمة",
                          collection.name,
                        );
                      if (next?.trim()) {
                        onRenameCollection(
                          collection.id,
                          next,
                        );
                      }
                    }}
                  >
                    ✎
                  </button>

                  <button
                    className="danger"
                    title={
                      collections.length <= 1
                        ? "يجب الاحتفاظ بقائمة واحدة على الأقل"
                        : "حذف القائمة"
                    }
                    disabled={
                      collections.length <= 1
                    }
                    onClick={() =>
                      onDeleteCollection(
                        collection.id,
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ),
            )}
          </div>

          <footer>
            <span>
              {collections.length} / {collectionLimit} قوائم
            </span>
            <span>
              {totalItemCount} / {totalItemLimit} رمز إجمالي
            </span>
          </footer>
        </div>
      ) : null}

      <div className="search-box">
        <span>{searchLoading ? "…" : "⌕"}</span>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ابحث عن سهم أو سوق"
        />
      </div>

      {!query.trim() ? (
        <div className="watchlist-controls">
          <select
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as WatchlistFilter)}
            aria-label="فلتر قائمة المتابعة"
          >
            <option value="all">الكل</option>
            <option value="equities">أسهم</option>
            <option value="forex">فوركس</option>
            <option value="crypto">كريبتو</option>
            <option value="futures">عقود/سلع</option>
          </select>

          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as WatchlistSort)}
            aria-label="ترتيب قائمة المتابعة"
          >
            <option value="manual">ترتيب القائمة</option>
            <option value="change-desc">الأعلى حركة</option>
            <option value="change-asc">الأقل حركة</option>
            <option value="symbol">الرمز A-Z</option>
          </select>
        </div>
      ) : null}

      <div className="symbol-list watchlist-v2-list">
        {loading && !query.trim() && quoteMap.size === 0 ? (
          <CommercialSkeleton rows={7} compact label="جاري تحديث قائمة المتابعة" />
        ) : null}

        {visibleSymbols.map((symbol) => {
          const rowQuote =
            quoteMap.get(symbol.id) ??
            (symbol.id === activeId ? activeQuote : undefined);
          const movement = rowQuote?.percentChange;
          const alertCount = alertCounts.get(symbol.id) ?? 0;

          return (
            <button
              className={`symbol-row watchlist-v2-row ${symbol.id === activeId ? "active" : ""}`}
              key={symbol.id}
              onClick={() => onSelect(symbol)}
            >
              <span className="symbol-meta">
                <strong>
                  {symbol.ticker}
                  {alertCount > 0 ? (
                    <em className="watchlist-alert-count" title={`${alertCount} تنبيه نشط`}>
                      {alertCount}
                    </em>
                  ) : null}
                </strong>
                <small>{symbol.exchange}</small>
                <small className="watchlist-asset-label">{symbol.assetClass}</small>
              </span>

              <span className="watchlist-quote-cell" dir="ltr">
                <strong>{formatPrice(rowQuote?.price)}</strong>
                <small
                  className={
                    movement === undefined
                      ? ""
                      : movement >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {formatPercent(movement)}
                </small>
              </span>
            </button>
          );
        })}

        {visibleSymbols.length === 0 ? (
          <div className="commercial-empty-state">
            <span>⌕</span>
            <strong>ما لقينا نتائج</strong>
            <small>جرّب رمز أو اسم سوق مختلف.</small>
          </div>
        ) : null}
      </div>

      {!query.trim() ? (
        <div className="watchlist-footer">
          <span>{provider === "demo" ? "Preview" : provider}</span>
          <span>
            {updatedAt
              ? new Date(updatedAt).toLocaleTimeString("ar-SA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
          <small>{title}</small>
          {error ? <small>تعذر تحديث بعض الأسعار.</small> : null}
        </div>
      ) : null}
    </aside>
  );
}
