import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import {
  evaluateAdvancedAlerts,
  type AdvancedAlert,
} from "@marketos/alert-core";
import type {
  MarketSymbol,
  Timeframe,
} from "@marketos/market-core";
import { sanitizeAdvancedAlerts } from "../alerts/validation.js";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { json, preflight } from "../http/responses.js";
import { marketDataProvider } from "../providers/index.js";
import { userStateStore } from "../storage/index.js";

const MAX_GROUPS_PER_CHECK = 20;
const CANDLE_LIMIT = 80;

type AlertGroup = {
  key: string;
  symbol: MarketSymbol;
  timeframe: Timeframe;
};

function activeGroups(alerts: AdvancedAlert[]): AlertGroup[] {
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

    if (groups.size >= MAX_GROUPS_PER_CHECK) break;
  }

  return [...groups.values()];
}

export async function userAlertCheck(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  const user = getAuthenticatedUser(request);
  if (!user) {
    return json(401, {
      ok: false,
      error: "Authentication required.",
    });
  }

  try {
    const stored = await userStateStore.get(user.userId);
    if (!stored) {
      return json(200, {
        ok: true,
        storageMode: userStateStore.mode,
        checkedGroups: 0,
        triggered: [],
        failures: [],
        message: "No cloud state is stored for this user.",
      });
    }

    let alerts = sanitizeAdvancedAlerts(
      stored.payload.alerts,
      100,
    );

    const groups = activeGroups(alerts);
    const failures: Array<{
      symbol: string;
      timeframe: Timeframe;
      error: string;
    }> = [];
    const triggered: Array<{
      alertId: string;
      symbol: string;
      timeframe: Timeframe;
      snapshot: unknown;
      conditions: unknown;
      triggeredAt: number | undefined;
    }> = [];

    const now = Date.now();

    for (const group of groups) {
      try {
        const [candles, quote] = await Promise.all([
          marketDataProvider.getCandles(
            group.symbol,
            group.timeframe,
            CANDLE_LIMIT,
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

    if (groups.length > 0) {
      await userStateStore.put(user.userId, {
        ...stored.payload,
        alerts,
        updatedAt: Date.now(),
      });
    }

    return json(200, {
      ok: true,
      storageMode: userStateStore.mode,
      provider: marketDataProvider.id,
      checkedGroups: groups.length,
      totalAlerts: alerts.length,
      triggered,
      failures,
      capped:
        activeGroups(
          sanitizeAdvancedAlerts(stored.payload.alerts, 100),
        ).length >= MAX_GROUPS_PER_CHECK,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Server alert check failed.",
    });
  }
}

app.http("userAlertCheck", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "user/alerts/check",
  handler: userAlertCheck,
});
