import { randomUUID } from "node:crypto";
import { CosmosClient } from "@azure/cosmos";
import { CosmosForecastLedger } from "./cosmosLedger.js";
import type { ForecastRecord } from "./ledger.js";
import type { ForecastEvaluation } from "./evaluation.js";
import { forecastLedgerConfig } from "../production/policy.js";

export type SweepLease = { token: string; cursor?: string };
export interface ForecastEvaluationStore {
  claim(nowMs: number): Promise<SweepLease | null>;
  page(cursor?: string): Promise<{ records: ForecastRecord[]; cursor?: string }>;
  save(record: ForecastRecord, evaluation: ForecastEvaluation): Promise<ForecastRecord>;
  finish(lease: SweepLease, cursor: string | undefined, nowMs: number): Promise<void>;
}
const CONTROL = "__marketos_forecast_evaluator__";
const INTERVAL_MS = 15 * 60_000;
const LEASE_MS = 150_000;
type Control = {
  id: string; userId: string; kind: "forecast-evaluation-control-v1";
  token: string; leaseUntil: number; nextRunAt: number; cursor?: string; _etag?: string;
};
const code = (error: unknown) => error && typeof error === "object" && "code" in error ? Number(error.code) : undefined;
const match = (etag?: string) => {
  if (!etag) throw new Error("Missing Cosmos concurrency token");
  return { accessCondition: { type: "IfMatch", condition: etag } };
};

export class CosmosForecastEvaluationStore extends CosmosForecastLedger implements ForecastEvaluationStore {
  async claim(nowMs: number): Promise<SweepLease | null> {
    await this.ensureContainer();
    let previous: Control | undefined;
    try { previous = (await this.container.item(CONTROL, CONTROL).read<Control>()).resource; }
    catch (error) { if (code(error) !== 404) throw error; }
    if (previous && (previous.kind !== "forecast-evaluation-control-v1" || previous.userId !== CONTROL)) throw new Error("Invalid evaluator checkpoint");
    if (previous && (previous.leaseUntil > nowMs || previous.nextRunAt > nowMs)) return null;
    const next: Control = { id: CONTROL, userId: CONTROL, kind: "forecast-evaluation-control-v1",
      token: randomUUID(), cursor: previous?.cursor, leaseUntil: nowMs + LEASE_MS, nextRunAt: nowMs };
    try {
      if (previous) await this.container.item(CONTROL, CONTROL).replace(next, match(previous._etag));
      else await this.container.items.create(next);
    } catch (error) { if ([409, 412].includes(code(error) ?? 0)) return null; throw error; }
    return { token: next.token, cursor: next.cursor };
  }

  async page(cursor?: string) {
    await this.ensureContainer();
    const page = await this.container.items.query<ForecastRecord>({
      query: "SELECT * FROM c WHERE c.kind = @kind AND IS_DEFINED(c.evaluationPlan) AND NOT IS_DEFINED(c.evaluation) ORDER BY c.recordedAt ASC",
      parameters: [{ name: "@kind", value: "marketos-forecast-v1" }],
    }, { maxItemCount: 3, continuationToken: cursor }).fetchNext();
    return { records: page.resources, cursor: page.continuationToken || undefined };
  }

  async save(record: ForecastRecord, evaluation: ForecastEvaluation): Promise<ForecastRecord> {
    await this.ensureContainer();
    const latest = await this.find(record.userId, record.id);
    if (!latest || latest.forecastHash !== record.forecastHash || latest.planHash !== record.planHash ||
        evaluation.forecastHash !== latest.forecastHash || evaluation.planHash !== latest.planHash) throw new Error("Forecast changed before evaluation save");
    if (latest.evaluation) return latest;
    // Only evaluation metadata is new. All original snapshot fields remain identical.
    const { _etag, ...next } = { id: latest.id, userId: latest.userId, kind: latest.kind,
      requestSymbolHash: latest.requestSymbolHash, recordedAt: latest.recordedAt, forecastHash: latest.forecastHash,
      forecast: latest.forecast, evaluationPlan: latest.evaluationPlan, planHash: latest.planHash,
      evaluation, _etag: latest._etag };
    try {
      await this.container.item(latest.id, latest.userId).replace(next, match(_etag));
      return next;
    } catch (error) {
      if (code(error) !== 412) throw error;
      const winner = await this.find(record.userId, record.id);
      if (winner?.forecastHash === record.forecastHash && winner?.planHash === record.planHash && winner.evaluation) return winner;
      throw error;
    }
  }

  async finish(lease: SweepLease, cursor: string | undefined, nowMs: number) {
    const { resource } = await this.container.item(CONTROL, CONTROL).read<Control>();
    // A stale invocation can never advance a newer invocation's checkpoint.
    if (!resource || resource.token !== lease.token) return;
    const next: Control = { id: CONTROL, userId: CONTROL, kind: "forecast-evaluation-control-v1",
      token: lease.token, cursor, leaseUntil: 0, nextRunAt: nowMs + INTERVAL_MS };
    try { await this.container.item(CONTROL, CONTROL).replace(next, match(resource._etag)); }
    catch (error) { if (code(error) !== 412) throw error; }
  }
}

let singleton: CosmosForecastEvaluationStore | undefined;
export function getForecastEvaluationStore(): ForecastEvaluationStore {
  const config = forecastLedgerConfig();
  if (!singleton) singleton = new CosmosForecastEvaluationStore(new CosmosClient(config.connectionString).database(config.databaseId).container(config.containerId));
  return singleton;
}
