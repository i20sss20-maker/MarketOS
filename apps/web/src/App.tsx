import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LogicalRange } from "lightweight-charts";
import {
  applySmartScreener,
  parseSmartScreenerQuery,
} from "@marketos/screener-core";
import {
  canUseFeature,
  type FeatureId,
  type ResolvedEntitlement,
} from "@marketos/entitlements-core";
import type {
  Candle,
  ChartAnalysisResponse,
  CompanyRelease,
  MarketDataStatus,
  MarketEvent,
  MarketOverviewItem,
  MarketSymbol,
  MultiTimeframeAnalysisResponse,
  Quote,
  Timeframe,
} from "@marketos/market-core";
import MarketChart, {
  type ChartSnapshotCapture,
  type ChartView,
} from "./components/MarketChart";
import PaneVisualControls from "./components/PaneVisualControls";
import PaneLinkControls from "./components/PaneLinkControls";
import ChartTabsBar from "./components/ChartTabsBar";
import CommercialTopBar from "./components/CommercialTopBar";
import HomeDashboard from "./components/HomeDashboard";
import ReplaySetupPanel from "./components/ReplaySetupPanel";
import CommandPalette, { type CommandPaletteItem } from "./components/CommandPalette";
import AccountPanel from "./components/AccountPanel";
import CommercialAiPanel from "./components/CommercialAiPanel";
import CommercialWatchlistPanel from "./components/CommercialWatchlistPanel";
import DrawingToolIcon from "./components/DrawingToolIcon";
import AdvancedAlertsPanel from "./components/AdvancedAlertsPanel";
import AlertInboxPanel from "./components/AlertInboxPanel";
import CompanyFeedPanel from "./components/CompanyFeedPanel";
import CorrelationPanel from "./components/CorrelationPanel";
import ChartSettingsPanel from "./components/ChartSettingsPanel";
import ChartTemplatesPanel from "./components/ChartTemplatesPanel";
import ObjectTreePanel, { type ObjectTreePaneId } from "./components/ObjectTreePanel";
import InstrumentOverviewPanel from "./components/InstrumentOverviewPanel";
import ExportPanel from "./components/ExportPanel";
import IndicatorLab from "./components/IndicatorLab";
import MarketEventsPanel from "./components/MarketEventsPanel";
import StrategyTester from "./components/StrategyTester";
import PlansPanel from "./components/PlansPanel";
import SystemPanel from "./components/SystemPanel";
import { analyzeChart, analyzeMultipleTimeframes } from "./lib/aiApi";
import {
  anonymousEntitlement,
  getUserEntitlements,
} from "./lib/entitlementsApi";
import {
  applyCloudStateToLocal,
  collectLocalCloudState,
  deleteCloudState,
  getAuthPrincipal,
  getCloudState,
  putCloudState,
  type AuthPrincipal,
  type CloudStateResponse,
} from "./lib/cloudState";
import { buildDataWindowSnapshot } from "./lib/dataWindow";
import { buildHorizontalDrawingAlertSpec } from "./lib/drawingAlerts";
import {
  buildReplaySessionStats,
  defaultReplayStartIndex,
  isReplaySpeed,
  replayIntervalMs,
  replaySpeeds,
  type ReplaySpeed,
} from "./lib/replay";
import { createDemoCandles, createDemoQuote } from "./lib/demoData";
import { createBrowserDemoFeed } from "./lib/demoFeed";
import { createBrowserDemoEvents, localDateRange } from "./lib/demoEvents";
import { getCompanyFeed } from "./lib/feedApi";
import {
  buildMarketShareUrl,
  candlesToCsv,
  exportFilename,
  parseMarketShareState,
} from "./lib/exportTools";
import { getMarketEvents } from "./lib/eventsApi";
import { getSystemHealth, type SystemHealth } from "./lib/systemApi";
import {
  loadChartSettings,
  resetChartSettings,
  saveChartSettings,
  type ChartSettings,
} from "./lib/chartSettings";
import {
  loadCustomIndicators,
  saveCustomIndicators,
  type CustomIndicatorDefinition,
} from "./lib/customIndicators";
import {
  createChartTemplate,
  loadChartTemplates,
  mergeTemplateCustomIndicators,
  saveChartTemplates,
  type ChartTemplateDefinition,
  type SavedChartTemplate,
} from "./lib/chartTemplates";
import type { ChartDrawing, DrawingPoint, DrawingTool } from "./lib/drawings";
import {
  createDrawingId,
  drawingDetail,
  drawingName,
  loadDrawings,
  saveDrawings,
  withDrawingMeta,
} from "./lib/drawings";
import {
  canRedoDrawings,
  canUndoDrawings,
  commitDrawingHistory,
  createDrawingHistory,
  redoDrawingHistory,
  undoDrawingHistory,
} from "./lib/drawingHistory";
import {
  createAlertConditionId,
  describeAdvancedAlert,
  evaluateAdvancedAlerts,
  type AdvancedAlert,
  type AdvancedAlertCondition,
  type AlertLogic,
} from "@marketos/alert-core";
import {
  createAdvancedAlert,
  loadAlerts,
  rearmAlert,
  sanitizeAlerts,
  saveAlerts,
  toggleAlertEnabled,
} from "./lib/alerts";
import { checkServerAlerts } from "./lib/serverAlertsApi";
import {
  getAlertInbox,
  updateAlertInbox,
  type AlertInboxEvent,
} from "./lib/alertInboxApi";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushDeviceState,
  type PushDeviceState,
} from "./lib/pushApi";
import type { IndicatorId, IndicatorSelection } from "./lib/indicators";
import {
  indicatorCatalog,
  loadIndicatorSelection,
  saveIndicatorSelection,
} from "./lib/indicators";
import {
  loadPaneVisualState,
  savePaneVisualState,
  type PaneVisualState,
} from "./lib/paneVisualState";
import {
  loadPaneLinkSettings,
  savePaneLinkSettings,
  type PaneLinkSettings,
} from "./lib/paneLinks";
import type {
  LinkedCrosshairPoint,
} from "./lib/crosshairLink";
import {
  MAX_CHART_TABS,
  closeChartTab,
  createChartTab,
  loadActiveChartTabId,
  loadChartTabs,
  loadRecentSymbols,
  recordRecentSymbol,
  saveActiveChartTabId,
  saveChartTabs,
  saveRecentSymbols,
  updateChartTab,
  type ChartTab,
  type RecentSymbol,
} from "./lib/chartTabs";
import {
  createWorkspace,
  loadWorkspaces,
  saveWatchlist,
  saveWorkspaces,
  type SavedWorkspace,
} from "./lib/workspace";
import {
  createWatchlistCollection,
  loadActiveWatchlistId,
  loadWatchlistCollections,
  renameWatchlistCollection,
  saveActiveWatchlistId,
  saveWatchlistCollections,
  totalWatchlistItems,
  updateCollectionSymbols,
  type WatchlistCollection,
} from "./lib/watchlistCollections";
import {
  getMarketCandles,
  getMarketOverview,
  getMarketQuote,
  getMarketStatus,
  searchMarketSymbols,
} from "./lib/marketApi";

const initialSymbols: MarketSymbol[] = [
  { id: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "NASDAQ:TSLA", ticker: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", micCode: "XNAS", assetClass: "stock", currency: "USD" },
  { id: "XSAU:2222", ticker: "2222", name: "Saudi Aramco", exchange: "Saudi Exchange", micCode: "XSAU", country: "Saudi Arabia", assetClass: "stock", currency: "SAR" },
  { id: "XSAU:1120", ticker: "1120", name: "Al Rajhi Bank", exchange: "Saudi Exchange", micCode: "XSAU", country: "Saudi Arabia", assetClass: "stock", currency: "SAR" },
  { id: "FX:EURUSD", ticker: "EUR/USD", providerSymbol: "EUR/USD", name: "Euro / U.S. Dollar", exchange: "FX", assetClass: "forex", currency: "USD" },
  { id: "CRYPTO:BTCUSD", ticker: "BTC/USD", providerSymbol: "BTC/USD", name: "Bitcoin / U.S. Dollar", exchange: "Crypto", assetClass: "crypto", currency: "USD" },
  { id: "COMEX:GC", ticker: "GC", name: "Gold Futures", exchange: "COMEX", assetClass: "future", currency: "USD" },
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

type ChartLayoutMode = "single" | "split" | "quad";
type MaximizedChartPane = "primary" | "secondary" | "third" | "fourth" | null;
type AuxiliaryPane = "secondary" | "third" | "fourth";
type ChartPaneId = "primary" | AuxiliaryPane;
type ScreenerMode = "heatmap" | "table";
type ScreenerFilter = "all" | "equities" | "forex" | "crypto" | "futures";
type WatchlistFilter = "all" | "equities" | "forex" | "crypto" | "futures";
type WatchlistSort = "manual" | "change-desc" | "change-asc" | "symbol";

function readSaved<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return (window.localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function readSharedChartState() {
  if (typeof window === "undefined") return null;
  return parseMarketShareState(window.location.search);
}

function shouldAutoOpenHome() {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (
    params.get("marketos-share") === "1" ||
    params.get("inbox") === "alerts"
  ) {
    return false;
  }

  return readSaved<"on" | "off">(
    "marketos:home-auto",
    "on",
  ) === "on";
}

function initialPaneVisualFallback(): PaneVisualState {
  return {
    chartView:
      readSharedChartState()?.chartView ??
      readSaved<ChartView>(
        "marketos:chart-view",
        "candles",
      ),
    indicators:
      loadIndicatorSelection(),
    chartSettings:
      loadChartSettings(),
  };
}

function downloadBrowserBlob(
  blob: Blob,
  filename: string,
) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyTextToClipboard(
  value: string,
) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard is unavailable.");
  }
}

function readSavedSymbol(): MarketSymbol {
  if (typeof window === "undefined") return initialSymbols[0];

  const shared = readSharedChartState();
  if (shared) return shared.symbol;
  try {
    const saved = window.localStorage.getItem("marketos:symbol-object");
    if (!saved) return initialSymbols[0];
    const parsed = JSON.parse(saved) as MarketSymbol;
    if (!parsed?.ticker || !parsed?.id) return initialSymbols[0];
    return parsed;
  } catch {
    const legacyId = readSaved("marketos:symbol", initialSymbols[0].id);
    return initialSymbols.find((symbol) => symbol.id === legacyId) ?? initialSymbols[0];
  }
}

function saveSetting(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in restricted webviews or privacy modes.
  }
}

function readSavedPaneSymbol(key: string): MarketSymbol | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketSymbol;
    return parsed?.id && parsed?.ticker ? parsed : null;
  } catch {
    return null;
  }
}

function savePaneSymbol(key: string, symbol: MarketSymbol | null) {
  if (typeof window === "undefined") return;
  try {
    if (!symbol) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(symbol));
  } catch {
    // Ignore storage restrictions.
  }
}

function localSearch(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return initialSymbols;
  return initialSymbols.filter((symbol) =>
    [symbol.ticker, symbol.name, symbol.exchange, symbol.country ?? ""]
      .some((value) => value.toLowerCase().includes(needle)),
  );
}

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value < 10 ? 3 : 2,
    maximumFractionDigits: value < 10 ? 5 : 2,
  }).format(value);
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVolume(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function overviewMatchesFilter(item: MarketOverviewItem, filter: ScreenerFilter) {
  if (filter === "all") return true;
  if (filter === "equities") {
    return item.symbol.assetClass === "stock" ||
      item.symbol.assetClass === "index" ||
      item.symbol.assetClass === "etf";
  }
  if (filter === "forex") return item.symbol.assetClass === "forex";
  if (filter === "crypto") return item.symbol.assetClass === "crypto";
  return item.symbol.assetClass === "future" || item.symbol.assetClass === "commodity";
}

function watchlistMatchesFilter(
  symbol: MarketSymbol,
  filter: WatchlistFilter,
) {
  if (filter === "all") return true;
  if (filter === "equities") {
    return symbol.assetClass === "stock" ||
      symbol.assetClass === "index" ||
      symbol.assetClass === "etf";
  }
  if (filter === "forex") return symbol.assetClass === "forex";
  if (filter === "crypto") return symbol.assetClass === "crypto";
  return symbol.assetClass === "future" || symbol.assetClass === "commodity";
}

export default function App() {
  const [active, setActive] = useState<MarketSymbol>(() => readSavedSymbol());
  const [timeframe, setTimeframe] = useState<Timeframe>(
    () => readSharedChartState()?.timeframe ?? readSaved("marketos:timeframe", "1h"),
  );
  const [chartView, setChartView] = useState<ChartView>(
    () => readSharedChartState()?.chartView ?? readSaved("marketos:chart-view", "candles"),
  );

  const chartTabsBootstrapRef = useRef<{
    tabs: ChartTab[];
    activeId: string | null;
    recent: RecentSymbol[];
  } | null>(null);

  if (!chartTabsBootstrapRef.current) {
    let tabs = loadChartTabs({
      symbol: active,
      timeframe,
      chartView,
    });
    let activeId =
      loadActiveChartTabId(tabs);

    const shared =
      readSharedChartState();

    if (shared) {
      const matching =
        tabs.find(
          (tab) =>
            tab.symbol.id ===
              shared.symbol.id &&
            tab.timeframe ===
              shared.timeframe &&
            tab.chartView ===
              shared.chartView,
        );

      if (matching) {
        activeId = matching.id;
      } else {
        const sharedTab =
          createChartTab(
            shared.symbol,
            shared.timeframe,
            shared.chartView,
          );

        tabs = [
          sharedTab,
          ...tabs,
        ].slice(0, MAX_CHART_TABS);
        activeId = sharedTab.id;
      }
    } else if (activeId) {
      tabs = updateChartTab(
        tabs,
        activeId,
        {
          symbol: active,
          timeframe,
          chartView,
        },
      );
    }

    chartTabsBootstrapRef.current = {
      tabs,
      activeId,
      recent:
        loadRecentSymbols(),
    };
  }

  const [chartTabs, setChartTabs] =
    useState<ChartTab[]>(
      () =>
        chartTabsBootstrapRef
          .current!.tabs,
    );
  const [
    activeChartTabId,
    setActiveChartTabId,
  ] = useState<string | null>(
    () =>
      chartTabsBootstrapRef
        .current!.activeId,
  );
  const [
    recentSymbols,
    setRecentSymbols,
  ] = useState<RecentSymbol[]>(
    () =>
      chartTabsBootstrapRef
        .current!.recent,
  );

  const [chartSettings, setChartSettings] = useState<ChartSettings>(() => loadChartSettings());
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [chartTemplates, setChartTemplates] = useState<SavedChartTemplate[]>(() => loadChartTemplates());
  const [showChartTemplates, setShowChartTemplates] = useState(false);
  const [chartTemplateMessage, setChartTemplateMessage] = useState<string | null>(null);
  const [showObjectTree, setShowObjectTree] = useState(false);
  const [objectTreePane, setObjectTreePane] = useState<ObjectTreePaneId>("primary");
  const [chartResetKey, setChartResetKey] = useState(0);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [watchlistCollections, setWatchlistCollections] = useState<WatchlistCollection[]>(() =>
    loadWatchlistCollections(initialSymbols),
  );
  const [activeWatchlistId, setActiveWatchlistId] = useState(() => {
    const collections = loadWatchlistCollections(initialSymbols);
    return loadActiveWatchlistId(collections);
  });
  const [watchlist, setWatchlist] = useState<MarketSymbol[]>(() => {
    const collections = loadWatchlistCollections(initialSymbols);
    const activeId = loadActiveWatchlistId(collections);
    return (
      collections.find((collection) => collection.id === activeId)?.symbols ??
      collections[0]?.symbols ??
      initialSymbols
    );
  });
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [showHomeDashboard, setShowHomeDashboard] = useState(() => shouldAutoOpenHome());
  const [homeAutoOpen, setHomeAutoOpen] = useState(
    () => readSaved<"on" | "off">("marketos:home-auto", "on") === "on",
  );
  const homeInitialLoadRef = useRef(false);
  const [authUser, setAuthUser] = useState<AuthPrincipal | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [entitlement, setEntitlement] = useState<ResolvedEntitlement>(
    () => anonymousEntitlement(),
  );
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [showPlansPanel, setShowPlansPanel] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<CloudStateResponse | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushDeviceState>({
    supported: false,
    configured: false,
    permission: "unsupported",
    subscribed: false,
    subscriptionCount: 0,
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(
    () => readSaved<"on" | "off">("marketos:ui-watchlist", "on") === "on",
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(
    () => readSaved<"on" | "off">("marketos:ui-ai", "on") === "on",
  );
  const [watchlistOverview, setWatchlistOverview] = useState<MarketOverviewItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistProvider, setWatchlistProvider] = useState("demo");
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<number | null>(null);
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilter>(
    () => readSaved<WatchlistFilter>("marketos:watchlist-filter", "all"),
  );
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>(
    () => readSaved<WatchlistSort>("marketos:watchlist-sort", "manual"),
  );
  const watchlistInitialLoadRef = useRef(false);
  const [showScreener, setShowScreener] = useState(false);
  const [showInstrumentOverview, setShowInstrumentOverview] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showCompanyFeed, setShowCompanyFeed] = useState(false);
  const [companyReleases, setCompanyReleases] = useState<CompanyRelease[]>([]);
  const [companyFeedProvider, setCompanyFeedProvider] = useState("demo-company-feed");
  const [companyFeedLoading, setCompanyFeedLoading] = useState(false);
  const [companyFeedError, setCompanyFeedError] = useState<string | null>(null);
  const [showStrategyTester, setShowStrategyTester] = useState(false);
  const [showSystemPanel, setShowSystemPanel] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const snapshotCaptureRef = useRef<ChartSnapshotCapture | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const [eventsProvider, setEventsProvider] = useState("demo-events");
  const [eventsRangeDays, setEventsRangeDays] = useState(7);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [screenerMode, setScreenerMode] = useState<ScreenerMode>("heatmap");
  const [screenerFilter, setScreenerFilter] = useState<ScreenerFilter>("all");
  const [smartScreenerQuery, setSmartScreenerQuery] = useState("");
  const [appliedSmartScreenerQuery, setAppliedSmartScreenerQuery] = useState("");
  const [overview, setOverview] = useState<MarketOverviewItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewProvider, setOverviewProvider] = useState("demo");
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspace[]>(() => loadWorkspaces());
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showDrawingMenu, setShowDrawingMenu] = useState(false);
  const [showComparisonMenu, setShowComparisonMenu] = useState(false);
  const [comparisonSymbol, setComparisonSymbol] = useState<MarketSymbol | null>(
    () => readSavedPaneSymbol("marketos:pane-secondary"),
  );
  const [comparisonCandles, setComparisonCandles] = useState<Candle[]>([]);
  const [comparisonTimeframe, setComparisonTimeframe] = useState<Timeframe>(
    () => readSaved<Timeframe>("marketos:pane-secondary-timeframe", timeframe),
  );
  const [thirdChartSymbol, setThirdChartSymbol] = useState<MarketSymbol | null>(
    () => readSavedPaneSymbol("marketos:pane-third"),
  );
  const [thirdChartCandles, setThirdChartCandles] = useState<Candle[]>([]);
  const [thirdChartTimeframe, setThirdChartTimeframe] = useState<Timeframe>(
    () => readSaved<Timeframe>("marketos:pane-third-timeframe", timeframe),
  );
  const [fourthChartSymbol, setFourthChartSymbol] = useState<MarketSymbol | null>(
    () => readSavedPaneSymbol("marketos:pane-fourth"),
  );
  const [fourthChartCandles, setFourthChartCandles] = useState<Candle[]>([]);
  const [fourthChartTimeframe, setFourthChartTimeframe] = useState<Timeframe>(
    () => readSaved<Timeframe>("marketos:pane-fourth-timeframe", timeframe),
  );
  const [secondaryVisual, setSecondaryVisual] = useState<PaneVisualState>(
    () => loadPaneVisualState("secondary", initialPaneVisualFallback()),
  );
  const [thirdVisual, setThirdVisual] = useState<PaneVisualState>(
    () => loadPaneVisualState("third", initialPaneVisualFallback()),
  );
  const [fourthVisual, setFourthVisual] = useState<PaneVisualState>(
    () => loadPaneVisualState("fourth", initialPaneVisualFallback()),
  );
  const [layoutMode, setLayoutMode] = useState<ChartLayoutMode>(() =>
    readSaved("marketos:chart-layout", "single"),
  );
  const [chartSyncEnabled, setChartSyncEnabled] = useState(
    () => loadPaneLinkSettings().range,
  );
  const [paneSymbolLinkEnabled, setPaneSymbolLinkEnabled] = useState(
    () => loadPaneLinkSettings().symbol,
  );
  const [paneTimeframeLinkEnabled, setPaneTimeframeLinkEnabled] = useState(
    () => loadPaneLinkSettings().timeframe,
  );
  const [paneCrosshairLinkEnabled, setPaneCrosshairLinkEnabled] = useState(
    () => loadPaneLinkSettings().crosshair,
  );
  const [linkedCrosshair, setLinkedCrosshair] = useState<LinkedCrosshairPoint | null>(null);
  const [syncedLogicalRange, setSyncedLogicalRange] = useState<LogicalRange | null>(null);
  const [maximizedChartPane, setMaximizedChartPane] = useState<MaximizedChartPane>(null);
  const [replayActive, setReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayStartIndex, setReplayStartIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [showReplaySetup, setShowReplaySetup] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(() => {
    const saved = readSaved<string>("marketos:replay-speed", "1x");
    return isReplaySpeed(saved) ? saved : "1x";
  });
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  const [alerts, setAlerts] = useState<AdvancedAlert[]>(() => loadAlerts(timeframe));
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [showAlertInbox, setShowAlertInbox] = useState(false);
  const [alertInboxEvents, setAlertInboxEvents] = useState<AlertInboxEvent[]>([]);
  const [alertInboxLoading, setAlertInboxLoading] = useState(false);
  const [alertInboxError, setAlertInboxError] = useState<string | null>(null);
  const [alertsChecking, setAlertsChecking] = useState(false);
  const [serverAlertsChecking, setServerAlertsChecking] = useState(false);
  const [alertCheckMessage, setAlertCheckMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Pick<ChartAnalysisResponse, "summary" | "observations" | "engine"> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [multiTimeframeLoading, setMultiTimeframeLoading] = useState(false);
  const [multiTimeframeResult, setMultiTimeframeResult] = useState<MultiTimeframeAnalysisResponse | null>(null);
  const [multiTimeframeError, setMultiTimeframeError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("اقرأ الحركة الحالية ووضح أهم ما يظهر في الشارت");

  const [indicators, setIndicators] = useState<IndicatorSelection>(() => loadIndicatorSelection());
  const [customIndicators, setCustomIndicators] = useState<CustomIndicatorDefinition[]>(
    () => loadCustomIndicators(),
  );
  const [showIndicatorLab, setShowIndicatorLab] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [drawingHistory, setDrawingHistory] = useState(
    () => createDrawingHistory(loadDrawings(active.id)),
  );
  const drawings = drawingHistory.present;
  const [textAnchor, setTextAnchor] = useState<DrawingPoint | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>(() => createDemoCandles(initialSymbols[0].ticker, "1h"));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    () => readSaved<"on" | "off">("marketos:auto-refresh", "off") === "on",
  );
  const [providerStatus, setProviderStatus] = useState<MarketDataStatus | null>(null);
  const [dataState, setDataState] = useState<"loading" | "provider" | "fallback">("fallback");
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MarketSymbol[]>(initialSymbols);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandSymbolResults, setCommandSymbolResults] = useState<MarketSymbol[]>([]);
  const [commandSymbolLoading, setCommandSymbolLoading] = useState(false);

  useEffect(() => {
    saveChartTabs(chartTabs);
  }, [chartTabs]);

  useEffect(() => {
    saveActiveChartTabId(
      activeChartTabId,
    );
  }, [activeChartTabId]);

  useEffect(() => {
    saveRecentSymbols(
      recentSymbols,
    );
  }, [recentSymbols]);

  useEffect(() => {
    setRecentSymbols(
      (current) =>
        recordRecentSymbol(
          current,
          active,
        ),
    );
  }, [active.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setCommandQuery("");
      setCommandSymbolResults([]);
      setShowCommandPalette((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = commandQuery.trim();
    if (!showCommandPalette || trimmed.length < 2) {
      setCommandSymbolResults([]);
      setCommandSymbolLoading(false);
      return;
    }

    const controller = new AbortController();
    setCommandSymbolLoading(true);

    const timer = window.setTimeout(() => {
      searchMarketSymbols(trimmed, controller.signal)
        .then((response) => {
          setCommandSymbolResults(response.symbols.slice(0, 12));
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setCommandSymbolResults([]);
        })
        .finally(() => setCommandSymbolLoading(false));
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [commandQuery, showCommandPalette]);

  const refreshEntitlement = useCallback(async () => {
    if (!authUser) {
      setEntitlement(
        anonymousEntitlement(),
      );
      setEntitlementError(null);
      return;
    }

    setEntitlementLoading(true);
    setEntitlementError(null);

    try {
      const response =
        await getUserEntitlements();

      setEntitlement(
        response.entitlement,
      );
    } catch (error) {
      setEntitlement(
        anonymousEntitlement(),
      );
      setEntitlementError(
        error instanceof Error
          ? error.message
          : "تعذر قراءة خطة MarketOS.",
      );
    } finally {
      setEntitlementLoading(false);
    }
  }, [authUser]);

  const showPlanRequirement = useCallback(
    (message: string) => {
      setPlanMessage(message);
      setShowPlansPanel(true);
    },
    [],
  );

  const requireFeature = useCallback(
    (
      feature: FeatureId,
      label: string,
    ) => {
      if (
        canUseFeature(
          entitlement,
          feature,
        )
      ) {
        return true;
      }

      showPlanRequirement(
        `${label} تتطلب خطة أعلى من ${entitlement.definition.name}.`,
      );
      return false;
    },
    [
      entitlement,
      showPlanRequirement,
    ],
  );

  const planLimits =
    entitlement.definition.limits;

  const refreshCloudState = useCallback(async () => {
    if (!authUser) {
      setCloudState(null);
      return;
    }

    setCloudBusy(true);
    setCloudError(null);
    try {
      const response = await getCloudState();
      setCloudState(response);
    } catch (error) {
      setCloudError(
        error instanceof Error
          ? error.message
          : "تعذر قراءة النسخة السحابية.",
      );
    } finally {
      setCloudBusy(false);
    }
  }, [authUser]);

  const refreshAlertInbox = useCallback(async () => {
    if (!authUser) {
      setAlertInboxEvents([]);
      setAlertInboxError(null);
      return;
    }

    setAlertInboxLoading(true);
    setAlertInboxError(null);
    try {
      const response = await getAlertInbox();
      setAlertInboxEvents(response.events);
    } catch (error) {
      setAlertInboxError(
        error instanceof Error
          ? error.message
          : "تعذر تحميل سجل التنبيهات.",
      );
    } finally {
      setAlertInboxLoading(false);
    }
  }, [authUser]);

  const mutateAlertInbox = useCallback(async (
    action: "mark-read" | "mark-all-read" | "clear-read" | "clear-all",
    ids?: string[],
  ) => {
    if (!authUser) return;

    setAlertInboxLoading(true);
    setAlertInboxError(null);
    try {
      const response = await updateAlertInbox(action, ids);
      setAlertInboxEvents(response.events);
    } catch (error) {
      setAlertInboxError(
        error instanceof Error
          ? error.message
          : "تعذر تحديث سجل التنبيهات.",
      );
    } finally {
      setAlertInboxLoading(false);
    }
  }, [authUser]);

  const refreshPushState = useCallback(async () => {
    if (!authUser) {
      setPushState({
        supported: false,
        configured: false,
        permission: "unsupported",
        subscribed: false,
        subscriptionCount: 0,
      });
      setPushError(null);
      return;
    }

    setPushBusy(true);
    setPushError(null);
    try {
      setPushState(await getPushDeviceState());
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "تعذر قراءة حالة الإشعارات.",
      );
    } finally {
      setPushBusy(false);
    }
  }, [authUser]);

  const syncLocalStateToCloud = async () => {
    const localState = collectLocalCloudState();
    const latest = await getCloudState();

    if (latest.state) {
      if (
        !cloudState?.state ||
        cloudState.clientRevision !== latest.clientRevision
      ) {
        setCloudState(latest);
        throw new Error("CLOUD_CLIENT_CONFLICT");
      }

      if (
        cloudState.serverRevision !== latest.serverRevision
      ) {
        const baselineAlerts = JSON.stringify(
          cloudState.state.alerts ?? [],
        );
        const localAlerts = JSON.stringify(
          localState.alerts ?? [],
        );

        if (baselineAlerts !== localAlerts) {
          setCloudState(latest);
          throw new Error("CLOUD_ALERT_CONFLICT");
        }

        // Only the server-side alert state changed.
        // Preserve triggered/checked data before uploading local preferences.
        localState.alerts = latest.state.alerts;
      }
    } else if (cloudState?.state) {
      setCloudState(latest);
      throw new Error("CLOUD_DELETED_CONFLICT");
    }

    const response = await putCloudState(
      localState,
      latest.clientRevision,
      latest.serverRevision,
    );

    setCloudState(response);

    return {
      response,
      replacedExisting: Boolean(latest.state),
    };
  };

  const cloudConflictMessage = (
    error: unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "";

    if (message === "CLOUD_CLIENT_CONFLICT") {
      return "توجد نسخة سحابية أحدث من جهاز أو جلسة أخرى. تم تحديث الحالة؛ راجعها قبل الرفع من جديد.";
    }

    if (message === "CLOUD_ALERT_CONFLICT") {
      return "التنبيهات تغيرت محليًا وفي الخلفية في نفس الوقت. تم تحديث حالة السحابة؛ راجع التنبيهات قبل إعادة الرفع.";
    }

    if (message === "CLOUD_DELETED_CONFLICT") {
      return "النسخة السحابية حُذفت من جلسة أخرى. تم تحديث الحالة؛ راجعها قبل إنشاء نسخة جديدة.";
    }

    if (
      message.includes("Cloud state changed") ||
      message.includes("cloud copy already exists")
    ) {
      return "تغيرت النسخة السحابية أثناء العملية. اضغط «تحديث الحالة» ثم أعد المحاولة.";
    }

    return message || "تعذر مزامنة بيانات الجهاز.";
  };

  const enablePushOnThisDevice = async () => {
    if (!authUser || pushBusy) return;

    setPushBusy(true);
    setPushError(null);

    try {
      if (!cloudState?.state) {
        await syncLocalStateToCloud();
      }

      setPushState(await enablePushNotifications());

      // Device registration changes only serverRevision.
      // Refresh the cloud baseline so the next normal sync stays conflict-safe.
      setCloudState(await getCloudState());
    } catch (error) {
      setPushError(cloudConflictMessage(error));
    } finally {
      setPushBusy(false);
    }
  };

  const disablePushOnThisDevice = async () => {
    if (!authUser || pushBusy) return;

    setPushBusy(true);
    setPushError(null);

    try {
      setPushState(await disablePushNotifications());
      setCloudState(await getCloudState());
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "تعذر إيقاف الإشعارات.",
      );
    } finally {
      setPushBusy(false);
    }
  };

  const uploadCurrentDeviceToCloud = async () => {
    if (!authUser) return;

    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);

    try {
      const result = await syncLocalStateToCloud();

      setCloudMessage(
        result.replacedExisting
          ? "تم تحديث النسخة السحابية بأمان."
          : "تم إنشاء أول نسخة سحابية لهذا الجهاز.",
      );
    } catch (error) {
      setCloudError(cloudConflictMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const restoreCloudToThisDevice = async () => {
    if (!authUser) return;

    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);

    try {
      const response = cloudState ?? await getCloudState();
      setCloudState(response);

      if (!response.state) {
        setCloudError("لا توجد نسخة سحابية للاسترجاع.");
        return;
      }

      const confirmed = window.confirm(
        "سيتم استبدال بيانات MarketOS المحلية على هذا الجهاز بالنسخة السحابية ثم إعادة تحميل الصفحة. هل تريد المتابعة؟",
      );
      if (!confirmed) return;

      applyCloudStateToLocal(response.state);
      window.location.reload();
    } catch (error) {
      setCloudError(
        error instanceof Error
          ? error.message
          : "تعذر استرجاع النسخة السحابية.",
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const removeCloudCopy = async () => {
    if (!authUser) return;

    const confirmed = window.confirm(
      "سيتم حذف نسخة MarketOS السحابية فقط. بيانات هذا الجهاز لن تُحذف. هل تريد المتابعة؟",
    );
    if (!confirmed) return;

    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);

    try {
      if (pushState.subscribed) {
        try {
          setPushState(await disablePushNotifications());
        } catch {
          // Deleting the cloud state below still removes server registrations.
        }
      }

      await deleteCloudState();
      setCloudState((current) =>
        current
          ? {
              ...current,
              state: null,
              updatedAt: null,
              clientRevision: null,
              serverRevision: null,
            }
          : null,
      );
      setAlertInboxEvents([]);
      setShowAlertInbox(false);
      setCloudMessage("تم حذف النسخة السحابية.");
    } catch (error) {
      setCloudError(
        error instanceof Error
          ? error.message
          : "تعذر حذف النسخة السحابية.",
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const refreshQuote = useCallback(async (showLoading = false) => {
    if (replayActive) return;

    if (showLoading) setQuoteRefreshing(true);
    try {
      const response = await getMarketQuote(active);
      setQuote(response.quote);
      if (response.provider !== "demo") setDataState("provider");
    } catch {
      // Keep the last successful quote; market-data fallback is handled by the main load flow.
    } finally {
      if (showLoading) setQuoteRefreshing(false);
    }
  }, [active, replayActive]);

  useEffect(() => {
    let cancelled = false;

    getAuthPrincipal()
      .then(async (user) => {
        if (cancelled) return;

        setAuthUser(user);
        setAuthChecked(true);

        if (!user) {
          setCloudState(null);
          setEntitlement(
            anonymousEntitlement(),
          );
          setEntitlementLoading(false);
          setEntitlementError(null);
          return;
        }

        setEntitlementLoading(true);
        setEntitlementError(null);

        const [
          cloudResult,
          entitlementResult,
        ] = await Promise.allSettled([
          getCloudState(),
          getUserEntitlements(),
        ]);

        if (cancelled) return;

        if (
          cloudResult.status ===
          "fulfilled"
        ) {
          setCloudState(
            cloudResult.value,
          );
        }

        if (
          entitlementResult.status ===
          "fulfilled"
        ) {
          setEntitlement(
            entitlementResult.value
              .entitlement,
          );
        } else {
          setEntitlement(
            anonymousEntitlement(),
          );
          setEntitlementError(
            "تعذر قراءة الخطة من MarketOS API؛ تم تطبيق حدود Free مؤقتًا.",
          );
        }

        setEntitlementLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(null);
          setAuthChecked(true);
          setCloudState(null);
          setEntitlement(
            anonymousEntitlement(),
          );
          setEntitlementLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setAlertInboxEvents([]);
      setAlertInboxError(null);
      return;
    }

    void refreshAlertInbox();

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAlertInbox();
      }
    };
    const interval = window.setInterval(refreshIfVisible, 5 * 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [authUser, refreshAlertInbox]);

  useEffect(() => {
    if (!authUser) {
      setPushState({
        supported: false,
        configured: false,
        permission: "unsupported",
        subscribed: false,
        subscriptionCount: 0,
      });
      setPushError(null);
      return;
    }

    void refreshPushState();
  }, [authUser, refreshPushState]);

  useEffect(() => {
    if (!authUser) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("inbox") !== "alerts") return;

    setShowAlertInbox(true);
    void refreshAlertInbox();

    url.searchParams.delete("inbox");
    const search = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
    );
  }, [authUser, refreshAlertInbox]);

  useEffect(() => {
    const controller = new AbortController();

    getMarketStatus(controller.signal)
      .then((status) => {
        setProviderStatus(status);
        if (status.mode === "demo") setDataState((current) => current === "loading" ? "loading" : "fallback");
      })
      .catch(() => {
        setProviderStatus({
          provider: "web-demo",
          configured: true,
          mode: "demo",
          supportsSearch: true,
          supportsQuotes: true,
          supportsCandles: true,
          message: "API is unavailable; using browser demo fallback.",
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled || replayActive) return;

    const intervalMs =
      quote?.isMarketOpen === false && !quote?.isExtendedHours
        ? 60_000
        : 30_000;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshQuote(false);
      }
    };

    const interval = window.setInterval(refreshIfVisible, intervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    autoRefreshEnabled,
    replayActive,
    quote?.isMarketOpen,
    quote?.isExtendedHours,
    refreshQuote,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const fallbackCandles = createDemoCandles(active.id, timeframe);
    setDataState("loading");
    setDataError(null);

    Promise.all([
      getMarketCandles(active, timeframe, 300, controller.signal),
      getMarketQuote(active, controller.signal),
    ])
      .then(([candleResponse, quoteResponse]) => {
        if (candleResponse.candles.length === 0) {
          throw new Error("The market data provider returned no candles for this symbol.");
        }

        setCandles(candleResponse.candles);
        setQuote(quoteResponse.quote);
        setDataState(candleResponse.provider === "demo" ? "fallback" : "provider");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCandles(fallbackCandles);
        setQuote(createDemoQuote(active.ticker, active.currency, fallbackCandles));
        setDataState("fallback");
        setDataError(error instanceof Error ? error.message : "Market data request failed.");
      });

    return () => controller.abort();
  }, [active, timeframe]);

  useEffect(() => {
    if (
      !comparisonSymbol ||
      (
        layoutMode === "single" &&
        comparisonSymbol.id === active.id
      )
    ) {
      setComparisonCandles([]);
      return;
    }

    const controller = new AbortController();
    getMarketCandles(comparisonSymbol, comparisonTimeframe, 300, controller.signal)
      .then((response) => setComparisonCandles(response.candles))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setComparisonCandles(createDemoCandles(comparisonSymbol.id, comparisonTimeframe, 300));
      });

    return () => controller.abort();
  }, [
    comparisonSymbol,
    active.id,
    comparisonTimeframe,
    layoutMode,
  ]);

  useEffect(() => {
    if (layoutMode !== "quad" || !thirdChartSymbol) {
      setThirdChartCandles([]);
      return;
    }

    const controller = new AbortController();
    getMarketCandles(thirdChartSymbol, thirdChartTimeframe, 300, controller.signal)
      .then((response) => setThirdChartCandles(response.candles))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setThirdChartCandles(createDemoCandles(thirdChartSymbol.id, thirdChartTimeframe, 300));
      });

    return () => controller.abort();
  }, [layoutMode, thirdChartSymbol, thirdChartTimeframe]);

  useEffect(() => {
    if (layoutMode !== "quad" || !fourthChartSymbol) {
      setFourthChartCandles([]);
      return;
    }

    const controller = new AbortController();
    getMarketCandles(fourthChartSymbol, fourthChartTimeframe, 300, controller.signal)
      .then((response) => setFourthChartCandles(response.candles))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setFourthChartCandles(createDemoCandles(fourthChartSymbol.id, fourthChartTimeframe, 300));
      });

    return () => controller.abort();
  }, [layoutMode, fourthChartSymbol, fourthChartTimeframe]);

  useEffect(() => {
    if (replayActive) return;

    const hasRelevantAlert = alerts.some(
      (alert) =>
        alert.enabled &&
        !alert.triggeredAt &&
        alert.symbol.id === active.id &&
        alert.timeframe === timeframe,
    );
    if (!hasRelevantAlert) return;

    const result = evaluateAdvancedAlerts(alerts, {
      symbol: active,
      timeframe,
      candles,
      quote,
    });

    setAlerts(result.alerts);
    saveAlerts(result.alerts);

    if (result.triggered.length === 0) return;

    const latest = result.triggered[result.triggered.length - 1].alert;
    setAlertMessage(
      `تنبيه ${latest.symbol.ticker} · ${latest.timeframe.toUpperCase()}: ${describeAdvancedAlert(latest)}`,
    );

    const timer = window.setTimeout(() => setAlertMessage(null), 7000);
    return () => window.clearTimeout(timer);
  }, [
    quote?.price,
    quote?.percentChange,
    quote?.volume,
    candles,
    active,
    timeframe,
    replayActive,
  ]);

  useEffect(() => {
    if (!replayActive || !replayPlaying || candles.length === 0) return;

    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const index =
          current ??
          replayStartIndex ??
          defaultReplayStartIndex(candles.length);

        if (index >= candles.length - 1) {
          setReplayPlaying(false);
          return candles.length - 1;
        }

        return index + 1;
      });
    }, replayIntervalMs(replaySpeed));

    return () => window.clearInterval(timer);
  }, [
    replayActive,
    replayPlaying,
    replayStartIndex,
    replaySpeed,
    candles.length,
  ]);

  useEffect(() => {
    if (!replayActive || candles.length === 0) return;

    const fallback =
      defaultReplayStartIndex(candles.length);

    setReplayStartIndex((current) =>
      current === null
        ? fallback
        : Math.min(
            Math.max(20, current),
            candles.length - 1,
          ),
    );

    setReplayIndex((current) =>
      current === null
        ? replayStartIndex ?? fallback
        : Math.min(
            Math.max(20, current),
            candles.length - 1,
          ),
    );
  }, [
    replayActive,
    candles.length,
    replayStartIndex,
  ]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearchResults(initialSymbols);
      setSearchLoading(false);
      return;
    }

    if (trimmed.length < 2) {
      setSearchResults(localSearch(trimmed));
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    const timer = window.setTimeout(() => {
      searchMarketSymbols(trimmed, controller.signal)
        .then((response) => {
          setSearchResults(response.symbols.length > 0 ? response.symbols : localSearch(trimmed));
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setSearchResults(localSearch(trimmed));
        })
        .finally(() => setSearchLoading(false));
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const watchlistQuoteMap = useMemo(
    () => new Map(watchlistOverview.map((item) => [item.symbol.id, item.quote])),
    [watchlistOverview],
  );

  const filteredWatchlist = useMemo(
    () => watchlist.filter((symbol) => watchlistMatchesFilter(symbol, watchlistFilter)),
    [watchlist, watchlistFilter],
  );

  const sortedWatchlist = useMemo(() => {
    if (watchlistSort === "manual") return filteredWatchlist;

    const nextSymbols = [...filteredWatchlist];
    if (watchlistSort === "symbol") {
      return nextSymbols.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return nextSymbols.sort((a, b) => {
      const aChange = watchlistQuoteMap.get(a.id)?.percentChange;
      const bChange = watchlistQuoteMap.get(b.id)?.percentChange;

      if (typeof aChange !== "number" && typeof bChange !== "number") return 0;
      if (typeof aChange !== "number") return 1;
      if (typeof bChange !== "number") return -1;

      return watchlistSort === "change-desc"
        ? bChange - aChange
        : aChange - bChange;
    });
  }, [filteredWatchlist, watchlistSort, watchlistQuoteMap]);

  const visibleSymbols = useMemo(
    () => query.trim() ? searchResults : sortedWatchlist,
    [query, searchResults, sortedWatchlist],
  );

  const safeReplayIndex = replayActive
    ? Math.min(replayIndex ?? candles.length - 1, Math.max(0, candles.length - 1))
    : candles.length - 1;

  const displayCandles = useMemo(
    () => replayActive ? candles.slice(0, safeReplayIndex + 1) : candles,
    [candles, replayActive, safeReplayIndex],
  );

  const replayCutoff = displayCandles[displayCandles.length - 1]?.time;
  const displayComparisonCandles = useMemo(
    () =>
      replayActive && replayCutoff !== undefined
        ? comparisonCandles.filter((candle) => candle.time <= replayCutoff)
        : comparisonCandles,
    [comparisonCandles, replayActive, replayCutoff],
  );

  const displayThirdChartCandles = useMemo(
    () =>
      replayActive && replayCutoff !== undefined
        ? thirdChartCandles.filter((candle) => candle.time <= replayCutoff)
        : thirdChartCandles,
    [thirdChartCandles, replayActive, replayCutoff],
  );

  const displayFourthChartCandles = useMemo(
    () =>
      replayActive && replayCutoff !== undefined
        ? fourthChartCandles.filter((candle) => candle.time <= replayCutoff)
        : fourthChartCandles,
    [fourthChartCandles, replayActive, replayCutoff],
  );

  const activeIndicatorItems = useMemo(
    () => indicatorCatalog.filter((item) => indicators[item.id]),
    [indicators],
  );

  const activeCustomIndicators = useMemo(
    () => customIndicators.filter((indicator) => indicator.enabled),
    [customIndicators],
  );

  const updateCustomIndicators = useCallback(
    (
      next: CustomIndicatorDefinition[],
    ) => {
      if (
        next.length >
          customIndicators.length &&
        next.length >
          planLimits.customIndicators
      ) {
        showPlanRequirement(
          `خطة ${entitlement.definition.name} تسمح بـ ${planLimits.customIndicators} مؤشر مخصص.`,
        );
        return;
      }

      setCustomIndicators(next);
      saveCustomIndicators(next);
    },
    [
      customIndicators.length,
      planLimits.customIndicators,
      entitlement.definition.name,
      showPlanRequirement,
    ],
  );

  const toggleCustomIndicator = (id: string) => {
    updateCustomIndicators(
      customIndicators.map((indicator) =>
        indicator.id === id
          ? { ...indicator, enabled: !indicator.enabled }
          : indicator,
      ),
    );
  };

  const lastCandle = displayCandles[displayCandles.length - 1];
  const previousDisplayedCandle = displayCandles[displayCandles.length - 2];
  const inspectedCandle = hoverCandle ?? lastCandle;
  const dataWindowSnapshot = useMemo(
    () =>
      inspectedCandle
        ? buildDataWindowSnapshot(
            displayCandles,
            inspectedCandle.time,
            indicators,
            customIndicators,
          )
        : null,
    [displayCandles, inspectedCandle, indicators, customIndicators],
  );
  const isActiveWatchlisted = watchlist.some((symbol) => symbol.id === active.id);
  const displayedPrice = replayActive ? lastCandle?.close : quote?.price ?? lastCandle?.close;
  const displayedPercent = replayActive && lastCandle && previousDisplayedCandle
    ? ((lastCandle.close - previousDisplayedCandle.close) / previousDisplayedCandle.close) * 100
    : quote?.percentChange;
  const providerLabel =
    dataState === "loading"
      ? "Loading data"
      : dataState === "provider"
        ? providerStatus?.provider ?? quote?.source ?? "Provider"
        : "Demo fallback";

  const sessionLabel = replayActive
    ? "Replay"
    : quote?.isExtendedHours
      ? "جلسة ممتدة"
      : quote?.isMarketOpen === true
        ? "السوق مفتوح"
        : quote?.isMarketOpen === false
          ? "السوق مغلق"
          : providerStatus?.mode === "demo"
            ? "جلسة تجريبية"
            : "حالة الجلسة غير متاحة";

  const sessionState = replayActive
    ? "replay"
    : quote?.isMarketOpen === true || quote?.isExtendedHours
      ? "open"
      : quote?.isMarketOpen === false
        ? "closed"
        : "unknown";

  const quoteTimeLabel = quote
    ? new Date(quote.timestamp * 1000).toLocaleTimeString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((current) => {
      const next = !current;
      saveSetting("marketos:auto-refresh", next ? "on" : "off");
      return next;
    });
  };

  const toggleWatchlistPanel = () => {
    setWatchlistOpen((current) => {
      const next = !current;
      saveSetting("marketos:ui-watchlist", next ? "on" : "off");
      return next;
    });
  };

  const toggleAiPanel = () => {
    setAiPanelOpen((current) => {
      const next = !current;
      saveSetting("marketos:ui-ai", next ? "on" : "off");
      return next;
    });
  };

  const activeWatchlist =
    watchlistCollections.find(
      (collection) =>
        collection.id === activeWatchlistId,
    ) ??
    watchlistCollections[0] ??
    null;

  const totalWatchlistItemCount =
    totalWatchlistItems(
      watchlistCollections,
    );

  const persistActiveWatchlist = useCallback(
    (symbols: MarketSymbol[]) => {
      const next = [
        ...new Map(
          symbols.map((symbol) => [
            symbol.id,
            symbol,
          ]),
        ).values(),
      ];

      setWatchlist(next);

      // Keep the legacy active-list key for backward compatibility.
      saveWatchlist(next);

      setWatchlistCollections(
        (current) => {
          const updated =
            updateCollectionSymbols(
              current,
              activeWatchlistId,
              next,
            );

          saveWatchlistCollections(
            updated,
          );

          return updated;
        },
      );
    },
    [activeWatchlistId],
  );

  const selectWatchlistCollection = useCallback(
    (collectionId: string) => {
      const collection =
        watchlistCollections.find(
          (item) =>
            item.id === collectionId,
        );

      if (!collection) return;

      setActiveWatchlistId(
        collection.id,
      );
      saveActiveWatchlistId(
        collection.id,
      );

      setWatchlist(
        collection.symbols,
      );
      saveWatchlist(
        collection.symbols,
      );

      setQuery("");
      setWatchlistOverview([]);
      setOverview([]);
      watchlistInitialLoadRef.current =
        false;
    },
    [watchlistCollections],
  );

  const createWatchlist = useCallback(
    (name: string) => {
      if (
        watchlistCollections.length >=
        planLimits.watchlists
      ) {
        showPlanRequirement(
          `خطة ${entitlement.definition.name} تسمح بـ ${planLimits.watchlists} قوائم متابعة.`,
        );
        return;
      }

      try {
        const collection =
          createWatchlistCollection(
            name,
          );

        const next = [
          ...watchlistCollections,
          collection,
        ];

        setWatchlistCollections(next);
        saveWatchlistCollections(next);

        setActiveWatchlistId(
          collection.id,
        );
        saveActiveWatchlistId(
          collection.id,
        );

        setWatchlist([]);
        saveWatchlist([]);

        setQuery("");
        setWatchlistOverview([]);
        setOverview([]);
        watchlistInitialLoadRef.current =
          false;
      } catch {
        // The manager keeps invalid names disabled; no extra UI error is needed here.
      }
    },
    [
      watchlistCollections,
      planLimits.watchlists,
      entitlement.definition.name,
      showPlanRequirement,
    ],
  );

  const renameWatchlist = useCallback(
    (
      collectionId: string,
      name: string,
    ) => {
      const next =
        renameWatchlistCollection(
          watchlistCollections,
          collectionId,
          name,
        );

      setWatchlistCollections(next);
      saveWatchlistCollections(next);
    },
    [watchlistCollections],
  );

  const deleteWatchlist = useCallback(
    (collectionId: string) => {
      if (
        watchlistCollections.length <= 1
      ) {
        return;
      }

      const next =
        watchlistCollections.filter(
          (collection) =>
            collection.id !==
            collectionId,
        );

      if (
        next.length ===
        watchlistCollections.length
      ) {
        return;
      }

      setWatchlistCollections(next);
      saveWatchlistCollections(next);

      if (
        activeWatchlistId !==
        collectionId
      ) {
        return;
      }

      const fallback =
        next[0];

      setActiveWatchlistId(
        fallback.id,
      );
      saveActiveWatchlistId(
        fallback.id,
      );

      setWatchlist(
        fallback.symbols,
      );
      saveWatchlist(
        fallback.symbols,
      );

      setQuery("");
      setWatchlistOverview([]);
      setOverview([]);
      watchlistInitialLoadRef.current =
        false;
    },
    [
      watchlistCollections,
      activeWatchlistId,
    ],
  );

  const addToWatchlist = useCallback(
    (symbol: MarketSymbol) => {
      if (
        watchlist.some(
          (item) =>
            item.id === symbol.id,
        )
      ) {
        return;
      }

      if (
        totalWatchlistItemCount >=
        planLimits.watchlistItems
      ) {
        showPlanRequirement(
          `وصلت حد الرموز الإجمالي في خطة ${entitlement.definition.name}: ${planLimits.watchlistItems} رمز عبر كل القوائم.`,
        );
        return;
      }

      persistActiveWatchlist([
        symbol,
        ...watchlist,
      ]);
    },
    [
      watchlist,
      totalWatchlistItemCount,
      planLimits.watchlistItems,
      entitlement.definition.name,
      showPlanRequirement,
      persistActiveWatchlist,
    ],
  );

  const fallbackOverview = useCallback((symbols: MarketSymbol[]) => {
    return symbols.slice(0, 25).map((symbol) => {
      const demoCandles = createDemoCandles(symbol.id, "1m", 2);
      return {
        symbol,
        quote: createDemoQuote(symbol.ticker, symbol.currency, demoCandles),
      };
    });
  }, []);

  const refreshWatchlistOverview = useCallback(async (showLoading = true) => {
    const symbols = watchlist.slice(0, 25);
    if (symbols.length === 0) {
      setWatchlistOverview([]);
      setWatchlistError(null);
      setWatchlistUpdatedAt(Date.now());
      return;
    }

    if (showLoading) setWatchlistLoading(true);
    setWatchlistError(null);

    try {
      const response = await getMarketOverview(symbols);
      const returnedIds = new Set(response.items.map((item) => item.symbol.id));
      const missing = symbols.filter((symbol) => !returnedIds.has(symbol.id));
      const items = missing.length > 0
        ? [...response.items, ...fallbackOverview(missing)]
        : response.items;

      setWatchlistOverview(items);
      setWatchlistProvider(response.provider);
      setWatchlistUpdatedAt(Date.now());
    } catch {
      setWatchlistOverview(fallbackOverview(symbols));
      setWatchlistProvider("browser-demo");
      setWatchlistUpdatedAt(Date.now());
      setWatchlistError("تعذر تحديث الأسعار المباشرة، تظهر لقطة Demo مؤقتًا.");
    } finally {
      if (showLoading) setWatchlistLoading(false);
    }
  }, [watchlist, fallbackOverview]);

  useEffect(() => {
    if (watchlistInitialLoadRef.current) return;
    watchlistInitialLoadRef.current = true;
    void refreshWatchlistOverview(false);
  }, [refreshWatchlistOverview]);

  useEffect(() => {
    if (!autoRefreshEnabled || replayActive) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshWatchlistOverview(false);
      }
    };

    refreshIfVisible();
    const interval = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [autoRefreshEnabled, replayActive, refreshWatchlistOverview]);

  const refreshScreener = useCallback(async () => {
    const symbols = watchlist.slice(0, 25);
    if (symbols.length === 0) {
      setOverview([]);
      setOverviewError(null);
      return;
    }

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const response = await getMarketOverview(symbols);
      const returnedIds = new Set(response.items.map((item) => item.symbol.id));
      const missing = symbols.filter((symbol) => !returnedIds.has(symbol.id));
      const items = missing.length > 0
        ? [...response.items, ...fallbackOverview(missing)]
        : response.items;

      setOverview(items);
      setOverviewProvider(response.provider);
    } catch {
      setOverview(fallbackOverview(symbols));
      setOverviewProvider("browser-demo");
      setOverviewError("تعذر جلب لقطة السوق المباشرة، لذلك تم تشغيل بيانات العرض التجريبية.");
    } finally {
      setOverviewLoading(false);
    }
  }, [watchlist, fallbackOverview]);

  const openScreener = () => {
    setShowScreener(true);
    void refreshScreener();
  };

  const refreshEvents = useCallback(async (rangeDays = eventsRangeDays) => {
    const { startDate, endDate } = localDateRange(rangeDays);
    const symbols = watchlist.map((symbol) => symbol.ticker).slice(0, 50);
    setEventsLoading(true);
    setEventsError(null);

    try {
      const result = await getMarketEvents(startDate, endDate, symbols);
      setMarketEvents(result.events);
      setEventsProvider(result.provider);
    } catch {
      setMarketEvents(createBrowserDemoEvents(watchlist, rangeDays));
      setEventsProvider("browser-demo-events");
      setEventsError("تعذر الوصول لمصدر الأحداث، لذلك تظهر بيانات Sample للتجربة فقط.");
    } finally {
      setEventsLoading(false);
    }
  }, [eventsRangeDays, watchlist]);

  const openEvents = () => {
    setShowEvents(true);
    void refreshEvents(eventsRangeDays);
  };

  const openHomeDashboard = () => {
    setShowHomeDashboard(true);
    void refreshWatchlistOverview(false);
    if (!eventsLoading) {
      void refreshEvents(7);
    }
  };

  useEffect(() => {
    if (
      !showHomeDashboard ||
      homeInitialLoadRef.current
    ) {
      return;
    }

    homeInitialLoadRef.current = true;
    void refreshWatchlistOverview(false);
    void refreshEvents(7);
  }, [
    showHomeDashboard,
    refreshWatchlistOverview,
    refreshEvents,
  ]);

  const refreshCompanyFeed = useCallback(async () => {
    const symbols = watchlist.slice(0, 8);
    if (symbols.length === 0) {
      setCompanyReleases([]);
      setCompanyFeedError("أضف رموزًا إلى قائمة المتابعة لعرض إعلانات الشركات.");
      return;
    }

    setCompanyFeedLoading(true);
    setCompanyFeedError(null);

    try {
      const result = await getCompanyFeed(symbols, 3);
      setCompanyReleases(result.releases);
      setCompanyFeedProvider(result.provider);
    } catch {
      setCompanyReleases(createBrowserDemoFeed(symbols, 2));
      setCompanyFeedProvider("browser-demo-company-feed");
      setCompanyFeedError(
        "تعذر الوصول لمصدر إعلانات الشركات، لذلك تظهر بيانات Sample للتجربة فقط.",
      );
    } finally {
      setCompanyFeedLoading(false);
    }
  }, [watchlist]);

  const openCompanyFeed = () => {
    setShowCompanyFeed(true);
    void refreshCompanyFeed();
  };

  const openCompanyFeedSymbol = (ticker: string) => {
    const normalized = ticker.replace(/\s+/g, "").toUpperCase();
    const symbol = watchlist.find(
      (item) =>
        item.ticker.replace(/\s+/g, "").toUpperCase() === normalized ||
        (item.providerSymbol ?? "").replace(/\s+/g, "").toUpperCase() === normalized,
    );

    setShowCompanyFeed(false);

    if (symbol) {
      chooseSymbol(symbol);
      return;
    }

    setQuery(ticker);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const refreshSystemHealth = useCallback(async () => {
    setSystemHealthLoading(true);
    setSystemHealthError(null);

    try {
      const health = await getSystemHealth();
      setSystemHealth(health);
    } catch {
      setSystemHealth(null);
      setSystemHealthError(
        "تعذر الوصول إلى MarketOS API. في النسخة المحلية أو قبل نشر Azure قد يكون الـBackend غير متصل.",
      );
    } finally {
      setSystemHealthLoading(false);
    }
  }, []);

  const openSystemPanel = () => {
    setShowSystemPanel(true);
    void refreshSystemHealth();
  };

  const changeEventsRange = (days: number) => {
    setEventsRangeDays(days);
    void refreshEvents(days);
  };

  const openEventSymbol = (ticker: string) => {
    const normalized = ticker.replace(/\s+/g, "").toUpperCase();
    const symbol = watchlist.find(
      (item) =>
        item.ticker.replace(/\s+/g, "").toUpperCase() === normalized ||
        (item.providerSymbol ?? "").replace(/\s+/g, "").toUpperCase() === normalized,
    );

    setShowEvents(false);
    if (symbol) {
      chooseSymbol(symbol);
      return;
    }

    setQuery(ticker);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const toggleActiveWatchlist = () => {
    const exists =
      watchlist.some(
        (item) => item.id === active.id,
      );

    if (exists) {
      persistActiveWatchlist(
        watchlist.filter(
          (item) =>
            item.id !== active.id,
        ),
      );
      return;
    }

    if (
      totalWatchlistItemCount >=
      planLimits.watchlistItems
    ) {
      showPlanRequirement(
        `وصلت حد الرموز الإجمالي في خطة ${entitlement.definition.name}: ${planLimits.watchlistItems} رمز عبر كل القوائم.`,
      );
      return;
    }

    persistActiveWatchlist([
      active,
      ...watchlist,
    ]);
  };

  const updateActiveChartTabSession = (
    patch: Partial<
      Pick<
        ChartTab,
        "symbol" | "timeframe" | "chartView"
      >
    >,
  ) => {
    if (!activeChartTabId) return;

    setChartTabs(
      (current) =>
        updateChartTab(
          current,
          activeChartTabId,
          patch,
        ),
    );
  };

  const applyChartTabSession = (
    tab: ChartTab,
  ) => {
    const previousActive = active;

    setActiveChartTabId(tab.id);
    setActive(tab.symbol);
    setTimeframe(tab.timeframe);
    setChartView(
      tab.chartView as ChartView,
    );

    saveSetting(
      "marketos:symbol",
      tab.symbol.id,
    );
    saveSetting(
      "marketos:symbol-object",
      JSON.stringify(tab.symbol),
    );
    saveSetting(
      "marketos:timeframe",
      tab.timeframe,
    );
    saveSetting(
      "marketos:chart-view",
      tab.chartView,
    );

    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    setReplayStartIndex(null);
    setShowReplaySetup(false);
    setLinkedCrosshair(null);
    setSyncedLogicalRange(null);

    if (
      paneSymbolLinkEnabled &&
      layoutMode !== "single"
    ) {
      setComparisonSymbol(tab.symbol);
      savePaneSymbol(
        "marketos:pane-secondary",
        tab.symbol,
      );

      if (layoutMode === "quad") {
        setThirdChartSymbol(
          tab.symbol,
        );
        savePaneSymbol(
          "marketos:pane-third",
          tab.symbol,
        );
        setFourthChartSymbol(
          tab.symbol,
        );
        savePaneSymbol(
          "marketos:pane-fourth",
          tab.symbol,
        );
      }
    } else {
      if (
        comparisonSymbol?.id ===
        tab.symbol.id
      ) {
        setComparisonSymbol(
          previousActive,
        );
        savePaneSymbol(
          "marketos:pane-secondary",
          previousActive,
        );
      }

      if (
        thirdChartSymbol?.id ===
        tab.symbol.id
      ) {
        setThirdChartSymbol(
          previousActive,
        );
        savePaneSymbol(
          "marketos:pane-third",
          previousActive,
        );
      }

      if (
        fourthChartSymbol?.id ===
        tab.symbol.id
      ) {
        setFourthChartSymbol(
          previousActive,
        );
        savePaneSymbol(
          "marketos:pane-fourth",
          previousActive,
        );
      }
    }

    if (
      paneTimeframeLinkEnabled &&
      layoutMode !== "single"
    ) {
      setComparisonTimeframe(
        tab.timeframe,
      );
      saveSetting(
        "marketos:pane-secondary-timeframe",
        tab.timeframe,
      );

      if (layoutMode === "quad") {
        setThirdChartTimeframe(
          tab.timeframe,
        );
        saveSetting(
          "marketos:pane-third-timeframe",
          tab.timeframe,
        );
        setFourthChartTimeframe(
          tab.timeframe,
        );
        saveSetting(
          "marketos:pane-fourth-timeframe",
          tab.timeframe,
        );
      }
    }

    setDrawingHistory(
      createDrawingHistory(
        loadDrawings(
          tab.symbol.id,
        ),
      ),
    );
    setDrawingTool("cursor");
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setHoverCandle(null);
    setQuery("");
    setAiResult(null);
    setMultiTimeframeResult(null);
    setMultiTimeframeError(null);
  };

  const switchChartTab = (
    id: string,
  ) => {
    const tab =
      chartTabs.find(
        (item) => item.id === id,
      );

    if (!tab) return;

    applyChartTabSession(tab);
  };

  const openChartTabForSymbol = (
    symbol: MarketSymbol,
  ) => {
    if (
      chartTabs.length >=
      MAX_CHART_TABS
    ) {
      return;
    }

    const tab =
      createChartTab(
        symbol,
        timeframe,
        chartView,
      );

    setChartTabs(
      (current) => [
        ...current,
        tab,
      ].slice(
        0,
        MAX_CHART_TABS,
      ),
    );

    applyChartTabSession(tab);
  };

  const closeChartTabSession = (
    id: string,
  ) => {
    if (chartTabs.length <= 1) {
      return;
    }

    const result =
      closeChartTab(
        chartTabs,
        id,
      );

    setChartTabs(result.tabs);

    if (
      id !== activeChartTabId
    ) {
      return;
    }

    const nextTab =
      result.tabs.find(
        (tab) =>
          tab.id ===
          result.nextActiveId,
      ) ??
      result.tabs[0];

    if (nextTab) {
      applyChartTabSession(
        nextTab,
      );
    }
  };

  const chooseSymbol = (symbol: MarketSymbol) => {
    const previousActive = active;
    setActive(symbol);
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    setLinkedCrosshair(null);

    if (
      paneSymbolLinkEnabled &&
      layoutMode !== "single"
    ) {
      setComparisonSymbol(symbol);
      savePaneSymbol(
        "marketos:pane-secondary",
        symbol,
      );

      if (layoutMode === "quad") {
        setThirdChartSymbol(symbol);
        savePaneSymbol(
          "marketos:pane-third",
          symbol,
        );
        setFourthChartSymbol(symbol);
        savePaneSymbol(
          "marketos:pane-fourth",
          symbol,
        );
      }
    } else {
      if (comparisonSymbol?.id === symbol.id) {
        setComparisonSymbol(previousActive);
        savePaneSymbol("marketos:pane-secondary", previousActive);
      }
      if (thirdChartSymbol?.id === symbol.id) {
        setThirdChartSymbol(previousActive);
        savePaneSymbol("marketos:pane-third", previousActive);
      }
      if (fourthChartSymbol?.id === symbol.id) {
        setFourthChartSymbol(previousActive);
        savePaneSymbol("marketos:pane-fourth", previousActive);
      }
    }

    updateActiveChartTabSession({
      symbol,
    });

    addToWatchlist(symbol);
    saveSetting("marketos:symbol", symbol.id);
    saveSetting("marketos:symbol-object", JSON.stringify(symbol));
    setDrawingHistory(createDrawingHistory(loadDrawings(symbol.id)));
    setDrawingTool("cursor");
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setHoverCandle(null);
    setQuery("");
    setAiResult(null);
  };

  const chooseTimeframe = (value: Timeframe) => {
    setTimeframe(value);
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    saveSetting("marketos:timeframe", value);
    updateActiveChartTabSession({
      timeframe: value,
    });
    setLinkedCrosshair(null);

    if (
      paneTimeframeLinkEnabled &&
      layoutMode !== "single"
    ) {
      setComparisonTimeframe(value);
      saveSetting(
        "marketos:pane-secondary-timeframe",
        value,
      );

      if (layoutMode === "quad") {
        setThirdChartTimeframe(value);
        saveSetting(
          "marketos:pane-third-timeframe",
          value,
        );
        setFourthChartTimeframe(value);
        saveSetting(
          "marketos:pane-fourth-timeframe",
          value,
        );
      }
    }

    setSyncedLogicalRange(null);
    setDrawingTool("cursor");
    setHoverCandle(null);
    setAiResult(null);
  };

  const chooseChartView = (value: ChartView) => {
    setChartView(value);
    saveSetting("marketos:chart-view", value);
    updateActiveChartTabSession({
      chartView: value,
    });
  };

  const updateChartSettings = useCallback((next: ChartSettings) => {
    setChartSettings(next);
    saveChartSettings(next);
  }, []);

  const restoreChartSettings = () => {
    const next = resetChartSettings();
    setChartSettings(next);
    setChartResetKey((current) => current + 1);
  };

  const saveCurrentChartTemplate = (name: string) => {
    if (
      chartTemplates.length >=
      planLimits.chartTemplates
    ) {
      showPlanRequirement(
        `وصلت حد قوالب الشارت في خطة ${entitlement.definition.name}: ${planLimits.chartTemplates} قالب.`,
      );
      return;
    }

    try {
      const template = createChartTemplate(
        name,
        {
          chartView,
          chartSettings,
          indicators,
          customIndicators,
        },
      );

      const next = [
        template,
        ...chartTemplates,
      ].slice(
        0,
        planLimits.chartTemplates,
      );

      setChartTemplates(next);
      saveChartTemplates(next);
      setChartTemplateMessage(
        `تم حفظ قالب "${template.name}".`,
      );
    } catch (error) {
      setChartTemplateMessage(
        error instanceof Error
          ? error.message
          : "تعذر حفظ القالب.",
      );
    }
  };

  const deleteChartTemplate = (id: string) => {
    const next =
      chartTemplates.filter(
        (template) =>
          template.id !== id,
      );

    setChartTemplates(next);
    saveChartTemplates(next);
    setChartTemplateMessage(
      "تم حذف القالب.",
    );
  };

  const applyChartTemplate = (
    template: ChartTemplateDefinition,
  ) => {
    setChartView(
      template.chartView,
    );
    saveSetting(
      "marketos:chart-view",
      template.chartView,
    );

    setChartSettings(
      template.chartSettings,
    );
    saveChartSettings(
      template.chartSettings,
    );

    setIndicators(
      template.indicators,
    );
    saveIndicatorSelection(
      template.indicators,
    );

    const merged =
      mergeTemplateCustomIndicators(
        customIndicators,
        template.customIndicators,
        planLimits.customIndicators,
      );

    setCustomIndicators(
      merged.indicators,
    );
    saveCustomIndicators(
      merged.indicators,
    );

    setChartResetKey(
      (current) => current + 1,
    );

    setChartTemplateMessage(
      merged.skipped > 0
        ? `تم تطبيق القالب، وتعذر إضافة ${merged.skipped} مؤشر مخصص بسبب حد الخطة.`
        : `تم تطبيق قالب "${template.name}".`,
    );
  };

  const resetChartView = () => {
    setChartResetKey((current) => current + 1);
  };

  const toggleIndicator = (id: IndicatorId) => {
    setIndicators((current) => {
      const next = { ...current, [id]: !current[id] };
      saveIndicatorSelection(next);
      return next;
    });
  };

  const commitDrawingChange = useCallback((
    updater: ChartDrawing[] | ((current: ChartDrawing[]) => ChartDrawing[]),
  ) => {
    setDrawingHistory((currentHistory) => {
      const current = currentHistory.present;
      const nextDrawings =
        typeof updater === "function"
          ? updater(current)
          : updater;
      const nextHistory = commitDrawingHistory(currentHistory, nextDrawings);
      saveDrawings(active.id, nextHistory.present);
      return nextHistory;
    });
  }, [active.id]);

  const handleDrawingCreated = useCallback((drawing: ChartDrawing) => {
    commitDrawingChange((current) => [
      ...current,
      withDrawingMeta(drawing),
    ]);
  }, [commitDrawingChange]);

  const deleteDrawing = (id: string) => {
    commitDrawingChange((current) =>
      current.filter((drawing) => drawing.id !== id || drawing.locked),
    );
  };

  const toggleDrawingHidden = (id: string) => {
    commitDrawingChange((current) =>
      current.map((drawing) =>
        drawing.id === id
          ? { ...drawing, hidden: !drawing.hidden }
          : drawing,
      ),
    );
  };

  const toggleDrawingLocked = (id: string) => {
    commitDrawingChange((current) =>
      current.map((drawing) =>
        drawing.id === id
          ? { ...drawing, locked: !drawing.locked }
          : drawing,
      ),
    );
  };

  const clearDrawings = () => {
    commitDrawingChange((current) => current.filter((drawing) => drawing.locked));
    setDrawingTool("cursor");
    setTextAnchor(null);
    setEditingTextId(null);
  };

  const undoDrawings = useCallback(() => {
    setDrawingHistory((current) => {
      const next = undoDrawingHistory(current);
      saveDrawings(active.id, next.present);
      return next;
    });
  }, [active.id]);

  const redoDrawings = useCallback(() => {
    setDrawingHistory((current) => {
      const next = redoDrawingHistory(current);
      saveDrawings(active.id, next.present);
      return next;
    });
  }, [active.id]);

  const requestTextAnchor = useCallback((point: DrawingPoint) => {
    setTextAnchor(point);
    setTextDraft("");
    setEditingTextId(null);
  }, []);

  const editTextDrawing = (drawing: ChartDrawing) => {
    if (drawing.type !== "text" || drawing.locked) return;
    setTextAnchor(drawing.point);
    setTextDraft(drawing.text);
    setEditingTextId(drawing.id);
  };

  const saveTextDrawing = () => {
    const text = textDraft.trim();
    if (!text || !textAnchor) return;

    if (editingTextId) {
      commitDrawingChange((current) =>
        current.map((drawing) =>
          drawing.id === editingTextId && drawing.type === "text" && !drawing.locked
            ? { ...drawing, text }
            : drawing,
        ),
      );
    } else {
      handleDrawingCreated({
        id: createDrawingId(),
        type: "text",
        point: textAnchor,
        text,
      });
    }

    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setDrawingTool("cursor");
  };

  const cancelTextDrawing = () => {
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setDrawingTool("cursor");
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        setDrawingTool("cursor");
        setTextAnchor(null);
        setTextDraft("");
        setEditingTextId(null);
        return;
      }

      if (
        editable ||
        showScreener ||
        showEvents ||
        showSystemPanel ||
        showStrategyTester ||
        showIndicatorLab ||
        showCompanyFeed ||
        showObjectTree ||
        showReplaySetup
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDrawings();
        else undoDrawings();
        return;
      }

      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDrawings();
        return;
      }

      if (modifier || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "v") setDrawingTool("cursor");
      if (key === "l") setDrawingTool("trend");
      if (key === "h") setDrawingTool("horizontal");
      if (key === "m") setDrawingTool("measure");
      if (key === "n") setDrawingTool("text");
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    redoDrawings,
    undoDrawings,
    showScreener,
    showEvents,
    showSystemPanel,
    showStrategyTester,
    showIndicatorLab,
    showCompanyFeed,
    showObjectTree,
    showReplaySetup,
  ]);

  const clearComparison = () => {
    setComparisonSymbol(null);
    setComparisonCandles([]);
    setLayoutMode("single");
    setMaximizedChartPane(null);
    setSyncedLogicalRange(null);
    savePaneSymbol(
      "marketos:pane-secondary",
      null,
    );
    saveSetting(
      "marketos:chart-layout",
      "single",
    );
    if (objectTreePane !== "primary") {
      setObjectTreePane("primary");
    }
  };

  const chooseComparison = (symbol: MarketSymbol) => {
    if (symbol.id === active.id) return;
    setComparisonSymbol(symbol);
    savePaneSymbol("marketos:pane-secondary", symbol);
    setShowComparisonMenu(false);
    setMaximizedChartPane(null);
    setSyncedLogicalRange(null);
  };

  const chooseAuxiliaryPaneSymbol = (
    pane: AuxiliaryPane,
    symbol: MarketSymbol,
  ) => {
    if (pane === "secondary") {
      setComparisonSymbol(symbol);
      savePaneSymbol("marketos:pane-secondary", symbol);
    } else if (pane === "third") {
      setThirdChartSymbol(symbol);
      savePaneSymbol("marketos:pane-third", symbol);
    } else {
      setFourthChartSymbol(symbol);
      savePaneSymbol("marketos:pane-fourth", symbol);
    }
    setMaximizedChartPane(null);
    setSyncedLogicalRange(null);
  };

  const ensureMultiChartSymbols = (mode: ChartLayoutMode) => {
    if (mode === "single") return;

    const candidates = [
      ...watchlist,
      ...initialSymbols,
    ].filter(
      (symbol, index, list) =>
        symbol.id !== active.id &&
        list.findIndex((item) => item.id === symbol.id) === index,
    );

    let secondary = comparisonSymbol;
    if (!secondary) {
      secondary = candidates[0] ?? null;
      setComparisonSymbol(secondary);
      savePaneSymbol("marketos:pane-secondary", secondary);
    }

    if (mode !== "quad") return;

    const used = new Set([active.id, secondary?.id].filter(Boolean));
    let third = thirdChartSymbol;
    if (!third || used.has(third.id)) {
      third = candidates.find((symbol) => !used.has(symbol.id)) ?? candidates[0] ?? null;
      setThirdChartSymbol(third);
      savePaneSymbol("marketos:pane-third", third);
    }
    if (third) used.add(third.id);

    let fourth = fourthChartSymbol;
    if (!fourth || used.has(fourth.id)) {
      fourth = candidates.find((symbol) => !used.has(symbol.id)) ?? candidates[1] ?? candidates[0] ?? null;
      setFourthChartSymbol(fourth);
      savePaneSymbol("marketos:pane-fourth", fourth);
    }
  };

  const chooseLayoutMode = (mode: ChartLayoutMode) => {
    if (
      mode === "quad" &&
      !requireFeature(
        "quadChart",
        "تخطيط 4×",
      )
    ) {
      return;
    }

    ensureMultiChartSymbols(mode);
    setLayoutMode(mode);
    setMaximizedChartPane(null);

    if (mode === "single") {
      setSyncedLogicalRange(null);
      setLinkedCrosshair(null);
    } else {
      if (paneSymbolLinkEnabled) {
        setComparisonSymbol(active);
        savePaneSymbol(
          "marketos:pane-secondary",
          active,
        );

        if (mode === "quad") {
          setThirdChartSymbol(active);
          savePaneSymbol(
            "marketos:pane-third",
            active,
          );
          setFourthChartSymbol(active);
          savePaneSymbol(
            "marketos:pane-fourth",
            active,
          );
        }
      }

      if (paneTimeframeLinkEnabled) {
        setComparisonTimeframe(timeframe);
        saveSetting(
          "marketos:pane-secondary-timeframe",
          timeframe,
        );

        if (mode === "quad") {
          setThirdChartTimeframe(timeframe);
          saveSetting(
            "marketos:pane-third-timeframe",
            timeframe,
          );
          setFourthChartTimeframe(timeframe);
          saveSetting(
            "marketos:pane-fourth-timeframe",
            timeframe,
          );
        }
      }
    }

    saveSetting(
      "marketos:chart-layout",
      mode,
    );
  };

  const visiblePaneTimeframes = [
    timeframe,
    ...(layoutMode === "split" || layoutMode === "quad" ? [comparisonTimeframe] : []),
    ...(layoutMode === "quad" ? [thirdChartTimeframe, fourthChartTimeframe] : []),
  ];

  const chartSyncCompatible =
    new Set(visiblePaneTimeframes).size <= 1;

  const paneLinkSettings: PaneLinkSettings = {
    range: chartSyncEnabled,
    symbol: paneSymbolLinkEnabled,
    timeframe: paneTimeframeLinkEnabled,
    crosshair: paneCrosshairLinkEnabled,
  };

  const updatePaneLinkSettings = (
    next: PaneLinkSettings,
  ) => {
    setChartSyncEnabled(next.range);
    setPaneSymbolLinkEnabled(
      next.symbol,
    );
    setPaneTimeframeLinkEnabled(
      next.timeframe,
    );
    setPaneCrosshairLinkEnabled(
      next.crosshair,
    );
    savePaneLinkSettings(next);

    if (!next.range) {
      setSyncedLogicalRange(null);
    }

    if (!next.crosshair) {
      setLinkedCrosshair(null);
    }

    if (
      layoutMode !== "single" &&
      next.symbol
    ) {
      setComparisonSymbol(active);
      savePaneSymbol(
        "marketos:pane-secondary",
        active,
      );

      if (layoutMode === "quad") {
        setThirdChartSymbol(active);
        savePaneSymbol(
          "marketos:pane-third",
          active,
        );
        setFourthChartSymbol(active);
        savePaneSymbol(
          "marketos:pane-fourth",
          active,
        );
      }
    }

    if (
      layoutMode !== "single" &&
      next.timeframe
    ) {
      setComparisonTimeframe(timeframe);
      saveSetting(
        "marketos:pane-secondary-timeframe",
        timeframe,
      );

      if (layoutMode === "quad") {
        setThirdChartTimeframe(timeframe);
        saveSetting(
          "marketos:pane-third-timeframe",
          timeframe,
        );
        setFourthChartTimeframe(timeframe);
        saveSetting(
          "marketos:pane-fourth-timeframe",
          timeframe,
        );
      }
    }
  };

  const handleSynchronizedRangeChange = useCallback((range: LogicalRange | null) => {
    if (!chartSyncEnabled || !chartSyncCompatible || layoutMode === "single") return;
    setSyncedLogicalRange(range);
  }, [chartSyncEnabled, chartSyncCompatible, layoutMode]);

  const handleLinkedCrosshairChange = useCallback(
    (point: LinkedCrosshairPoint | null) => {
      if (
        !paneCrosshairLinkEnabled ||
        layoutMode === "single"
      ) {
        return;
      }

      setLinkedCrosshair(point);
    },
    [
      paneCrosshairLinkEnabled,
      layoutMode,
    ],
  );

  const toggleMaximizedPane = (pane: Exclude<MaximizedChartPane, null>) => {
    setMaximizedChartPane((current) => current === pane ? null : pane);
  };

  const startReplay = () => {
    if (candles.length < 25) return;
    setReplayPlaying(false);
    setShowReplaySetup(true);
  };

  const beginReplayAt = (index: number) => {
    const safe = Math.min(
      Math.max(20, Math.floor(index)),
      Math.max(20, candles.length - 1),
    );

    setReplayStartIndex(safe);
    setReplayIndex(safe);
    setReplayActive(true);
    setReplayPlaying(false);
    setShowReplaySetup(false);
    setHoverCandle(null);
  };

  const exitReplay = () => {
    setReplayActive(false);
    setReplayPlaying(false);
    setReplayIndex(null);
    setReplayStartIndex(null);
    setHoverCandle(null);
  };

  const stepReplay = (delta: number) => {
    setReplayPlaying(false);
    setReplayIndex((current) => {
      const base =
        current ??
        replayStartIndex ??
        defaultReplayStartIndex(candles.length);

      return Math.min(
        Math.max(
          replayStartIndex ?? 20,
          base + delta,
        ),
        Math.max(20, candles.length - 1),
      );
    });
    setHoverCandle(null);
  };

  const resetReplayToStart = () => {
    if (replayStartIndex === null) return;
    setReplayPlaying(false);
    setReplayIndex(replayStartIndex);
    setHoverCandle(null);
  };

  const changeReplaySpeed = (speed: ReplaySpeed) => {
    setReplaySpeed(speed);
    saveSetting("marketos:replay-speed", speed);
  };

  const addAdvancedAlert = (
    alertTimeframe: Timeframe,
    logic: AlertLogic,
    conditions: AdvancedAlertCondition[],
  ) => {
    if (
      alerts.length >=
      planLimits.alerts
    ) {
      showPlanRequirement(
        `وصلت حد التنبيهات في خطة ${entitlement.definition.name}: ${planLimits.alerts} تنبيه.`,
      );
      return;
    }

    const alert = createAdvancedAlert(
      active,
      alertTimeframe,
      logic,
      conditions,
    );

    setAlerts((current) => {
      const next = [alert, ...current].slice(0, 100);
      saveAlerts(next);
      return next;
    });
    setAlertCheckMessage(
      `تم إنشاء تنبيه ${active.ticker} على ${alertTimeframe.toUpperCase()}.`,
    );
  };

  const createAlertFromHorizontalDrawing = (
    drawing: ChartDrawing,
  ) => {
    if (drawing.type !== "horizontal") {
      return "هذا النوع من الرسومات لا يدعم تنبيه سعر مباشر.";
    }

    if (replayActive) {
      return "اخرج من Replay أولًا حتى لا تربط تنبيهًا حيًا بسعر تاريخي.";
    }

    if (
      alerts.length >=
      planLimits.alerts
    ) {
      showPlanRequirement(
        `وصلت حد التنبيهات في خطة ${entitlement.definition.name}: ${planLimits.alerts} تنبيه.`,
      );
      return "وصلت حد التنبيهات في خطتك الحالية.";
    }

    const currentPrice =
      quote?.price ??
      candles[candles.length - 1]?.close;

    if (
      currentPrice === undefined ||
      !Number.isFinite(currentPrice)
    ) {
      return "السعر الحالي غير متاح لإنشاء اتجاه التنبيه.";
    }

    const spec =
      buildHorizontalDrawingAlertSpec(
        currentPrice,
        drawing.price,
      );

    if (!spec) {
      return "السعر الحالي عند مستوى الخط تقريبًا؛ حرّك الخط قليلًا لتجنب تفعيل فوري.";
    }

    addAdvancedAlert(
      timeframe,
      "all",
      [{
        id: createAlertConditionId(),
        type: "numeric",
        metric: "price",
        operator: spec.operator,
        value: spec.value,
      }],
    );

    const direction =
      spec.operator === "above"
        ? "صعودًا"
        : "هبوطًا";

    const backgroundHint =
      canUseFeature(
        entitlement,
        "backgroundAlerts",
      )
        ? " استخدم الفحص السحابي لمزامنته حتى يعمل مع الفحص بالخلفية."
        : " تمّت إضافته إلى تنبيهاتك المحلية؛ الفحص بالخلفية يتطلب خطة تدعمه.";

    return `تم إنشاء تنبيه ${active.ticker} عند ${formatPrice(spec.value)} ${direction}.${backgroundHint}`;
  };

  const deleteAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.filter((alert) => alert.id !== id);
      saveAlerts(next);
      return next;
    });
  };

  const rearmAdvancedAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.map((alert) =>
        alert.id === id ? rearmAlert(alert) : alert,
      );
      saveAlerts(next);
      return next;
    });
  };

  const toggleAdvancedAlert = (id: string) => {
    setAlerts((current) => {
      const next = current.map((alert) =>
        alert.id === id ? toggleAlertEnabled(alert) : alert,
      );
      saveAlerts(next);
      return next;
    });
  };

  const checkAllAdvancedAlerts = async () => {
    if (alertsChecking) return;

    const pending = alerts.filter(
      (alert) => alert.enabled && !alert.triggeredAt,
    );
    if (pending.length === 0) {
      setAlertCheckMessage("لا توجد تنبيهات نشطة للفحص.");
      return;
    }

    const groups = new Map<string, {
      symbol: MarketSymbol;
      timeframe: Timeframe;
    }>();

    for (const alert of pending) {
      const key = `${alert.symbol.id}|${alert.timeframe}`;
      if (!groups.has(key)) {
        groups.set(key, {
          symbol: alert.symbol,
          timeframe: alert.timeframe,
        });
      }
    }

    const entries = [...groups.values()].slice(0, 20);
    setAlertsChecking(true);
    setAlertCheckMessage(null);

    const snapshots = await Promise.allSettled(
      entries.map(async (entry) => {
        const [candleResponse, quoteResponse] = await Promise.all([
          getMarketCandles(entry.symbol, entry.timeframe, 220),
          getMarketQuote(entry.symbol),
        ]);
        return {
          ...entry,
          candles: candleResponse.candles,
          quote: quoteResponse.quote,
        };
      }),
    );

    let nextAlerts = alerts;
    let triggeredCount = 0;
    let failedCount = 0;

    for (const snapshot of snapshots) {
      if (snapshot.status === "rejected") {
        failedCount += 1;
        continue;
      }

      const result = evaluateAdvancedAlerts(nextAlerts, {
        symbol: snapshot.value.symbol,
        timeframe: snapshot.value.timeframe,
        candles: snapshot.value.candles,
        quote: snapshot.value.quote,
      });
      nextAlerts = result.alerts;
      triggeredCount += result.triggered.length;
    }

    setAlerts(nextAlerts);
    saveAlerts(nextAlerts);
    setAlertsChecking(false);

    const skipped = groups.size > entries.length
      ? groups.size - entries.length
      : 0;

    setAlertCheckMessage(
      [
        `تم فحص ${entries.length} مجموعة رمز/فريم`,
        `تفعّل ${triggeredCount}`,
        failedCount > 0 ? `تعذر ${failedCount}` : "",
        skipped > 0 ? `مؤجل ${skipped}` : "",
      ].filter(Boolean).join(" · "),
    );

    if (triggeredCount > 0) {
      const latest = nextAlerts.find((alert) => alert.triggeredAt);
      if (latest) {
        setAlertMessage(
          `تنبيه ${latest.symbol.ticker} · ${latest.timeframe.toUpperCase()}: ${describeAdvancedAlert(latest)}`,
        );
        window.setTimeout(() => setAlertMessage(null), 7000);
      }
    }
  };

  const checkServerAdvancedAlerts = async () => {
    if (serverAlertsChecking || alertsChecking) return;

    if (!authUser) {
      setAlertCheckMessage("سجل الدخول أولًا لاستخدام الفحص السحابي.");
      setShowAccountPanel(true);
      return;
    }

    const pending = alerts.filter(
      (alert) => alert.enabled && !alert.triggeredAt,
    );
    if (pending.length === 0) {
      setAlertCheckMessage("لا توجد تنبيهات نشطة للفحص السحابي.");
      return;
    }

    setServerAlertsChecking(true);
    setAlertCheckMessage(null);

    try {
      await syncLocalStateToCloud();

      const result = await checkServerAlerts();

      const refreshed = await getCloudState();
      setCloudState(refreshed);

      const nextAlerts = sanitizeAlerts(
        refreshed.state?.alerts,
      );

      if (nextAlerts.length > 0 || alerts.length === 0) {
        setAlerts(nextAlerts);
        saveAlerts(nextAlerts);
      }

      await refreshAlertInbox();

      setAlertCheckMessage(
        [
          `سحابي: تم فحص ${result.checkedGroups} مجموعة رمز/فريم`,
          `تفعّل ${result.triggered.length}`,
          result.failures.length > 0
            ? `تعذر ${result.failures.length}`
            : "",
          result.capped ? "تم تطبيق حد الفحص" : "",
          result.storageMode === "cosmos"
            ? "محفوظ في Cosmos"
            : "تخزين Preview",
        ].filter(Boolean).join(" · "),
      );

      if (result.triggered.length > 0) {
        const latestTriggered =
          result.triggered[result.triggered.length - 1];
        const matchingAlert = nextAlerts.find(
          (alert) => alert.id === latestTriggered.alertId,
        );

        setAlertMessage(
          matchingAlert
            ? `تنبيه سحابي ${matchingAlert.symbol.ticker} · ${matchingAlert.timeframe.toUpperCase()}: ${describeAdvancedAlert(matchingAlert)}`
            : `تم تفعيل ${result.triggered.length} تنبيه سحابي.`,
        );
        window.setTimeout(
          () => setAlertMessage(null),
          7000,
        );
      }
    } catch (error) {
      setAlertCheckMessage(
        error instanceof Error
          ? `تعذر الفحص السحابي: ${error.message}`
          : "تعذر الفحص السحابي.",
      );
    } finally {
      setServerAlertsChecking(false);
    }
  };


  const saveCurrentWorkspace = () => {
    if (
      savedWorkspaces.length >=
      planLimits.savedWorkspaces
    ) {
      showPlanRequirement(
        `وصلت حد التخطيطات المحفوظة في خطة ${entitlement.definition.name}: ${planLimits.savedWorkspaces} تخطيط.`,
      );
      return;
    }

    const workspace = createWorkspace({
      name: `تخطيط ${savedWorkspaces.length + 1}`,
      symbol: active,
      timeframe,
      chartView,
      indicators,
      drawings,
      version: 5,
      layoutMode,
      chartSyncEnabled,
      paneLinks: paneLinkSettings,
      chartSettings,
      customIndicators,
      panes: {
        primary: {
          symbol: active,
          timeframe,
          visual: primaryPaneVisual,
        },
        secondary: comparisonSymbol
          ? {
              symbol: comparisonSymbol,
              timeframe: comparisonTimeframe,
              visual: secondaryVisual,
            }
          : null,
        third: thirdChartSymbol
          ? {
              symbol: thirdChartSymbol,
              timeframe: thirdChartTimeframe,
              visual: thirdVisual,
            }
          : null,
        fourth: fourthChartSymbol
          ? {
              symbol: fourthChartSymbol,
              timeframe: fourthChartTimeframe,
              visual: fourthVisual,
            }
          : null,
      },
    });

    setSavedWorkspaces((current) => {
      const next = [workspace, ...current].slice(0, 12);
      saveWorkspaces(next);
      return next;
    });
    setShowWorkspaceMenu(true);
  };

  const restoreWorkspace = (workspace: SavedWorkspace) => {
    const primaryPane = workspace.panes?.primary ?? {
      symbol: workspace.symbol,
      timeframe: workspace.timeframe,
    };
    const secondaryPane = workspace.panes?.secondary ?? null;
    const thirdPane = workspace.panes?.third ?? null;
    const fourthPane = workspace.panes?.fourth ?? null;

    const restoredPrimaryVisual =
      primaryPane.visual ?? {
        chartView: workspace.chartView,
        indicators: workspace.indicators,
        chartSettings:
          workspace.chartSettings ??
          chartSettings,
      };
    const restoredSecondaryVisual =
      secondaryPane?.visual ??
      restoredPrimaryVisual;
    const restoredThirdVisual =
      thirdPane?.visual ??
      restoredPrimaryVisual;
    const restoredFourthVisual =
      fourthPane?.visual ??
      restoredPrimaryVisual;

    const requestedLayout = workspace.layoutMode ?? "single";
    const requestedRestoredLayout: ChartLayoutMode =
      requestedLayout === "quad" && secondaryPane && thirdPane && fourthPane
        ? "quad"
        : requestedLayout === "split" && secondaryPane
          ? "split"
          : "single";

    const restoredLayout: ChartLayoutMode =
      requestedRestoredLayout === "quad" &&
      !canUseFeature(
        entitlement,
        "quadChart",
      )
        ? secondaryPane
          ? "split"
          : "single"
        : requestedRestoredLayout;

    if (
      requestedRestoredLayout === "quad" &&
      restoredLayout !== "quad"
    ) {
      showPlanRequirement(
        "هذا التخطيط محفوظ بوضع 4×. تم فتحه بوضع 2× لأن خطتك الحالية لا تشمل 4×.",
      );
    }

    setActive(primaryPane.symbol);
    setTimeframe(primaryPane.timeframe);
    setComparisonSymbol(secondaryPane?.symbol ?? null);
    setComparisonTimeframe(secondaryPane?.timeframe ?? primaryPane.timeframe);
    setThirdChartSymbol(thirdPane?.symbol ?? null);
    setThirdChartTimeframe(thirdPane?.timeframe ?? primaryPane.timeframe);
    setFourthChartSymbol(fourthPane?.symbol ?? null);
    setFourthChartTimeframe(fourthPane?.timeframe ?? primaryPane.timeframe);
    const restoredPaneLinks =
      workspace.paneLinks ?? {
        range:
          workspace.chartSyncEnabled ??
          true,
        symbol: false,
        timeframe: false,
        crosshair: false,
      };

    setLayoutMode(restoredLayout);
    setChartSyncEnabled(
      restoredPaneLinks.range,
    );
    setPaneSymbolLinkEnabled(
      restoredPaneLinks.symbol,
    );
    setPaneTimeframeLinkEnabled(
      restoredPaneLinks.timeframe,
    );
    setPaneCrosshairLinkEnabled(
      restoredPaneLinks.crosshair,
    );
    setLinkedCrosshair(null);
    savePaneLinkSettings(
      restoredPaneLinks,
    );
    setSyncedLogicalRange(null);
    setMaximizedChartPane(null);

    setChartView(
      restoredPrimaryVisual.chartView,
    );
    setIndicators(
      restoredPrimaryVisual.indicators,
    );
    setChartSettings(
      restoredPrimaryVisual.chartSettings,
    );
    setSecondaryVisual(
      restoredSecondaryVisual,
    );
    setThirdVisual(
      restoredThirdVisual,
    );
    setFourthVisual(
      restoredFourthVisual,
    );
    setChartResetKey(
      (current) => current + 1,
    );
    setDrawingHistory(createDrawingHistory(workspace.drawings));

    saveChartSettings(
      restoredPrimaryVisual.chartSettings,
    );
    savePaneVisualState(
      "secondary",
      restoredSecondaryVisual,
    );
    savePaneVisualState(
      "third",
      restoredThirdVisual,
    );
    savePaneVisualState(
      "fourth",
      restoredFourthVisual,
    );

    if (workspace.customIndicators) {
      setCustomIndicators(workspace.customIndicators);
      saveCustomIndicators(workspace.customIndicators);
    }

    setDrawingTool("cursor");
    setTextAnchor(null);
    setTextDraft("");
    setEditingTextId(null);
    setHoverCandle(null);
    setAiResult(null);
    setMultiTimeframeResult(null);
    setMultiTimeframeError(null);

    const restoredSymbols = [
      primaryPane.symbol,
      secondaryPane?.symbol,
      thirdPane?.symbol,
      fourthPane?.symbol,
    ].filter((symbol): symbol is MarketSymbol => Boolean(symbol));

    const outsideActiveCount =
      Math.max(
        0,
        totalWatchlistItemCount -
          watchlist.length,
      );

    const merged =
      new Map<string, MarketSymbol>(
        watchlist.map((symbol) => [
          symbol.id,
          symbol,
        ]),
      );

    for (
      const symbol
      of restoredSymbols
    ) {
      if (
        !merged.has(symbol.id) &&
        outsideActiveCount +
          merged.size >=
          planLimits.watchlistItems
      ) {
        break;
      }

      merged.set(
        symbol.id,
        symbol,
      );
    }

    persistActiveWatchlist([
      ...merged.values(),
    ]);

    updateActiveChartTabSession({
      symbol: primaryPane.symbol,
      timeframe: primaryPane.timeframe,
      chartView:
        restoredPrimaryVisual.chartView,
    });

    saveSetting("marketos:symbol", primaryPane.symbol.id);
    saveSetting("marketos:symbol-object", JSON.stringify(primaryPane.symbol));
    saveSetting("marketos:timeframe", primaryPane.timeframe);
    saveSetting(
      "marketos:chart-view",
      restoredPrimaryVisual.chartView,
    );
    saveSetting("marketos:chart-layout", restoredLayout);
    savePaneLinkSettings(
      restoredPaneLinks,
    );

    savePaneSymbol("marketos:pane-secondary", secondaryPane?.symbol ?? null);
    savePaneSymbol("marketos:pane-third", thirdPane?.symbol ?? null);
    savePaneSymbol("marketos:pane-fourth", fourthPane?.symbol ?? null);

    saveSetting(
      "marketos:pane-secondary-timeframe",
      secondaryPane?.timeframe ?? primaryPane.timeframe,
    );
    saveSetting(
      "marketos:pane-third-timeframe",
      thirdPane?.timeframe ?? primaryPane.timeframe,
    );
    saveSetting(
      "marketos:pane-fourth-timeframe",
      fourthPane?.timeframe ?? primaryPane.timeframe,
    );

    saveIndicatorSelection(
      restoredPrimaryVisual.indicators,
    );
    saveDrawings(primaryPane.symbol.id, workspace.drawings);
    setShowWorkspaceMenu(false);
  };
  const deleteWorkspace = (id: string) => {
    setSavedWorkspaces((current) => {
      const next = current.filter((workspace) => workspace.id !== id);
      saveWorkspaces(next);
      return next;
    });
  };

  const runMultiTimeframeReading = async () => {
    if (
      !requireFeature(
        "multiTimeframeAi",
        "Multi‑Timeframe AI",
      )
    ) {
      return;
    }

    if (multiTimeframeLoading) return;

    setMultiTimeframeLoading(true);
    setMultiTimeframeError(null);
    setMultiTimeframeResult(null);

    try {
      const result = await analyzeMultipleTimeframes(
        active,
        ["15m", "1h", "4h", "1d"],
        [
          ...activeIndicatorItems.map((item) => item.id),
          ...activeCustomIndicators.map((item) => `custom:${item.name}`),
        ],
        aiPrompt,
      );
      setMultiTimeframeResult(result);
    } catch (error) {
      setMultiTimeframeError(
        error instanceof Error
          ? error.message
          : "تعذر تشغيل التحليل متعدد الفريمات.",
      );
    } finally {
      setMultiTimeframeLoading(false);
    }
  };

  const runChartReading = async (promptOverride?: string) => {
    if (displayCandles.length < 20 || aiLoading) {
      if (displayCandles.length < 20) {
        setAiResult({
          engine: "browser-fallback",
          summary: "لا توجد شموع كافية لقراءة الشارت حاليًا.",
          observations: [],
        });
      }
      return;
    }

    const requestedPrompt = promptOverride ?? aiPrompt;
    setAiLoading(true);
    setAiResult(null);

    try {
      const analysis = await analyzeChart({
        symbol: active,
        timeframe,
        visibleCandles: displayCandles.slice(-300),
        quote,
        indicators: [
          ...activeIndicatorItems.map((item) => item.id),
          ...activeCustomIndicators.map((indicator) => `custom:${indicator.name}`),
        ],
        userDrawings: drawings
          .filter((drawing) => !drawing.hidden)
          .map((drawing) => {
            if (drawing.type === "horizontal") {
              return { type: "horizontal" as const, price: drawing.price };
            }
            if (drawing.type === "text") {
              return {
                type: "text" as const,
                point: drawing.point,
                text: drawing.text,
              };
            }
            return {
              type: drawing.type,
              points: drawing.points,
            };
          }),
        prompt: requestedPrompt,
      });

      setAiResult({
        engine: analysis.engine,
        summary: analysis.summary,
        observations: analysis.observations,
      });
    } catch {
      const recent = displayCandles.slice(-20);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const high = Math.max(...recent.map((candle) => candle.high));
      const low = Math.min(...recent.map((candle) => candle.low));
      const sma20 = recent.reduce((sum, candle) => sum + candle.close, 0) / recent.length;
      const move = ((last.close - first.open) / first.open) * 100;
      const relativeToSma = last.close >= sma20 ? "فوق" : "تحت";
      const indicatorNames = [
        ...activeIndicatorItems.map((item) => item.name),
        ...activeCustomIndicators.map((indicator) => indicator.name),
      ];
      const indicatorText = indicatorNames.length
        ? indicatorNames.join("، ")
        : "بدون مؤشرات إضافية";

      setAiResult({
        engine: "browser-fallback",
        summary: `${active.ticker} على ${timeframe.toUpperCase()}: قراءة محلية لأن API غير متاح حاليًا.`,
        observations: [
          `آخر سعر ${formatPrice(last.close)}، وحركة آخر 20 شمعة ${formatPercent(move)}.`,
          `النطاق الأخير ${formatPrice(low)} – ${formatPrice(high)}، والسعر ${relativeToSma} متوسط 20 شمعة.`,
          `المؤشرات النشطة: ${indicatorText}. الرسومات المحفوظة: ${drawings.length}.`,
        ],
      });
    } finally {
      setAiLoading(false);
    }
  };

  const drawingHint =
    drawingTool === "trend"
      ? "أداة الترند: انقر نقطتين على الشارت"
      : drawingTool === "horizontal"
        ? "الخط الأفقي: انقر على مستوى السعر"
        : drawingTool === "zone"
          ? "منطقة السعر: انقر زاويتين للمستطيل"
          : drawingTool === "fibonacci"
            ? "Fibonacci: اختر البداية ثم النهاية"
            : drawingTool === "measure"
              ? "القياس: اختر نقطة البداية ثم النهاية"
              : drawingTool === "text"
                ? "الملاحظة: انقر مكان النص على الشارت"
                : null;

  const manualFilteredOverview = useMemo(
    () => overview.filter((item) => overviewMatchesFilter(item, screenerFilter)),
    [overview, screenerFilter],
  );

  const smartScreenerParsed = useMemo(
    () => parseSmartScreenerQuery(appliedSmartScreenerQuery),
    [appliedSmartScreenerQuery],
  );

  const smartScreenerActive =
    appliedSmartScreenerQuery.trim().length > 0 &&
    smartScreenerParsed.recognized.length > 0;

  const filteredOverview = useMemo(
    () =>
      smartScreenerActive
        ? applySmartScreener(manualFilteredOverview, smartScreenerParsed.rule)
        : manualFilteredOverview,
    [manualFilteredOverview, smartScreenerActive, smartScreenerParsed.rule],
  );

  const sortedOverview = useMemo(
    () =>
      smartScreenerActive && smartScreenerParsed.rule.sortBy
        ? filteredOverview
        : [...filteredOverview].sort(
            (a, b) => (b.quote.percentChange ?? 0) - (a.quote.percentChange ?? 0),
          ),
    [filteredOverview, smartScreenerActive, smartScreenerParsed.rule.sortBy],
  );

  const applySmartQuery = () => {
    const trimmed = smartScreenerQuery.trim();
    setAppliedSmartScreenerQuery(trimmed);
  };

  const clearSmartQuery = () => {
    setSmartScreenerQuery("");
    setAppliedSmartScreenerQuery("");
  };

  const screenerAdvancers = filteredOverview.filter((item) => (item.quote.percentChange ?? 0) > 0).length;
  const screenerDecliners = filteredOverview.filter((item) => (item.quote.percentChange ?? 0) < 0).length;
  const screenerAverageMove = filteredOverview.length
    ? filteredOverview.reduce((sum, item) => sum + (item.quote.percentChange ?? 0), 0) / filteredOverview.length
    : 0;

  const activeAlerts = alerts.filter(
    (alert) => alert.enabled && !alert.triggeredAt,
  );

  const watchlistAlertCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of activeAlerts) {
      counts.set(
        alert.symbol.id,
        (counts.get(alert.symbol.id) ?? 0) + 1,
      );
    }
    return counts;
  }, [activeAlerts]);
  const replayDateLabel = replayActive && lastCandle
    ? new Date(lastCandle.time * 1000).toLocaleString("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const replayStats =
    replayActive &&
    replayStartIndex !== null
      ? buildReplaySessionStats(
          candles,
          replayStartIndex,
          safeReplayIndex,
        )
      : null;

  const multiChartSymbolOptions = useMemo(
    () => [
      ...new Map(
        [...watchlist, ...initialSymbols].map((symbol) => [symbol.id, symbol]),
      ).values(),
    ],
    [watchlist],
  );

  const registerPrimarySnapshot = useCallback(
    (capture: ChartSnapshotCapture | null) => {
      snapshotCaptureRef.current = capture;
    },
    [],
  );

  const ignoreDrawingCreated = useCallback((_drawing: ChartDrawing) => undefined, []);

  const changePaneSymbol = (
    pane: ChartPaneId,
    symbolId: string,
  ) => {
    const symbol = multiChartSymbolOptions.find((item) => item.id === symbolId);
    if (!symbol) return;

    if (
      paneSymbolLinkEnabled &&
      layoutMode !== "single"
    ) {
      chooseSymbol(symbol);
      return;
    }

    if (pane === "primary") {
      chooseSymbol(symbol);
      return;
    }

    chooseAuxiliaryPaneSymbol(pane, symbol);
  };

  const paneTimeframe = (pane: ChartPaneId): Timeframe => {
    if (pane === "primary") return timeframe;
    if (pane === "secondary") return comparisonTimeframe;
    if (pane === "third") return thirdChartTimeframe;
    return fourthChartTimeframe;
  };

  const changePaneTimeframe = (
    pane: ChartPaneId,
    nextTimeframe: Timeframe,
  ) => {
    setSyncedLogicalRange(null);

    if (
      paneTimeframeLinkEnabled &&
      layoutMode !== "single"
    ) {
      chooseTimeframe(nextTimeframe);
      return;
    }

    if (pane === "primary") {
      chooseTimeframe(nextTimeframe);
      return;
    }

    if (pane === "secondary") {
      setComparisonTimeframe(nextTimeframe);
      saveSetting("marketos:pane-secondary-timeframe", nextTimeframe);
      return;
    }

    if (pane === "third") {
      setThirdChartTimeframe(nextTimeframe);
      saveSetting("marketos:pane-third-timeframe", nextTimeframe);
      return;
    }

    setFourthChartTimeframe(nextTimeframe);
    saveSetting("marketos:pane-fourth-timeframe", nextTimeframe);
  };

  const primaryPaneVisual: PaneVisualState = {
    chartView,
    indicators,
    chartSettings,
  };

  const paneVisual = (
    pane: ChartPaneId,
  ): PaneVisualState => {
    if (pane === "primary") {
      return primaryPaneVisual;
    }
    if (pane === "secondary") {
      return secondaryVisual;
    }
    if (pane === "third") {
      return thirdVisual;
    }
    return fourthVisual;
  };

  const changePaneVisual = (
    pane: ChartPaneId,
    next: PaneVisualState,
  ) => {
    if (pane === "primary") {
      setChartView(next.chartView);
      saveSetting(
        "marketos:chart-view",
        next.chartView,
      );
      setIndicators(next.indicators);
      saveIndicatorSelection(
        next.indicators,
      );
      setChartSettings(
        next.chartSettings,
      );
      saveChartSettings(
        next.chartSettings,
      );
      setChartResetKey(
        (current) => current + 1,
      );
      return;
    }

    if (pane === "secondary") {
      setSecondaryVisual(next);
      savePaneVisualState(
        "secondary",
        next,
      );
      return;
    }

    if (pane === "third") {
      setThirdVisual(next);
      savePaneVisualState(
        "third",
        next,
      );
      return;
    }

    setFourthVisual(next);
    savePaneVisualState(
      "fourth",
      next,
    );
  };

  const objectTreePaneOptions: Array<{
    id: ObjectTreePaneId;
    label: string;
  }> = [
    {
      id: "primary",
      label: "Pane 1 · " + active.ticker,
    },
    ...(layoutMode !== "single" && comparisonSymbol
      ? [{
          id: "secondary" as const,
          label: "Pane 2 · " + comparisonSymbol.ticker,
        }]
      : []),
    ...(layoutMode === "quad" && thirdChartSymbol
      ? [{
          id: "third" as const,
          label: "Pane 3 · " + thirdChartSymbol.ticker,
        }]
      : []),
    ...(layoutMode === "quad" && fourthChartSymbol
      ? [{
          id: "fourth" as const,
          label: "Pane 4 · " + fourthChartSymbol.ticker,
        }]
      : []),
  ];

  const objectTreeSymbol =
    objectTreePane === "secondary"
      ? comparisonSymbol ?? active
      : objectTreePane === "third"
        ? thirdChartSymbol ?? active
        : objectTreePane === "fourth"
          ? fourthChartSymbol ?? active
          : active;

  const objectTreeVisual =
    paneVisual(objectTreePane);

  const toggleObjectTreeIndicator = (
    id: IndicatorId,
  ) => {
    changePaneVisual(
      objectTreePane,
      {
        ...objectTreeVisual,
        indicators: {
          ...objectTreeVisual.indicators,
          [id]:
            !objectTreeVisual.indicators[id],
        },
      },
    );
  };

  useEffect(() => {
    const stillAvailable =
      objectTreePaneOptions.some(
        (pane) =>
          pane.id === objectTreePane,
      );

    if (!stillAvailable) {
      setObjectTreePane("primary");
    }
  }, [
    objectTreePane,
    layoutMode,
    comparisonSymbol?.id,
    thirdChartSymbol?.id,
    fourthChartSymbol?.id,
  ]);

  const commandSymbolOptions = [
    ...new Map(
      [
        ...commandSymbolResults,
        ...watchlistCollections.flatMap(
          (collection) =>
            collection.symbols,
        ),
        ...initialSymbols,
      ].map((symbol) => [symbol.id, symbol]),
    ).values(),
  ];

  const commandPaletteItems: CommandPaletteItem[] = [
    {
      id: "panel:home",
      group: "التنقل",
      label: "لوحة البداية",
      description: "ملخص السوق والتنبيهات والأحداث والتخطيطات",
      keywords: ["home", "dashboard", "الرئيسية", "لوحة"],
      priority: 110,
      onSelect: openHomeDashboard,
    },
    ...watchlistCollections.map(
      (collection, index) => ({
        id: `watchlist:${collection.id}`,
        group: "Watchlists",
        label: collection.name,
        description: `${collection.symbols.length} رمز`,
        keywords: [
          "watchlist",
          "قائمة",
          "متابعة",
          collection.name,
        ],
        priority:
          collection.id ===
          activeWatchlistId
            ? 96
            : 66 - index,
        badge:
          collection.id ===
          activeWatchlistId
            ? "الحالية"
            : undefined,
        onSelect: () =>
          selectWatchlistCollection(
            collection.id,
          ),
      }),
    ),
    ...commandSymbolOptions.map((symbol, index) => ({
      id: `symbol:${symbol.id}`,
      group: "رموز",
      label: symbol.ticker,
      description: `${symbol.name} · ${symbol.exchange}`,
      keywords: [
        symbol.name,
        symbol.exchange,
        symbol.country ?? "",
        symbol.assetClass,
        symbol.providerSymbol ?? "",
      ],
      priority: symbol.id === active.id ? 100 : 88 - Math.min(index, 20),
      badge: symbol.id === active.id ? "الحالي" : undefined,
      onSelect: () => chooseSymbol(symbol),
    })),
    ...timeframes.map((item) => ({
      id: `timeframe:${item}`,
      group: "فريمات",
      label: item.toUpperCase(),
      description: "تغيير فريم الشارت الرئيسي",
      keywords: ["timeframe", "فريم", "زمن"],
      priority: item === timeframe ? 78 : 62,
      badge: item === timeframe ? "الحالي" : undefined,
      onSelect: () => chooseTimeframe(item),
    })),
    ...([
      ["candles", "شموع", "Candles"],
      ["line", "خط", "Line"],
      ["area", "مساحة", "Area"],
    ] as Array<[ChartView, string, string]>).map(([view, label, english]) => ({
      id: `chart-view:${view}`,
      group: "الشارت",
      label,
      description: `نوع الشارت · ${english}`,
      keywords: [english, "chart", "عرض"],
      priority: view === chartView ? 70 : 52,
      badge: view === chartView ? "الحالي" : undefined,
      onSelect: () => chooseChartView(view),
    })),
    {
      id: "panel:market",
      group: "أدوات",
      label: "خريطة السوق",
      description: "Screener · Heatmap · Smart Screener",
      keywords: ["market", "screener", "heatmap", "السوق"],
      priority: 76,
      onSelect: openScreener,
    },
    {
      id: "panel:alerts",
      group: "أدوات",
      label: "التنبيهات",
      description: `${activeAlerts.length} تنبيه نشط`,
      keywords: ["alerts", "تنبيه", "شرط"],
      priority: 74,
      onSelect: () => setShowAlertMenu(true),
    },
    {
      id: "panel:alert-inbox",
      group: "أدوات",
      label: "سجل التنبيهات",
      description: authUser ? "التفعيلات السحابية والخلفية" : "يتطلب تسجيل الدخول",
      keywords: ["inbox", "notifications", "تنبيهات", "اشعارات"],
      priority: 72,
      badge: authUser
        ? (alertInboxEvents.some((event) => !event.readAt)
            ? `${alertInboxEvents.filter((event) => !event.readAt).length} جديد`
            : undefined)
        : "دخول",
      onSelect: () => {
        if (!authUser) {
          setShowAccountPanel(true);
          return;
        }
        setShowAlertInbox(true);
        void refreshAlertInbox();
      },
    },
    {
      id: "panel:overview",
      group: "تحليل",
      label: "تفاصيل الأصل",
      description: "الأداء والتذبذب والحجم والنطاق",
      keywords: ["overview", "stats", "تفاصيل", "احصائيات"],
      priority: 70,
      onSelect: () => setShowInstrumentOverview(true),
    },
    {
      id: "panel:ai",
      group: "AI",
      label: aiPanelOpen ? "إخفاء MarketOS AI" : "فتح MarketOS AI",
      description: "قراءة الشارت وData Window",
      keywords: ["ai", "ذكاء", "assistant", "data window"],
      priority: 69,
      onSelect: toggleAiPanel,
    },
    {
      id: "ai:multi-timeframe",
      group: "AI",
      label: "تشغيل Multi-Timeframe AI",
      description: "15m · 1h · 4h · 1d",
      keywords: ["ai", "multi timeframe", "متعدد الفريمات"],
      priority: 65,
      badge: canUseFeature(entitlement, "multiTimeframeAi") ? undefined : "Pro+",
      onSelect: () => {
        setAiPanelOpen(true);
        void runMultiTimeframeReading();
      },
    },
    {
      id: "panel:export",
      group: "أدوات",
      label: "تصدير ومشاركة",
      description: "PNG · CSV · رابط الشارت",
      keywords: ["export", "share", "png", "csv", "تصدير", "مشاركة"],
      priority: 68,
      onSelect: () => {
        setExportMessage(null);
        setExportError(null);
        setShowExportPanel(true);
      },
    },
    {
      id: "panel:events",
      group: "السوق",
      label: "أحداث السوق",
      description: "التقويم والأحداث القادمة",
      keywords: ["events", "calendar", "earnings", "احداث", "تقويم"],
      priority: 60,
      onSelect: openEvents,
    },
    {
      id: "panel:company-feed",
      group: "السوق",
      label: "إفصاحات الشركات",
      description: "Company Feed",
      keywords: ["company", "feed", "press releases", "افصاحات"],
      priority: 59,
      onSelect: openCompanyFeed,
    },
    {
      id: "panel:correlation",
      group: "تحليل",
      label: "مصفوفة الارتباط",
      description: "Correlation Matrix",
      keywords: ["correlation", "ارتباط", "matrix"],
      priority: 58,
      badge: canUseFeature(entitlement, "correlationMatrix") ? undefined : "Pro+",
      onSelect: () => {
        if (requireFeature("correlationMatrix", "Correlation Matrix")) {
          setShowCorrelation(true);
        }
      },
    },
    {
      id: "panel:strategy",
      group: "تحليل",
      label: "Strategy Tester",
      description: "اختبار الاستراتيجيات تاريخيًا",
      keywords: ["strategy", "backtest", "استراتيجية", "باك تست"],
      priority: 57,
      badge: canUseFeature(entitlement, "strategyTester") ? undefined : "Pro+",
      onSelect: () => {
        if (requireFeature("strategyTester", "Strategy Tester")) {
          setShowStrategyTester(true);
        }
      },
    },
    {
      id: "panel:indicator-lab",
      group: "مؤشرات",
      label: "معمل المؤشرات",
      description: "Custom Indicator Lab",
      keywords: ["indicator", "formula", "مؤشرات", "معادلة"],
      priority: 56,
      badge: canUseFeature(entitlement, "customIndicatorLab") ? undefined : "Pro+",
      onSelect: () => {
        if (requireFeature("customIndicatorLab", "معمل المؤشرات")) {
          setShowIndicatorLab(true);
        }
      },
    },
    {
      id: "panel:chart-settings",
      group: "الشارت",
      label: "إعدادات الشارت",
      description: "Scale · Grid · Crosshair · Volume",
      keywords: ["settings", "scale", "grid", "اعدادات"],
      priority: 55,
      onSelect: () => setShowChartSettings(true),
    },
    {
      id: "panel:chart-templates",
      group: "الشارت",
      label: "قوالب الشارت",
      description: `${chartTemplates.length} / ${planLimits.chartTemplates} محفوظ`,
      keywords: ["templates", "preset", "قوالب", "اعدادات", "مؤشرات"],
      priority: 54.5,
      onSelect: () => {
        setChartTemplateMessage(null);
        setShowChartTemplates(true);
      },
    },
    {
      id: "panel:object-tree",
      group: "الشارت",
      label: "شجرة العناصر",
      description: `${drawings.length} رسم · ${activeIndicatorItems.length + activeCustomIndicators.length} مؤشر`,
      keywords: ["object tree", "objects", "عناصر", "شجرة", "رسومات", "مؤشرات"],
      priority: 54.25,
      onSelect: () => {
        setObjectTreePane("primary");
        setShowObjectTree(true);
      },
    },
    {
      id: "panel:plans",
      group: "الحساب",
      label: "الخطط والحدود",
      description: `خطتك الحالية: ${entitlement.definition.name}`,
      keywords: ["plans", "free", "pro", "elite", "خطط"],
      priority: 54,
      badge: entitlement.definition.name,
      onSelect: () => {
        setPlanMessage(null);
        setShowPlansPanel(true);
      },
    },
    {
      id: "panel:account",
      group: "الحساب",
      label: authUser ? "الحساب والمزامنة" : "تسجيل الدخول",
      description: authUser
        ? "Cloud Sync · Push · الخطة"
        : "Microsoft أو GitHub",
      keywords: ["account", "login", "sync", "حساب", "دخول"],
      priority: 53,
      onSelect: () => setShowAccountPanel(true),
    },
    {
      id: "panel:system",
      group: "النظام",
      label: "حالة النظام",
      description: "API · Providers · Storage · Push",
      keywords: ["system", "health", "api", "نظام"],
      priority: 48,
      onSelect: openSystemPanel,
    },
    {
      id: "toggle:watchlist",
      group: "الواجهة",
      label: watchlistOpen ? "إخفاء قائمة المتابعة" : "إظهار قائمة المتابعة",
      description: "Watchlist",
      keywords: ["watchlist", "متابعة", "قائمة"],
      priority: 47,
      onSelect: toggleWatchlistPanel,
    },
    {
      id: "workspace:save",
      group: "التخطيطات",
      label: "حفظ التخطيط الحالي",
      description: `${savedWorkspaces.length} / ${planLimits.savedWorkspaces} محفوظ`,
      keywords: ["workspace", "layout", "save", "حفظ", "تخطيط"],
      priority: 46,
      onSelect: saveCurrentWorkspace,
    },
    ...savedWorkspaces.slice(0, 12).map((workspace, index) => ({
      id: `workspace:${workspace.id}`,
      group: "التخطيطات",
      label: workspace.name,
      description: `${workspace.symbol.ticker} · ${workspace.timeframe.toUpperCase()} · ${workspace.layoutMode === "quad" ? "4×" : workspace.layoutMode === "split" ? "2×" : "1×"}`,
      keywords: ["workspace", "layout", workspace.symbol.ticker, "تخطيط"],
      priority: 45 - index,
      onSelect: () => restoreWorkspace(workspace),
    })),
    ...([
      ["single", "تخطيط 1×", "شارت واحد"],
      ["split", "تخطيط 2×", "شارتان"],
      ["quad", "تخطيط 4×", "أربعة شارتات"],
    ] as Array<[ChartLayoutMode, string, string]>).map(([mode, label, description]) => ({
      id: `layout:${mode}`,
      group: "التخطيطات",
      label,
      description,
      keywords: ["layout", "pane", "تخطيط"],
      priority: mode === layoutMode ? 44 : 38,
      badge:
        mode === "quad" && !canUseFeature(entitlement, "quadChart")
          ? "Pro+"
          : mode === layoutMode
            ? "الحالي"
            : undefined,
      onSelect: () => chooseLayoutMode(mode),
    })),
    {
      id: "link:symbol",
      group: "Panes",
      label: paneSymbolLinkEnabled ? "إيقاف ربط الرموز" : "ربط الرموز بين Panes",
      description: "Symbol Link",
      keywords: ["link", "symbol", "panes", "ربط", "رموز"],
      priority: 44.8,
      badge: paneSymbolLinkEnabled ? "ON" : undefined,
      onSelect: () =>
        updatePaneLinkSettings({
          ...paneLinkSettings,
          symbol: !paneSymbolLinkEnabled,
        }),
    },
    {
      id: "link:timeframe",
      group: "Panes",
      label: paneTimeframeLinkEnabled ? "إيقاف ربط الفريمات" : "ربط الفريمات بين Panes",
      description: "Timeframe Link",
      keywords: ["link", "timeframe", "frame", "panes", "ربط", "فريم"],
      priority: 44.7,
      badge: paneTimeframeLinkEnabled ? "ON" : undefined,
      onSelect: () =>
        updatePaneLinkSettings({
          ...paneLinkSettings,
          timeframe: !paneTimeframeLinkEnabled,
        }),
    },
    {
      id: "link:crosshair",
      group: "Panes",
      label: paneCrosshairLinkEnabled ? "إيقاف ربط Crosshair" : "ربط Crosshair بين Panes",
      description: "Crosshair Link · نفس الزمن عبر الشارتات",
      keywords: ["link", "crosshair", "cursor", "panes", "ربط", "مؤشر"],
      priority: 44.65,
      badge: paneCrosshairLinkEnabled ? "ON" : undefined,
      onSelect: () =>
        updatePaneLinkSettings({
          ...paneLinkSettings,
          crosshair: !paneCrosshairLinkEnabled,
        }),
    },
    {
      id: "link:range",
      group: "Panes",
      label: chartSyncEnabled ? "إيقاف ربط Zoom/Scroll" : "ربط Zoom/Scroll",
      description: chartSyncCompatible ? "Range Link" : "يتطلب نفس الفريم",
      keywords: ["link", "range", "zoom", "scroll", "panes", "ربط"],
      priority: 44.6,
      badge: chartSyncEnabled && chartSyncCompatible ? "ON" : undefined,
      onSelect: () => {
        if (!chartSyncCompatible) return;
        updatePaneLinkSettings({
          ...paneLinkSettings,
          range: !chartSyncEnabled,
        });
      },
    },
    {
      id: "replay:toggle",
      group: "الشارت",
      label: replayActive ? "الخروج من Replay" : "بدء Replay",
      description: "إعادة تشغيل تاريخية",
      keywords: ["replay", "historical", "اعادة", "تاريخي"],
      priority: 43,
      onSelect: replayActive ? exitReplay : startReplay,
    },
    ...([
      ["cursor", "المؤشر", "V"],
      ["trend", "خط الاتجاه", "L"],
      ["horizontal", "خط أفقي", "H"],
      ["zone", "منطقة سعر", ""],
      ["fibonacci", "Fibonacci", ""],
      ["measure", "أداة القياس", "M"],
      ["text", "ملاحظة نصية", "N"],
    ] as Array<[DrawingTool, string, string]>).map(([tool, label, shortcut]) => ({
      id: `drawing:${tool}`,
      group: "الرسم",
      label,
      description: "أداة رسم على الشارت",
      keywords: ["drawing", "رسم", tool],
      shortcut: shortcut || undefined,
      priority: tool === drawingTool ? 42 : 32,
      badge: tool === drawingTool ? "الحالي" : undefined,
      onSelect: () => setDrawingTool(tool),
    })),
  ];

  const renderPaneSymbolSelector = (
    pane: ChartPaneId,
    symbol: MarketSymbol,
  ) => (
    <div className="pane-symbol-selector" dir="ltr">
      <select
        value={symbol.id}
        onChange={(event) => changePaneSymbol(pane, event.target.value)}
        aria-label={`رمز ${pane}`}
      >
        {multiChartSymbolOptions.map((option) => (
          <option value={option.id} key={option.id}>
            {option.ticker} · {option.exchange}
          </option>
        ))}
      </select>

      <select
        className="pane-timeframe-select"
        value={paneTimeframe(pane)}
        onChange={(event) => changePaneTimeframe(pane, event.target.value as Timeframe)}
        aria-label={`فريم ${pane}`}
      >
        {timeframes.map((item) => (
          <option value={item} key={item}>
            {item.toUpperCase()}
          </option>
        ))}
      </select>

      <PaneVisualControls
        paneLabel={
          pane === "primary"
            ? "Pane 1"
            : pane === "secondary"
              ? "Pane 2"
              : pane === "third"
                ? "Pane 3"
                : "Pane 4"
        }
        state={paneVisual(pane)}
        onChange={(next) =>
          changePaneVisual(
            pane,
            next,
          )
        }
        onCopyPrimary={
          pane === "primary"
            ? undefined
            : () =>
                changePaneVisual(
                  pane,
                  primaryPaneVisual,
                )
        }
      />
    </div>
  );

  const primaryChartNode = (
    <div className="chart-host primary-chart-host">
      {layoutMode !== "single" ? (
        <>
          {renderPaneSymbolSelector("primary", active)}
          <div className="chart-pane-actions primary-pane-actions">
          <button
            onClick={() => toggleMaximizedPane("primary")}
            title={maximizedChartPane === "primary" ? "إرجاع الشارتين" : "تكبير الشارت"}
          >
            {maximizedChartPane === "primary" ? "⊞" : "⛶"}
          </button>
          </div>
        </>
      ) : null}
      {inspectedCandle ? (
        <div className="ohlc-legend" dir="ltr">
          <span>O <b>{formatPrice(inspectedCandle.open)}</b></span>
          <span>H <b>{formatPrice(inspectedCandle.high)}</b></span>
          <span>L <b>{formatPrice(inspectedCandle.low)}</b></span>
          <span>C <b className={inspectedCandle.close >= inspectedCandle.open ? "positive" : "negative"}>
            {formatPrice(inspectedCandle.close)}
          </b></span>
          {inspectedCandle.volume !== undefined ? (
            <span>V <b>{Math.round(inspectedCandle.volume).toLocaleString("en-US")}</b></span>
          ) : null}
        </div>
      ) : null}
      <MarketChart
        candles={displayCandles}
        timeframe={timeframe}
        chartView={chartView}
        indicators={indicators}
        customIndicators={customIndicators}
        drawings={drawings}
        drawingTool={drawingTool}
        onDrawingCreated={handleDrawingCreated}
        onTextAnchorRequested={requestTextAnchor}
        onCrosshairCandle={setHoverCandle}
        paneId="primary"
        syncedCrosshair={
          paneCrosshairLinkEnabled &&
          layoutMode !== "single"
            ? linkedCrosshair
            : null
        }
        onCrosshairLinkChange={handleLinkedCrosshairChange}
        onSnapshotCaptureReady={registerPrimarySnapshot}
        comparison={
          layoutMode === "single" && comparisonSymbol && displayComparisonCandles.length > 0
            ? { symbol: comparisonSymbol, candles: displayComparisonCandles }
            : null
        }
        settings={chartSettings}
        resetViewKey={chartResetKey}
        syncedLogicalRange={chartSyncEnabled && chartSyncCompatible ? syncedLogicalRange : null}
        onVisibleLogicalRangeChange={handleSynchronizedRangeChange}
      />
      {textAnchor ? (
        <div className="text-note-composer" dir="rtl">
          <div className="text-note-title">
            {editingTextId ? "تعديل الملاحظة" : "ملاحظة جديدة"}
          </div>
          <input
            autoFocus
            value={textDraft}
            maxLength={120}
            onChange={(event) => setTextDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTextDrawing();
              if (event.key === "Escape") cancelTextDrawing();
            }}
            placeholder="اكتب ملاحظتك على الشارت"
          />
          <div className="text-note-actions">
            <button onClick={cancelTextDrawing}>إلغاء</button>
            <button className="primary" onClick={saveTextDrawing} disabled={!textDraft.trim()}>
              حفظ
            </button>
          </div>
        </div>
      ) : null}
      {dataState === "loading" && !replayActive ? <div className="chart-state commercial-chart-loading"><span className="commercial-loading-ring" /><strong>جاري تجهيز الشارت</strong><small>يتم تحميل بيانات السوق</small></div> : null}
      {dataState === "provider" ? <div className="chart-mode live">LIVE</div> : null}
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
      {drawingHint ? <div className="drawing-hint">{drawingHint}</div> : null}
    </div>
  );

  const secondaryChartNode = comparisonSymbol ? (
    <div className="chart-host secondary-chart-host">
      {renderPaneSymbolSelector("secondary", comparisonSymbol)}
      <div className="chart-pane-actions">
        <button
          onClick={() => toggleMaximizedPane("secondary")}
          title={maximizedChartPane === "secondary" ? "إرجاع الشارتين" : "تكبير الشارت"}
        >
          {maximizedChartPane === "secondary" ? "⊞" : "⛶"}
        </button>
      </div>
      <MarketChart
        candles={displayComparisonCandles}
        timeframe={comparisonTimeframe}
        chartView={secondaryVisual.chartView}
        indicators={secondaryVisual.indicators}
        customIndicators={customIndicators}
        drawings={[]}
        drawingTool="cursor"
        onDrawingCreated={ignoreDrawingCreated}
        paneId="secondary"
        syncedCrosshair={
          paneCrosshairLinkEnabled
            ? linkedCrosshair
            : null
        }
        onCrosshairLinkChange={handleLinkedCrosshairChange}
        comparison={null}
        settings={secondaryVisual.chartSettings}
        resetViewKey={chartResetKey}
        syncedLogicalRange={chartSyncEnabled && chartSyncCompatible ? syncedLogicalRange : null}
        onVisibleLogicalRangeChange={handleSynchronizedRangeChange}
      />
      {displayComparisonCandles.length === 0 ? (
        <div className="chart-state commercial-chart-loading"><span className="commercial-loading-ring" /><strong>جاري تجهيز Pane 2</strong></div>
      ) : null}
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
    </div>
  ) : null;

  const thirdChartNode = thirdChartSymbol ? (
    <div className="chart-host third-chart-host">
      {renderPaneSymbolSelector("third", thirdChartSymbol)}
      <div className="chart-pane-actions">
        <button
          onClick={() => toggleMaximizedPane("third")}
          title={maximizedChartPane === "third" ? "إرجاع التخطيط" : "تكبير الشارت"}
        >
          {maximizedChartPane === "third" ? "⊞" : "⛶"}
        </button>
      </div>
      <MarketChart
        candles={displayThirdChartCandles}
        timeframe={thirdChartTimeframe}
        chartView={thirdVisual.chartView}
        indicators={thirdVisual.indicators}
        customIndicators={customIndicators}
        drawings={[]}
        drawingTool="cursor"
        onDrawingCreated={ignoreDrawingCreated}
        paneId="third"
        syncedCrosshair={
          paneCrosshairLinkEnabled
            ? linkedCrosshair
            : null
        }
        onCrosshairLinkChange={handleLinkedCrosshairChange}
        comparison={null}
        settings={thirdVisual.chartSettings}
        resetViewKey={chartResetKey}
        syncedLogicalRange={chartSyncEnabled && chartSyncCompatible ? syncedLogicalRange : null}
        onVisibleLogicalRangeChange={handleSynchronizedRangeChange}
      />
      {displayThirdChartCandles.length === 0 ? (
        <div className="chart-state commercial-chart-loading"><span className="commercial-loading-ring" /><strong>جاري تجهيز Pane 3</strong></div>
      ) : null}
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
    </div>
  ) : null;

  const fourthChartNode = fourthChartSymbol ? (
    <div className="chart-host fourth-chart-host">
      {renderPaneSymbolSelector("fourth", fourthChartSymbol)}
      <div className="chart-pane-actions">
        <button
          onClick={() => toggleMaximizedPane("fourth")}
          title={maximizedChartPane === "fourth" ? "إرجاع التخطيط" : "تكبير الشارت"}
        >
          {maximizedChartPane === "fourth" ? "⊞" : "⛶"}
        </button>
      </div>
      <MarketChart
        candles={displayFourthChartCandles}
        timeframe={fourthChartTimeframe}
        chartView={fourthVisual.chartView}
        indicators={fourthVisual.indicators}
        customIndicators={customIndicators}
        drawings={[]}
        drawingTool="cursor"
        onDrawingCreated={ignoreDrawingCreated}
        paneId="fourth"
        syncedCrosshair={
          paneCrosshairLinkEnabled
            ? linkedCrosshair
            : null
        }
        onCrosshairLinkChange={handleLinkedCrosshairChange}
        comparison={null}
        settings={fourthVisual.chartSettings}
        resetViewKey={chartResetKey}
        syncedLogicalRange={chartSyncEnabled && chartSyncCompatible ? syncedLogicalRange : null}
        onVisibleLogicalRangeChange={handleSynchronizedRangeChange}
      />
      {displayFourthChartCandles.length === 0 ? (
        <div className="chart-state commercial-chart-loading"><span className="commercial-loading-ring" /><strong>جاري تجهيز Pane 4</strong></div>
      ) : null}
      {replayActive ? <div className="chart-mode replay-mode">REPLAY</div> : null}
    </div>
  ) : null;

  return (
    <main className="shell">
      <CommercialTopBar
        previewMode={providerStatus?.mode === "demo"}
        connected={dataState !== "loading"}
        sessionLabel={sessionLabel}
        alertCount={activeAlerts.length}
        alertInboxCount={alertInboxEvents.filter((event) => !event.readAt).length}
        eventCount={marketEvents.length}
        companyCount={companyReleases.length}
        watchlistOpen={watchlistOpen}
        aiOpen={aiPanelOpen}
        onHome={openHomeDashboard}
        onToggleWatchlist={toggleWatchlistPanel}
        onCommandPalette={() => {
          setCommandQuery("");
          setCommandSymbolResults([]);
          setShowCommandPalette(true);
        }}
        onToggleAi={toggleAiPanel}
        onMarket={openScreener}
        onAlerts={() => setShowAlertMenu(true)}
        onAlertInbox={() => {
          if (!authUser) {
            setShowAccountPanel(true);
            return;
          }
          setShowAlertInbox(true);
          void refreshAlertInbox();
        }}
        onOverview={() => setShowInstrumentOverview(true)}
        onExport={() => {
          setExportMessage(null);
          setExportError(null);
          setShowExportPanel(true);
        }}
        onCorrelation={() => {
          if (
            requireFeature(
              "correlationMatrix",
              "Correlation Matrix",
            )
          ) {
            setShowCorrelation(true);
          }
        }}
        onEvents={openEvents}
        onCompanyFeed={openCompanyFeed}
        onStrategy={() => {
          if (
            requireFeature(
              "strategyTester",
              "Strategy Tester",
            )
          ) {
            setShowStrategyTester(true);
          }
        }}
        onSystem={openSystemPanel}
        accountSlot={
          <button
            className={authUser ? "commercial-account-button signed-in" : "commercial-account-button"}
            onClick={() => {
              setShowAccountPanel(true);
              setCloudError(null);
              setCloudMessage(null);
              if (authUser) {
                void refreshCloudState();
                void refreshPushState();
                void refreshEntitlement();
              }
            }}
            title={authUser ? "الحساب والمزامنة" : "تسجيل الدخول"}
          >
            <span className="commercial-account-avatar">
              {(authUser?.userDetails || "M").slice(0, 1).toUpperCase()}
            </span>
            <span>
              {authUser
                ? entitlement.definition.name
                : "دخول"}
            </span>
          </button>
        }
        workspaceSlot={
          <div className="workspace-menu-wrap commercial-workspace-wrap">
            <button
              className="commercial-workspace-button"
              onClick={() => setShowWorkspaceMenu((value) => !value)}
            >
              <span>التخطيطات</span>
              {savedWorkspaces.length > 0 ? <b>{savedWorkspaces.length}</b> : null}
            </button>

            {showWorkspaceMenu ? (
              <div className="workspace-popover commercial-workspace-popover" dir="rtl">
                <button className="save-workspace-button" onClick={saveCurrentWorkspace}>
                  + حفظ التخطيط الحالي
                </button>
                <div className="workspace-list">
                  {savedWorkspaces.map((workspace) => (
                    <div className="workspace-row" key={workspace.id}>
                      <button className="workspace-open" onClick={() => restoreWorkspace(workspace)}>
                        <strong>{workspace.name}</strong>
                        <small>
                          {workspace.symbol.ticker} · {workspace.timeframe.toUpperCase()} · {
                            workspace.layoutMode === "quad"
                              ? "4×"
                              : workspace.layoutMode === "split"
                                ? "2×"
                                : "1×"
                          }
                        </small>
                      </button>
                      <button
                        className="workspace-delete"
                        onClick={() => deleteWorkspace(workspace.id)}
                        title="حذف"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {savedWorkspaces.length === 0 ? (
                    <div className="workspace-empty">ما عندك تخطيطات محفوظة إلى الآن</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        }
      />

      <ReplaySetupPanel
        open={showReplaySetup}
        ticker={active.ticker}
        timeframe={timeframe}
        candles={candles}
        onClose={() => setShowReplaySetup(false)}
        onStart={beginReplayAt}
      />

      <HomeDashboard
        open={showHomeDashboard}
        autoOpenEnabled={homeAutoOpen}
        activeSymbol={active}
        overview={watchlistOverview}
        overviewLoading={watchlistLoading}
        overviewProvider={watchlistProvider}
        overviewUpdatedAt={watchlistUpdatedAt}
        events={marketEvents}
        eventsLoading={eventsLoading}
        alertEvents={alertInboxEvents}
        signedIn={Boolean(authUser)}
        workspaces={savedWorkspaces}
        planName={entitlement.definition.name}
        sessionLabel={sessionLabel}
        onClose={() => setShowHomeDashboard(false)}
        onToggleAutoOpen={(enabled) => {
          setHomeAutoOpen(enabled);
          saveSetting("marketos:home-auto", enabled ? "on" : "off");
        }}
        onSelectSymbol={chooseSymbol}
        onOpenMarket={() => {
          setShowHomeDashboard(false);
          openScreener();
        }}
        onOpenAlerts={() => {
          setShowHomeDashboard(false);
          setShowAlertMenu(true);
        }}
        onOpenInbox={() => {
          setShowHomeDashboard(false);
          if (!authUser) {
            setShowAccountPanel(true);
            return;
          }
          setShowAlertInbox(true);
          void refreshAlertInbox();
        }}
        onOpenEvents={() => {
          setShowHomeDashboard(false);
          openEvents();
        }}
        onRestoreWorkspace={restoreWorkspace}
        onOpenCommandPalette={() => {
          setShowHomeDashboard(false);
          setCommandQuery("");
          setCommandSymbolResults([]);
          setShowCommandPalette(true);
        }}
      />

      <CommandPalette
        open={showCommandPalette}
        items={commandPaletteItems}
        loading={commandSymbolLoading}
        onQueryChange={setCommandQuery}
        onClose={() => setShowCommandPalette(false)}
      />

      <AccountPanel
        open={showAccountPanel}
        user={authUser}
        checked={authChecked}
        cloud={cloudState}
        entitlement={entitlement}
        entitlementLoading={entitlementLoading}
        entitlementError={entitlementError}
        busy={cloudBusy}
        error={cloudError}
        message={cloudMessage}
        pushSupported={pushState.supported}
        pushConfigured={pushState.configured}
        pushPermission={pushState.permission}
        pushSubscribed={pushState.subscribed}
        pushBusy={pushBusy}
        pushError={pushError}
        onClose={() => setShowAccountPanel(false)}
        onRefresh={() => {
          void refreshCloudState();
          void refreshEntitlement();
        }}
        onUpload={() => void uploadCurrentDeviceToCloud()}
        onRestore={() => void restoreCloudToThisDevice()}
        onDeleteCloud={() => void removeCloudCopy()}
        onEnablePush={() => void enablePushOnThisDevice()}
        onDisablePush={() => void disablePushOnThisDevice()}
        onRefreshPush={() => void refreshPushState()}
        onShowPlans={() => {
          setPlanMessage(null);
          setShowPlansPanel(true);
        }}
      />

      <PlansPanel
        open={showPlansPanel}
        entitlement={entitlement}
        message={planMessage}
        onClose={() => {
          setShowPlansPanel(false);
          setPlanMessage(null);
        }}
      />

      <IndicatorLab
        open={showIndicatorLab}
        indicators={customIndicators}
        maxIndicators={planLimits.customIndicators}
        onChange={updateCustomIndicators}
        onClose={() => setShowIndicatorLab(false)}
      />

      <StrategyTester
        open={showStrategyTester}
        candles={displayCandles}
        symbol={active}
        timeframe={timeframe}
        onClose={() => setShowStrategyTester(false)}
      />

      <CompanyFeedPanel
        open={showCompanyFeed}
        releases={companyReleases}
        provider={companyFeedProvider}
        loading={companyFeedLoading}
        error={companyFeedError}
        onRefresh={() => void refreshCompanyFeed()}
        onClose={() => setShowCompanyFeed(false)}
        onSelectSymbol={openCompanyFeedSymbol}
      />

      <InstrumentOverviewPanel
        open={showInstrumentOverview}
        symbol={active}
        timeframe={timeframe}
        candles={displayCandles}
        quote={replayActive ? null : quote}
        replayMode={replayActive}
        onClose={() => setShowInstrumentOverview(false)}
      />

      <ExportPanel
        open={showExportPanel}
        ticker={active.ticker}
        timeframe={timeframe}
        candleCount={displayCandles.length}
        canSnapshot={Boolean(snapshotCaptureRef.current)}
        message={exportMessage}
        error={exportError}
        onExportPng={() => {
          setExportMessage(null);
          setExportError(null);

          const canvas = snapshotCaptureRef.current?.();
          if (!canvas) {
            setExportError("الشارت غير جاهز لالتقاط الصورة الآن.");
            return;
          }

          canvas.toBlob((blob) => {
            if (!blob) {
              setExportError("تعذر إنشاء صورة الشارت.");
              return;
            }

            downloadBrowserBlob(
              blob,
              exportFilename(active.ticker, timeframe, "png"),
            );
            setExportMessage("تم تجهيز صورة PNG للشارت.");
          }, "image/png");
        }}
        onExportCsv={() => {
          setExportMessage(null);
          setExportError(null);

          if (displayCandles.length === 0) {
            setExportError("لا توجد شموع ظاهرة للتصدير.");
            return;
          }

          downloadBrowserBlob(
            new Blob(
              [candlesToCsv(displayCandles)],
              { type: "text/csv;charset=utf-8" },
            ),
            exportFilename(active.ticker, timeframe, "csv"),
          );
          setExportMessage(
            `تم تصدير ${displayCandles.length} شمعة إلى CSV.`,
          );
        }}
        onCopyLink={() => {
          setExportMessage(null);
          setExportError(null);

          const shareUrl = buildMarketShareUrl(
            window.location.href,
            {
              symbol: active,
              timeframe,
              chartView,
            },
          );

          void copyTextToClipboard(shareUrl)
            .then(() => {
              setExportMessage("تم نسخ رابط الشارت.");
            })
            .catch(() => {
              setExportError("تعذر نسخ الرابط من هذا المتصفح.");
            });
        }}
        onClose={() => setShowExportPanel(false)}
      />

      <ObjectTreePanel
        open={showObjectTree}
        symbol={objectTreeSymbol}
        paneId={objectTreePane}
        paneOptions={objectTreePaneOptions}
        indicators={objectTreeVisual.indicators}
        customIndicators={customIndicators}
        drawings={
          objectTreePane === "primary"
            ? drawings
            : []
        }
        comparisonSymbol={
          objectTreePane === "primary"
            ? comparisonSymbol
            : null
        }
        onPaneChange={setObjectTreePane}
        onClose={() => setShowObjectTree(false)}
        onToggleIndicator={toggleObjectTreeIndicator}
        onToggleCustom={toggleCustomIndicator}
        onToggleDrawingHidden={toggleDrawingHidden}
        onToggleDrawingLocked={toggleDrawingLocked}
        onDeleteDrawing={deleteDrawing}
        onEditDrawing={(drawing) => {
          setShowObjectTree(false);
          editTextDrawing(drawing);
        }}
        onCreateDrawingAlert={createAlertFromHorizontalDrawing}
        onRemoveComparison={clearComparison}
      />

      <ChartTemplatesPanel
        open={showChartTemplates}
        templates={chartTemplates}
        limit={planLimits.chartTemplates}
        currentChartView={chartView}
        currentIndicatorCount={activeIndicatorItems.length}
        currentCustomCount={activeCustomIndicators.length}
        message={chartTemplateMessage}
        onClose={() => {
          setShowChartTemplates(false);
          setChartTemplateMessage(null);
        }}
        onSaveCurrent={saveCurrentChartTemplate}
        onApply={applyChartTemplate}
        onDelete={deleteChartTemplate}
      />

      <ChartSettingsPanel
        open={showChartSettings}
        settings={chartSettings}
        onChange={updateChartSettings}
        onResetSettings={restoreChartSettings}
        onResetView={resetChartView}
        onClose={() => setShowChartSettings(false)}
      />

      <CorrelationPanel
        open={showCorrelation}
        watchlist={watchlist}
        activeSymbol={active}
        onSelectSymbol={chooseSymbol}
        onClose={() => setShowCorrelation(false)}
      />

      <AdvancedAlertsPanel
        open={showAlertMenu}
        symbol={active}
        currentTimeframe={timeframe}
        currentPrice={displayedPrice}
        alerts={alerts}
        checking={alertsChecking}
        serverChecking={serverAlertsChecking}
        cloudAvailable={Boolean(authUser)}
        checkMessage={alertCheckMessage}
        onCreate={addAdvancedAlert}
        onDelete={deleteAlert}
        onRearm={rearmAdvancedAlert}
        onToggleEnabled={toggleAdvancedAlert}
        onCheckAll={() => void checkAllAdvancedAlerts()}
        onServerCheck={() => void checkServerAdvancedAlerts()}
        onClose={() => setShowAlertMenu(false)}
      />

      <AlertInboxPanel
        open={showAlertInbox}
        events={alertInboxEvents}
        loading={alertInboxLoading}
        error={alertInboxError}
        onClose={() => setShowAlertInbox(false)}
        onRefresh={() => void refreshAlertInbox()}
        onMarkRead={(id) => void mutateAlertInbox("mark-read", [id])}
        onMarkAllRead={() => void mutateAlertInbox("mark-all-read")}
        onClearRead={() => void mutateAlertInbox("clear-read")}
        onSelectSymbol={(symbol) => {
          chooseSymbol(symbol);
          setShowAlertInbox(false);
        }}
      />

      <SystemPanel
        open={showSystemPanel}
        health={systemHealth}
        loading={systemHealthLoading}
        error={systemHealthError}
        onRefresh={() => void refreshSystemHealth()}
        onClose={() => setShowSystemPanel(false)}
      />

      {showEvents ? (
        <MarketEventsPanel
          events={marketEvents}
          provider={eventsProvider}
          rangeDays={eventsRangeDays}
          loading={eventsLoading}
          error={eventsError}
          onRangeChange={changeEventsRange}
          onRefresh={() => void refreshEvents(eventsRangeDays)}
          onClose={() => setShowEvents(false)}
          onSelectSymbol={openEventSymbol}
        />
      ) : null}

      {showScreener ? (
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Market Screener">
          <button
            className="scanner-backdrop"
            aria-label="إغلاق"
            onClick={() => setShowScreener(false)}
          />
          <section className="scanner-panel" dir="rtl">
            <header className="scanner-header">
              <div>
                <span className="scanner-eyebrow">MARKETOS SCREENER</span>
                <h2>خريطة السوق</h2>
                <p>لقطة مجمعة من قائمة متابعتك · المصدر: {overviewProvider}</p>
              </div>
              <div className="scanner-header-actions">
                <button onClick={() => void refreshScreener()} disabled={overviewLoading}>
                  {overviewLoading ? "تحديث…" : "تحديث"}
                </button>
                <button className="scanner-close" onClick={() => setShowScreener(false)}>×</button>
              </div>
            </header>

            <div className="smart-screener-box">
              <div className="smart-screener-head">
                <div>
                  <span className="smart-screener-eyebrow">SMART SCREENER</span>
                  <strong>اسأل السوق</strong>
                </div>
                {smartScreenerActive ? (
                  <button className="smart-screener-clear" onClick={clearSmartQuery}>
                    مسح
                  </button>
                ) : null}
              </div>

              <div className="smart-screener-input-row">
                <input
                  value={smartScreenerQuery}
                  onChange={(event) => setSmartScreenerQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySmartQuery();
                  }}
                  placeholder="مثال: الأسهم الصاعدة أكثر من 2% والحجم فوق 1M"
                />
                <button onClick={applySmartQuery} disabled={!smartScreenerQuery.trim()}>
                  تطبيق
                </button>
              </div>

              <div className="smart-screener-examples">
                {[
                  "الأسهم الصاعدة أكثر من 2%",
                  "crypto down below -3%",
                  "الحجم فوق 1M أعلى 5",
                  "السعر تحت 100 والحجم فوق 500K",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setSmartScreenerQuery(example);
                      setAppliedSmartScreenerQuery(example);
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>

              {appliedSmartScreenerQuery.trim() ? (
                <div className={smartScreenerActive ? "smart-screener-summary active" : "smart-screener-summary"}>
                  <span>
                    {smartScreenerActive
                      ? smartScreenerParsed.summary
                      : "ما تعرفت على فلتر واضح. جرّب نسبة تغير أو سعر أو حجم أو نوع سوق."}
                  </span>
                  <b>{filteredOverview.length} نتيجة</b>
                </div>
              ) : null}
            </div>

            <div className="scanner-controls">
              <div className="scanner-filter-row">
                {([
                  ["all", "الكل"],
                  ["equities", "الأسهم"],
                  ["forex", "فوركس"],
                  ["crypto", "كريبتو"],
                  ["futures", "عقود وسلع"],
                ] as Array<[ScreenerFilter, string]>).map(([id, label]) => (
                  <button
                    className={screenerFilter === id ? "selected" : ""}
                    key={id}
                    onClick={() => setScreenerFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="scanner-mode-toggle">
                <button
                  className={screenerMode === "heatmap" ? "selected" : ""}
                  onClick={() => setScreenerMode("heatmap")}
                >
                  Heatmap
                </button>
                <button
                  className={screenerMode === "table" ? "selected" : ""}
                  onClick={() => setScreenerMode("table")}
                >
                  جدول
                </button>
              </div>
            </div>

            <div className="scanner-breadth">
              <div>
                <span>المتابعة</span>
                <strong>{filteredOverview.length}</strong>
              </div>
              <div>
                <span>صاعد</span>
                <strong className="positive">{screenerAdvancers}</strong>
              </div>
              <div>
                <span>هابط</span>
                <strong className="negative">{screenerDecliners}</strong>
              </div>
              <div>
                <span>متوسط الحركة</span>
                <strong className={screenerAverageMove >= 0 ? "positive" : "negative"}>
                  {formatPercent(screenerAverageMove)}
                </strong>
              </div>
            </div>

            {overviewError ? <div className="scanner-warning">{overviewError}</div> : null}

            <div className="scanner-content">
              {overviewLoading && overview.length === 0 ? (
                <div className="scanner-loading">جاري قراءة السوق…</div>
              ) : screenerMode === "heatmap" ? (
                <div className="heatmap-grid">
                  {sortedOverview.map((item) => {
                    const movement = item.quote.percentChange ?? 0;
                    const intensity =
                      Math.abs(movement) >= 3
                        ? "strong"
                        : Math.abs(movement) >= 1
                          ? "medium"
                          : "soft";
                    const direction = movement > 0 ? "gain" : movement < 0 ? "loss" : "flat";

                    return (
                      <button
                        className={`heatmap-tile ${direction} ${intensity}`}
                        key={item.symbol.id}
                        onClick={() => {
                          chooseSymbol(item.symbol);
                          setShowScreener(false);
                        }}
                      >
                        <span className="heatmap-symbol">{item.symbol.ticker}</span>
                        <span className="heatmap-price">{formatPrice(item.quote.price)}</span>
                        <strong>{formatPercent(movement)}</strong>
                        <small>{item.symbol.exchange}</small>
                      </button>
                    );
                  })}
                  {sortedOverview.length === 0 ? (
                    <div className="scanner-empty">لا توجد رموز لهذا الفلتر.</div>
                  ) : null}
                </div>
              ) : (
                <div className="scanner-table-wrap">
                  <table className="scanner-table">
                    <thead>
                      <tr>
                        <th>الرمز</th>
                        <th>السوق</th>
                        <th>السعر</th>
                        <th>التغير</th>
                        <th>الحجم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOverview.map((item) => {
                        const movement = item.quote.percentChange ?? 0;
                        return (
                          <tr
                            key={item.symbol.id}
                            onClick={() => {
                              chooseSymbol(item.symbol);
                              setShowScreener(false);
                            }}
                          >
                            <td>
                              <strong>{item.symbol.ticker}</strong>
                              <small>{item.symbol.name}</small>
                            </td>
                            <td>{item.symbol.exchange}</td>
                            <td dir="ltr">{formatPrice(item.quote.price)}</td>
                            <td className={movement >= 0 ? "positive" : "negative"} dir="ltr">
                              {formatPercent(movement)}
                            </td>
                            <td dir="ltr">{formatVolume(item.quote.volume)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {alertMessage ? <div className="alert-toast">{alertMessage}</div> : null}

      <section className="commercial-market-ribbon" dir="ltr">
        <span className="commercial-ribbon-session">
          <i className={`commercial-session-dot ${sessionState}`} />
          {sessionLabel}
        </span>
        <span className="commercial-ribbon-symbol">
          <b>{active.ticker}</b>
          <em>{formatPrice(displayedPrice)}</em>
          <strong className={(displayedPercent ?? 0) >= 0 ? "positive" : "negative"}>
            {formatPercent(displayedPercent)}
          </strong>
        </span>
        <span>{active.exchange}</span>
        <span>
          {activeWatchlist?.name ?? "Watchlist"} <b>{watchlist.length}</b>
        </span>
        <span>Alerts <b>{activeAlerts.length}</b></span>
        <span>{replayActive ? "Replay mode" : autoRefreshEnabled ? "Auto refresh" : "Manual refresh"}</span>
      </section>

      <section className={[
        "workspace",
        "commercial-workspace",
        watchlistOpen ? "" : "watchlist-hidden",
        aiPanelOpen ? "" : "ai-hidden",
      ].filter(Boolean).join(" ")}>
        <CommercialWatchlistPanel
          open={watchlistOpen}
          title={query.trim() ? "نتائج البحث" : activeWatchlist?.name ?? "قائمة المتابعة"}
          query={query}
          searchLoading={searchLoading}
          searchInputRef={searchInputRef}
          filter={watchlistFilter}
          sort={watchlistSort}
          collections={watchlistCollections}
          activeCollectionId={activeWatchlistId}
          collectionLimit={planLimits.watchlists}
          totalItemCount={totalWatchlistItemCount}
          totalItemLimit={planLimits.watchlistItems}
          visibleSymbols={visibleSymbols}
          activeId={active.id}
          activeQuote={quote ?? undefined}
          quoteMap={watchlistQuoteMap}
          alertCounts={watchlistAlertCounts}
          loading={watchlistLoading}
          replayActive={replayActive}
          provider={watchlistProvider}
          updatedAt={watchlistUpdatedAt}
          error={watchlistError}
          onClose={toggleWatchlistPanel}
          onRefresh={() => void refreshWatchlistOverview(true)}
          onSearchChange={setQuery}
          onFilterChange={(value) => {
            setWatchlistFilter(value);
            saveSetting("marketos:watchlist-filter", value);
          }}
          onSortChange={(value) => {
            setWatchlistSort(value);
            saveSetting("marketos:watchlist-sort", value);
          }}
          onCollectionChange={selectWatchlistCollection}
          onCreateCollection={createWatchlist}
          onRenameCollection={renameWatchlist}
          onDeleteCollection={deleteWatchlist}
          onSelect={chooseSymbol}
          formatPrice={formatPrice}
          formatPercent={formatPercent}
        />

        <section className="chart-area panel">
          <div className="instrument-bar">
            <div className="instrument-id">
              <button
                className={isActiveWatchlisted ? "watch-star active" : "watch-star"}
                onClick={toggleActiveWatchlist}
                title={isActiveWatchlisted ? "إزالة من قائمة المتابعة" : "إضافة إلى قائمة المتابعة"}
              >
                {isActiveWatchlisted ? "★" : "☆"}
              </button>
              <div className="instrument-icon">{active.ticker.slice(0, 1)}</div>
              <div>
                <strong>{active.name}</strong>
                <span>{active.exchange}:{active.ticker}{active.currency ? ` · ${active.currency}` : ""}</span>
              </div>
            </div>

            <div className="quote-cluster">
              <div className="instrument-live-controls">
                <span className={`session-pill ${sessionState}`}>{sessionLabel}</span>
                <button
                  className="quote-refresh"
                  onClick={() => void refreshQuote(true)}
                  disabled={replayActive || quoteRefreshing}
                  title="تحديث السعر الآن"
                >
                  {quoteRefreshing ? "…" : "↻"}
                </button>
                <button
                  className={autoRefreshEnabled ? "auto-refresh-toggle active" : "auto-refresh-toggle"}
                  onClick={toggleAutoRefresh}
                  disabled={replayActive}
                  title="تحديث تلقائي كل 30 ثانية تقريبًا أثناء فتح الصفحة"
                >
                  Auto
                </button>
              </div>
              <div className="quote">
                <strong>{formatPrice(displayedPrice)}</strong>
                <span className={(displayedPercent ?? 0) >= 0 ? "positive" : "negative"}>
                  {formatPercent(displayedPercent)}
                </span>
                <small>{replayActive ? "REPLAY" : quote?.source ?? "fallback"} · {timeframe.toUpperCase()}</small>
                <small>آخر بيانات: {replayActive ? replayDateLabel ?? "—" : quoteTimeLabel}</small>
              </div>
            </div>
          </div>

          <div className="chart-toolbar">
            <div className="timeframes">
              {timeframes.map((tf) => (
                <button
                  className={tf === timeframe ? "selected" : ""}
                  key={tf}
                  onClick={() => chooseTimeframe(tf)}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="chart-tools">
              <button className={chartView === "candles" ? "selected" : ""} onClick={() => chooseChartView("candles")}>شموع</button>
              <button className={chartView === "line" ? "selected" : ""} onClick={() => chooseChartView("line")}>خط</button>
              <button className={chartView === "area" ? "selected" : ""} onClick={() => chooseChartView("area")}>مساحة</button>

              <button
                className="chart-settings-launch"
                onClick={() => setShowChartSettings(true)}
                title="إعدادات عرض الشارت"
              >
                ⚙ إعدادات
              </button>

              <button
                className="chart-templates-launch"
                onClick={() => {
                  setChartTemplateMessage(null);
                  setShowChartTemplates(true);
                }}
                title="حفظ أو تطبيق قالب شارت"
              >
                ◫ قوالب
              </button>

              <button
                className="object-tree-launch"
                onClick={() => {
                  setObjectTreePane("primary");
                  setShowObjectTree(true);
                }}
                title="إدارة عناصر الشارت والـPanes"
              >
                ☷ العناصر
              </button>

              <div className="compare-menu-wrap">
                <button
                  className={comparisonSymbol ? "selected comparison-button" : "comparison-button"}
                  onClick={() => setShowComparisonMenu((value) => !value)}
                >
                  {comparisonSymbol ? `مقارنة: ${comparisonSymbol.ticker}` : "مقارنة"}
                </button>
                {comparisonSymbol ? (
                  <button className="comparison-clear" onClick={clearComparison}>×</button>
                ) : null}

                {showComparisonMenu ? (
                  <div className="compare-popover" dir="rtl">
                    <div className="indicator-popover-title">قارن مع</div>
                    {watchlist
                      .filter((symbol) => symbol.id !== active.id)
                      .slice(0, 12)
                      .map((symbol) => (
                        <button className="indicator-row" key={symbol.id} onClick={() => chooseComparison(symbol)}>
                          <span>
                            <strong>{symbol.ticker}</strong>
                            <small>{symbol.name}</small>
                          </span>
                          <b>+</b>
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>

              <div className="drawing-menu-wrap">
                <button
                  className={drawings.length > 0 ? "selected" : ""}
                  onClick={() => setShowDrawingMenu((value) => !value)}
                >
                  الرسومات {drawings.length > 0 ? `(${drawings.length})` : ""}
                </button>
                {showDrawingMenu ? (
                  <div className="drawing-popover" dir="rtl">
                    <div className="indicator-popover-title">إدارة الرسومات</div>
                    {drawings.map((drawing) => (
                      <div
                        className={[
                          "drawing-row",
                          drawing.hidden ? "hidden" : "",
                          drawing.locked ? "locked" : "",
                        ].filter(Boolean).join(" ")}
                        key={drawing.id}
                      >
                        <span className="drawing-row-info">
                          <strong>
                            {drawingName(drawing)}
                            {drawing.locked ? " · مقفل" : ""}
                          </strong>
                          <small>{drawingDetail(drawing)}</small>
                        </span>
                        <div className="drawing-row-actions">
                          <button
                            onClick={() => toggleDrawingHidden(drawing.id)}
                            title={drawing.hidden ? "إظهار" : "إخفاء"}
                          >
                            {drawing.hidden ? "○" : "◉"}
                          </button>
                          <button
                            onClick={() => toggleDrawingLocked(drawing.id)}
                            title={drawing.locked ? "فتح القفل" : "قفل"}
                          >
                            {drawing.locked ? "🔒" : "🔓"}
                          </button>
                          {drawing.type === "text" ? (
                            <button
                              onClick={() => editTextDrawing(drawing)}
                              disabled={drawing.locked}
                              title="تعديل النص"
                            >
                              ✎
                            </button>
                          ) : null}
                          <button
                            onClick={() => deleteDrawing(drawing.id)}
                            disabled={drawing.locked}
                            title={drawing.locked ? "افتح القفل أولًا" : "حذف"}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {drawings.length === 0 ? <div className="workspace-empty">لا توجد رسومات</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="indicator-menu-wrap">
                <button
                  className={
                    activeIndicatorItems.length + activeCustomIndicators.length > 0
                      ? "selected"
                      : ""
                  }
                  onClick={() => setShowIndicatorMenu((value) => !value)}
                >
                  المؤشرات {
                    activeIndicatorItems.length + activeCustomIndicators.length > 0
                      ? `(${activeIndicatorItems.length + activeCustomIndicators.length})`
                      : ""
                  }
                </button>

                {showIndicatorMenu ? (
                  <div className="indicator-popover" dir="rtl">
                    <div className="indicator-popover-title">المؤشرات</div>
                    {indicatorCatalog.map((item) => (
                      <button
                        key={item.id}
                        className={indicators[item.id] ? "indicator-row enabled" : "indicator-row"}
                        onClick={() => toggleIndicator(item.id)}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.description}</small>
                        </span>
                        <b>{indicators[item.id] ? "✓" : "+"}</b>
                      </button>
                    ))}

                    {customIndicators.length > 0 ? (
                      <>
                        <div className="indicator-popover-title custom-title">مخصص</div>
                        {customIndicators.slice(0, 8).map((indicator) => (
                          <button
                            key={indicator.id}
                            className={indicator.enabled ? "indicator-row enabled" : "indicator-row"}
                            onClick={() => toggleCustomIndicator(indicator.id)}
                          >
                            <span>
                              <strong>{indicator.name}</strong>
                              <small dir="ltr">{indicator.formula}</small>
                            </span>
                            <b>{indicator.enabled ? "✓" : "+"}</b>
                          </button>
                        ))}
                      </>
                    ) : null}

                    <button
                      className="indicator-lab-launch"
                      onClick={() => {
                        setShowIndicatorMenu(false);

                        if (
                          requireFeature(
                            "customIndicatorLab",
                            "معمل المؤشرات",
                          )
                        ) {
                          setShowIndicatorLab(true);
                        }
                      }}
                    >
                      <span>⚗ معمل المؤشرات</span>
                      <b>→</b>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={replayActive ? "replay-toolbar active" : "replay-toolbar"}>
            <div className="replay-main-actions">
              <button
                className={replayActive ? "replay-toggle active" : "replay-toggle"}
                onClick={replayActive ? exitReplay : startReplay}
              >
                {replayActive ? "خروج Replay" : "Replay"}
              </button>

              <div className="layout-toggle" title="تخطيط الشارت">
                <button
                  className={layoutMode === "single" ? "selected" : ""}
                  onClick={() => chooseLayoutMode("single")}
                >
                  1×
                </button>
                <button
                  className={layoutMode === "split" ? "selected" : ""}
                  onClick={() => chooseLayoutMode("split")}
                  title="شارتان جنبًا إلى جنب"
                >
                  2×
                </button>
                <button
                  className={layoutMode === "quad" ? "selected" : ""}
                  onClick={() => chooseLayoutMode("quad")}
                  aria-disabled={
                    !canUseFeature(
                      entitlement,
                      "quadChart",
                    )
                  }
                  title={
                    canUseFeature(
                      entitlement,
                      "quadChart",
                    )
                      ? "أربعة شارتات مستقلة"
                      : "يتطلب MarketOS Pro"
                  }
                >
                  4×
                  {!canUseFeature(
                    entitlement,
                    "quadChart",
                  ) ? " 🔒" : ""}
                </button>
              </div>

              <PaneLinkControls
                disabled={layoutMode === "single"}
                rangeCompatible={chartSyncCompatible}
                settings={paneLinkSettings}
                onChange={updatePaneLinkSettings}
              />
            </div>

            {replayActive ? (
              <div className="replay-v2-shell">
                <div className="replay-controls" dir="ltr">
                  <button
                    onClick={resetReplayToStart}
                    disabled={
                      replayStartIndex === null ||
                      safeReplayIndex <= replayStartIndex
                    }
                    title="العودة لبداية الجلسة"
                  >
                    ↺
                  </button>
                  <button
                    onClick={() => stepReplay(-20)}
                    disabled={
                      safeReplayIndex <= (replayStartIndex ?? 20)
                    }
                    title="رجوع 20 شمعة"
                  >
                    -20
                  </button>
                  <button
                    onClick={() => stepReplay(-5)}
                    disabled={
                      safeReplayIndex <= (replayStartIndex ?? 20)
                    }
                    title="رجوع 5 شمعات"
                  >
                    -5
                  </button>
                  <button
                    onClick={() => stepReplay(-1)}
                    disabled={
                      safeReplayIndex <= (replayStartIndex ?? 20)
                    }
                    title="شمعة للخلف"
                  >
                    ‹
                  </button>
                  <button
                    className={replayPlaying ? "selected" : ""}
                    onClick={() => setReplayPlaying((value) => !value)}
                  >
                    {replayPlaying ? "Ⅱ" : "▶"}
                  </button>
                  <button
                    onClick={() => stepReplay(1)}
                    disabled={safeReplayIndex >= candles.length - 1}
                    title="شمعة للأمام"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => stepReplay(5)}
                    disabled={safeReplayIndex >= candles.length - 1}
                    title="تقدم 5 شمعات"
                  >
                    +5
                  </button>
                  <button
                    onClick={() => stepReplay(20)}
                    disabled={safeReplayIndex >= candles.length - 1}
                    title="تقدم 20 شمعة"
                  >
                    +20
                  </button>

                  <div className="replay-speed-group">
                    {replaySpeeds.map((speed) => (
                      <button
                        key={speed}
                        className={
                          replaySpeed === speed
                            ? "selected"
                            : ""
                        }
                        onClick={() => changeReplaySpeed(speed)}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>

                  <input
                    type="range"
                    min={replayStartIndex ?? 20}
                    max={Math.max(20, candles.length - 1)}
                    value={Math.max(
                      replayStartIndex ?? 20,
                      safeReplayIndex,
                    )}
                    onChange={(event) => {
                      setReplayPlaying(false);
                      setReplayIndex(Number(event.target.value));
                      setHoverCandle(null);
                    }}
                  />
                  <span className="replay-progress">
                    {Math.min(candles.length, safeReplayIndex + 1)} / {candles.length}
                  </span>
                  <span className="replay-date">{replayDateLabel}</span>
                </div>

                {replayStats ? (
                  <div className="replay-session-stats" dir="ltr">
                    <span>
                      Move
                      <b className={replayStats.movePercent >= 0 ? "positive" : "negative"}>
                        {formatPercent(replayStats.movePercent)}
                      </b>
                    </span>
                    <span>
                      Range
                      <b>{formatPercent(replayStats.rangePercent)}</b>
                    </span>
                    <span>
                      High
                      <b>{formatPrice(replayStats.sessionHigh)}</b>
                    </span>
                    <span>
                      Low
                      <b>{formatPrice(replayStats.sessionLow)}</b>
                    </span>
                    <span>
                      Left
                      <b>{replayStats.remainingBars}</b>
                    </span>
                    <span>
                      Progress
                      <b>{replayStats.progressPercent.toFixed(0)}%</b>
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="replay-idle-note">إعادة تشغيل تاريخية من نفس بيانات الشارت</div>
            )}
          </div>

          <div className="chart-stage">
            <div className="drawing-rail">
              <button
                title="تراجع · Ctrl/Cmd+Z"
                onClick={undoDrawings}
                disabled={!canUndoDrawings(drawingHistory)}
              >
                <DrawingToolIcon name="undo" />
              </button>
              <button
                title="إعادة · Ctrl/Cmd+Shift+Z"
                onClick={redoDrawings}
                disabled={!canRedoDrawings(drawingHistory)}
              >
                <DrawingToolIcon name="redo" />
              </button>
              <span className="drawing-rail-separator" />
              <button
                className={drawingTool === "cursor" ? "selected" : ""}
                title="المؤشر والتحريك · V"
                onClick={() => setDrawingTool("cursor")}
              >
                <DrawingToolIcon name="cursor" />
              </button>
              <button
                className={drawingTool === "trend" ? "selected" : ""}
                title="خط الاتجاه · L"
                onClick={() => setDrawingTool("trend")}
              >
                <DrawingToolIcon name="trend" />
              </button>
              <button
                className={drawingTool === "horizontal" ? "selected" : ""}
                title="خط أفقي · H"
                onClick={() => setDrawingTool("horizontal")}
              >
                <DrawingToolIcon name="horizontal" />
              </button>
              <button
                className={drawingTool === "zone" ? "selected" : ""}
                title="منطقة سعر"
                onClick={() => setDrawingTool("zone")}
              >
                <DrawingToolIcon name="zone" />
              </button>
              <button
                className={drawingTool === "fibonacci" ? "selected" : ""}
                title="Fibonacci"
                onClick={() => setDrawingTool("fibonacci")}
              >
                <DrawingToolIcon name="fibonacci" />
              </button>
              <button
                className={drawingTool === "measure" ? "selected" : ""}
                title="قياس · M"
                onClick={() => setDrawingTool("measure")}
              >
                <DrawingToolIcon name="measure" />
              </button>
              <button
                className={drawingTool === "text" ? "selected" : ""}
                title="ملاحظة نصية · N"
                onClick={() => setDrawingTool("text")}
              >
                <DrawingToolIcon name="text" />
              </button>
              <span className="drawing-rail-separator" />
              <button
                title="مسح الرسومات غير المقفلة"
                onClick={clearDrawings}
                disabled={!drawings.some((drawing) => !drawing.locked)}
              >
                <DrawingToolIcon name="clear" />
              </button>
            </div>

            {layoutMode === "quad" && secondaryChartNode && thirdChartNode && fourthChartNode ? (
              <div className={[
                "multi-chart-grid",
                "quad-chart-grid",
                maximizedChartPane ? "pane-maximized" : "",
                maximizedChartPane ? `max-${maximizedChartPane}` : "",
              ].filter(Boolean).join(" ")}>
                <div className={maximizedChartPane && maximizedChartPane !== "primary" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {primaryChartNode}
                </div>
                <div className={maximizedChartPane && maximizedChartPane !== "secondary" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {secondaryChartNode}
                </div>
                <div className={maximizedChartPane && maximizedChartPane !== "third" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {thirdChartNode}
                </div>
                <div className={maximizedChartPane && maximizedChartPane !== "fourth" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {fourthChartNode}
                </div>
              </div>
            ) : layoutMode === "split" && secondaryChartNode ? (
              <div className={[
                "multi-chart-grid",
                maximizedChartPane ? "pane-maximized" : "",
                maximizedChartPane ? `max-${maximizedChartPane}` : "",
              ].filter(Boolean).join(" ")}>
                <div className={maximizedChartPane === "secondary" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {primaryChartNode}
                </div>
                <div className={maximizedChartPane === "primary" ? "multi-pane hidden-pane" : "multi-pane"}>
                  {secondaryChartNode}
                </div>
              </div>
            ) : primaryChartNode}
          </div>
        </section>

        <CommercialAiPanel
          open={aiPanelOpen}
          prompt={aiPrompt}
          aiLoading={aiLoading}
          multiTimeframeLoading={multiTimeframeLoading}
          multiTimeframeEnabled={
            canUseFeature(
              entitlement,
              "multiTimeframeAi",
            )
          }
          aiResult={aiResult}
          multiTimeframeResult={multiTimeframeResult}
          multiTimeframeError={multiTimeframeError}
          ticker={active.ticker}
          timeframe={timeframe}
          indicatorCount={activeIndicatorItems.length + activeCustomIndicators.length}
          drawingCount={drawings.length}
          comparisonTicker={comparisonSymbol?.ticker}
          alertCount={activeAlerts.length}
          candleCount={displayCandles.length}
          source={quote?.source ?? "fallback"}
          dataWindow={dataWindowSnapshot}
          dataError={dataError}
          previewMode={providerStatus?.mode === "demo"}
          providerMessage={providerStatus?.message}
          onClose={toggleAiPanel}
          onPromptChange={setAiPrompt}
          onRead={(prompt) => void runChartReading(prompt)}
          onMultiTimeframe={() => void runMultiTimeframeReading()}
          formatPrice={formatPrice}
          formatPercent={formatPercent}
          formatVolume={formatVolume}
        />
      </section>
    </main>
  );
}
