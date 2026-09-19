import {
  useEffect,
  useState,
} from "react";
import type {
  ChartTab,
  RecentSymbol,
} from "../lib/chartTabs";

type Props = {
  tabs: ChartTab[];
  activeTabId: string | null;
  recentSymbols: RecentSymbol[];
  maxTabs: number;
  onSelect: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddSymbol: (
    symbol: RecentSymbol["symbol"],
  ) => void;
  onOpenSearch: () => void;
};

export default function ChartTabsBar({
  tabs,
  activeTabId,
  recentSymbols,
  maxTabs,
  onSelect,
  onCloseTab,
  onAddSymbol,
  onOpenSearch,
}: Props) {
  const [open, setOpen] =
    useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, [open]);

  return (
    <div
      className="chart-tabs-shell"
      dir="ltr"
    >
      <div className="chart-tabs-list">
        {tabs.map((tab) => (
          <div
            className={
              tab.id === activeTabId
                ? "chart-tab active"
                : "chart-tab"
            }
            key={tab.id}
          >
            <button
              className="chart-tab-main"
              onClick={() =>
                onSelect(tab.id)
              }
              title={tab.symbol.name}
            >
              <strong>
                {tab.symbol.ticker}
              </strong>
              <small>
                {tab.timeframe.toUpperCase()}
                {" · "}
                {tab.chartView}
              </small>
            </button>

            <button
              className="chart-tab-close"
              onClick={() =>
                onCloseTab(tab.id)
              }
              disabled={tabs.length <= 1}
              title={
                tabs.length <= 1
                  ? "لا يمكن إغلاق آخر Tab"
                  : "إغلاق"
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="chart-tabs-add-wrap">
        <button
          className="chart-tab-add"
          disabled={
            tabs.length >= maxTabs
          }
          onClick={() =>
            setOpen(
              (value) => !value,
            )
          }
          title={
            tabs.length >= maxTabs
              ? `الحد ${maxTabs} Tabs`
              : "فتح Tab جديد"
          }
        >
          +
        </button>

        {open &&
        tabs.length < maxTabs ? (
          <div
            className="chart-tabs-popover"
            dir="rtl"
          >
            <div className="chart-tabs-popover-head">
              <div>
                <strong>
                  Recent Symbols
                </strong>
                <small>
                  آخر الأصول المستخدمة
                </small>
              </div>

              <span>
                {tabs.length} / {maxTabs}
              </span>
            </div>

            <div className="chart-tabs-recent">
              {recentSymbols.map(
                (item) => (
                  <button
                    key={
                      item.symbol.id
                    }
                    onClick={() => {
                      onAddSymbol(
                        item.symbol,
                      );
                      setOpen(false);
                    }}
                  >
                    <span>
                      <strong>
                        {
                          item.symbol
                            .ticker
                        }
                      </strong>
                      <small>
                        {item.symbol.name}
                      </small>
                    </span>
                    <b>
                      {
                        item.symbol
                          .exchange
                      }
                    </b>
                  </button>
                ),
              )}

              {recentSymbols.length ===
              0 ? (
                <div className="chart-tabs-empty">
                  ما عندك رموز حديثة إلى الآن
                </div>
              ) : null}
            </div>

            <button
              className="chart-tabs-search"
              onClick={() => {
                onOpenSearch();
                setOpen(false);
              }}
            >
              <span>
                ⌕ بحث عن رمز آخر
              </span>
              <b>Ctrl K</b>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
