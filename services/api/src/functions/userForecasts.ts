import type { EvaluationPlan } from "../forecasts/evaluation.js";
import azureFunctions, { type HttpRequest, type HttpResponseInit } from "@azure/functions";
const { app, HttpRequest: AzureHttpRequest } = azureFunctions;
import { randomUUID } from "node:crypto";
import type { AnalystForecastResponse } from "@marketos/market-core";
import { getAuthenticatedUser } from "../auth/clientPrincipal.js";
import { entitlementStore, getResolvedUserEntitlement } from "../entitlements/index.js";
import { getForecastLedger, storageUnavailable } from "../forecasts/cosmosLedger.js";
import { assertSameRequest, createForecastRecord, forecastRecordId, ownerKey, publicForecastRecord, type ForecastLedger } from "../forecasts/ledger.js";
import { assertRealProvider, assertRequestOrigin, ProductionGateError, realDataRequired } from "../production/policy.js";
import { marketDataProvider } from "../providers/index.js";
import { json, preflight } from "../http/responses.js";
import { generateJournalForecast, sanitizeSymbol } from "./analystForecast.js";
import { getForecastQuotaStore } from "../usage/cosmosForecastQuota.js";
import { effectiveForecastDailyLimit, quotaExceeded, type ForecastQuotaDecision, type ForecastQuotaStore } from "../usage/forecastQuota.js";

// Dependencies are injectable for deterministic endpoint tests; production always uses Cosmos.
const defaultUserForecastDependencies = {
  ledger: getForecastLedger as () => ForecastLedger,
  generate: generateJournalForecast,
  provider: marketDataProvider,
  quota: getForecastQuotaStore as () => ForecastQuotaStore,
  entitlement: getResolvedUserEntitlement,
  entitlementMode: () => entitlementStore.mode,
};

export function createUserForecastsHandler(
  overrides: Partial<typeof defaultUserForecastDependencies> = {},
) {
  const deps = { ...defaultUserForecastDependencies, ...overrides };
  return async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return preflight();
    const user = getAuthenticatedUser(request);
    if (!user) return json(401, { ok: false, code: "AUTH_REQUIRED", error: "Sign in to use the server forecast journal." });
    try {
      assertRequestOrigin(request.headers.get("origin"));
      if (!realDataRequired()) throw new ProductionGateError("REAL_DATA_MODE_DISABLED", "Enable real-data mode before using the server forecast journal.");
      const store = deps.ledger();
      const owner = ownerKey(user);
      if (request.method === "GET") {
        const limitText = request.query.get("limit") ?? "20";
        const limit = Number(limitText);
        const cursor = request.query.get("cursor") ?? undefined;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 8192) {
          return json(400, { ok: false, code: "INVALID_PAGE", error: "Invalid journal page." });
        }
        const page = await store.list(owner, limit, cursor);
        return json(200, { ok: true, storage: "cosmos", records: page.records.map(publicForecastRecord), cursor: page.cursor });
      }
      if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return json(415, { ok: false, error: "JSON content is required." });
      }
      if (Number(request.headers.get("content-length")) > 16_384) return json(413, { ok: false, error: "Request is too large." });
      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > 16_384) return json(413, { ok: false, error: "Request is too large." });
      let body: { symbol?: unknown; requestId?: unknown };
      try {
        const raw: unknown = JSON.parse(text);
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !["symbol", "requestId"].includes(key))) throw new Error();
        body = raw;
      } catch { return json(400, { ok: false, code: "INVALID_REQUEST", error: "Send only a symbol and optional request ID, not a forecast or result." }); }
      let symbol;
      try {
        symbol = sanitizeSymbol(body.symbol);
        if (![symbol.id, symbol.ticker, symbol.name, symbol.exchange, symbol.currency].every(value => value.trim())) throw new Error();
      } catch { return json(400, { ok: false, code: "INVALID_SYMBOL", error: "A complete market symbol is required." }); }
      const requestId = body.requestId ?? randomUUID();
      if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
        return json(400, { ok: false, code: "INVALID_REQUEST_ID", error: "Invalid request ID." });
      }
      const id = forecastRecordId(owner, requestId);
      const previous = await store.find(owner, id);
      if (previous) {
        assertSameRequest(previous, owner, symbol);
        return json(200, { ok: true, forecast: previous.forecast, journal: publicForecastRecord(previous), replayed: true });
      }
      assertRealProvider(deps.provider);
      if (deps.entitlementMode() !== "cosmos") {
        throw new ProductionGateError("ENTITLEMENTS_NOT_PERSISTENT", "Persistent entitlements are required before real forecast generation is enabled.");
      }
      const entitlement = await deps.entitlement(user.userId);
      const quotaLimit = effectiveForecastDailyLimit(entitlement);
      let quota: ForecastQuotaDecision;
      try {
        quota = await deps.quota().consume(owner, quotaLimit);
      } catch (error) {
        if (error instanceof ProductionGateError) throw error;
        throw new ProductionGateError("FORECAST_QUOTA_UNAVAILABLE", "Forecast quota storage is unavailable. No provider request was started.");
      }
      if (!quota.allowed) {
        const exceeded = quotaExceeded(quota);
        return json(exceeded.status, {
          ok: false,
          code: exceeded.code,
          error: exceeded.message,
          usage: { used: quota.used, limit: quota.limit, remaining: quota.remaining, resetAt: quota.resetAt },
        });
      }
      const generated = await deps.generate(new AzureHttpRequest({ method: "POST", url: request.url,
        headers: { "content-type": "application/json", "x-ms-client-principal": request.headers.get("x-ms-client-principal") ?? "" },
        body: { string: JSON.stringify({ symbol }) } }));
      const payload = generated.jsonBody as { ok?: boolean; forecast?: AnalystForecastResponse; evaluationPlan?: EvaluationPlan } | undefined;
      if (generated.status !== 200 || !payload?.ok || !payload.forecast) {
        return json(502, { ok: false, code: "FORECAST_GENERATION_FAILED", error: "A real-data forecast could not be generated. Nothing was recorded." });
      }
      const record = createForecastRecord(owner, id, payload.forecast, Date.now(), payload.evaluationPlan);
      assertSameRequest(record, owner, symbol);
      const saved = await store.create(record);
      assertSameRequest(saved, owner, symbol);
      return json(200, {
        ok: true,
        forecast: saved.forecast,
        journal: publicForecastRecord(saved),
        replayed: saved.forecastHash !== record.forecastHash,
        usage: { used: quota.used, limit: quota.limit, remaining: quota.remaining, resetAt: quota.resetAt },
      });
    } catch (error) {
      const safe = error instanceof ProductionGateError ? error : storageUnavailable();
      return json(safe.status, { ok: false, code: safe.code, error: safe.message });
    }
  };
}

export const userForecasts = createUserForecastsHandler();
app.http("userForecasts", { methods: ["GET", "POST", "OPTIONS"], authLevel: "anonymous", route: "user/forecasts", handler: userForecasts });
