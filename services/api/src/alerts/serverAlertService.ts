import {
  evaluateAdvancedAlerts,
  type AdvancedAlert,
} from "@marketos/alert-core";
import type {
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";
import { sanitizeAdvancedAlerts } from "./validation.js";
import { marketDataProvider } from "../providers/index.js";
import type { StoredUserState } from "../storage/types.js";

export type ServerAlertTriggered = {
  alertId: string;
  symbol: string;
  timeframe: Timeframe;
  snapshot: unknown;
  conditions: unknown;
  triggeredAt: number | undefined;
};

export type ServerAlertFailure = {
  symbol: string;
  timeframe: Timeframe;
  error: string;
};

export type StoredAlertEvaluationResult = {
  alerts: AdvancedAlert[];
  checkedGroups: number;
  totalActiveGroups: number;
  capped: boolean;
  triggered: ServerAlertTriggered[];
  failures: ServerAlertFailure[];
};

type AlertGroup = {
  key: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
};

const DEFAULT_CANDLE_LIMIT = 80;

function collectActiveGroups(
  alerts: AdvancedAlert[],
): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();

  for (const alert of alerts) {
    if (!alert.enabled || alert.triggeredAt) continue;

    const key = `${alert.symbol.id}::${alert.timeframe}`;
    if (groups.has(key)) continue;

    groups.set(key, {
      key,
      symbol: alert.symbol,
      timeframe: alert.timeframe,
    });
  }

  return [...groups.values()];
}

export async function evaluateStoredUserAlerts(
  stored: StoredUserState,
  options?: {
    maxGroups?: number;
    candleLimit?: number;
    now?: number;
  },
): Promise<StoredAlertEvaluationResult> {
  let alerts = sanitizeAdvancedAlerts(
    stored.payload.alerts,
    100,
  );

  const allGroups = collectActiveGroups(alerts);
  const maxGroups = Math.min(
    50,
    Math.max(1, Math.floor(options?.maxGroups ?? 20)),
  );
  const candleLimit = Math.min(
    300,
    Math.max(40, Math.floor(options?.candleLimit ?? DEFAULT_CANDLE_LIMIT)),
  );
  const groups = allGroups.slice(0, maxGroups);
  const now = options?.now ?? Date.now();

  const failures: ServerAlertFailure[] = [];
  const triggered: ServerAlertTriggered[] = [];

  for (const group of groups) {
    try {
      const [candles, quote] = await Promise.all([
        marketDataProvider.getCandles(
          group.symbol,
          group.timeframe,
          candleLimit,
        ),
        marketDataProvider
          .getQuote(group.symbol)
          .catch(() => null),
      ]);

      const result = evaluateAdvancedAlerts(
        alerts,
        {
          symbol: group.symbol,
          timeframe: group.timeframe,
          candles,
          quote,
        },
        now,
      );

      alerts = result.alerts;

      for (const item of result.triggered) {
        triggered.push({
          alertId: item.alert.id,
          symbol: item.alert.symbol.ticker,
          timeframe: item.alert.timeframe,
          snapshot: item.evaluation.snapshot,
          conditions: item.evaluation.conditions,
          triggeredAt: item.alert.triggeredAt,
        });
      }
    } catch (error) {
      failures.push({
        symbol: group.symbol.ticker,
        timeframe: group.timeframe,
        error:
          error instanceof Error
            ? error.message
            : "Unknown alert evaluation error.",
      });
    }
  }

  return {
    alerts,
    checkedGroups: groups.length,
    totalActiveGroups: allGroups.length,
    capped: allGroups.length > groups.length,
    triggered,
    failures,
  };
}
