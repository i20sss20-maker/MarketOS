import type {
  MarketEvent,
  MarketOverviewItem,
} from "@marketos/market-core";
import type { AlertInboxEvent } from "./alertInboxApi";
import type { SavedWorkspace } from "./workspace";

export type DashboardModel = {
  advancers: number;
  decliners: number;
  unchanged: number;
  averageMove: number;
  movers: MarketOverviewItem[];
  nextEvents: MarketEvent[];
  unreadAlerts: AlertInboxEvent[];
  recentWorkspaces: SavedWorkspace[];
};

function finitePercent(item: MarketOverviewItem) {
  const value = item.quote.percentChange;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}

function eventSortKey(event: MarketEvent) {
  return `${event.date}T${event.time ?? "23:59:59"}`;
}

export function buildDashboardModel(
  overview: MarketOverviewItem[],
  events: MarketEvent[],
  alertEvents: AlertInboxEvent[],
  workspaces: SavedWorkspace[],
): DashboardModel {
  const validOverview = overview.filter((item) =>
    typeof item.quote.percentChange === "number" &&
    Number.isFinite(item.quote.percentChange),
  );

  const advancers = validOverview.filter(
    (item) => finitePercent(item) > 0,
  ).length;
  const decliners = validOverview.filter(
    (item) => finitePercent(item) < 0,
  ).length;
  const unchanged =
    validOverview.length - advancers - decliners;

  const averageMove = validOverview.length
    ? validOverview.reduce(
        (sum, item) => sum + finitePercent(item),
        0,
      ) / validOverview.length
    : 0;

  const movers = [...validOverview]
    .sort(
      (a, b) =>
        Math.abs(finitePercent(b)) -
          Math.abs(finitePercent(a)) ||
        finitePercent(b) -
          finitePercent(a),
    )
    .slice(0, 6);

  const nextEvents = [...events]
    .sort((a, b) =>
      eventSortKey(a).localeCompare(eventSortKey(b)),
    )
    .slice(0, 5);

  const unreadAlerts = alertEvents
    .filter((event) => !event.readAt)
    .sort((a, b) => b.triggeredAt - a.triggeredAt)
    .slice(0, 5);

  const recentWorkspaces = [...workspaces]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 4);

  return {
    advancers,
    decliners,
    unchanged,
    averageMove,
    movers,
    nextEvents,
    unreadAlerts,
    recentWorkspaces,
  };
}
