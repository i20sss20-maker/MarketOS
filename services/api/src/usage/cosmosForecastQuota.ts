import { CosmosClient, type Container } from "@azure/cosmos";
import { forecastLedgerConfig, ProductionGateError } from "../production/policy.js";
import { utcUsageWindow, type ForecastQuotaDecision, type ForecastQuotaStore, type ForecastUsageRecord } from "./forecastQuota.js";

function statusCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

export class CosmosForecastQuotaStore implements ForecastQuotaStore {
  private ready: Promise<void> | null = null;
  constructor(private readonly container: Container) {}

  private ensureContainer() {
    if (!this.ready) {
      this.ready = this.container.read().then(({ resource }) => {
        const paths = resource?.partitionKey?.paths;
        if (!paths || paths.length !== 1 || paths[0] !== "/userId") {
          throw new ProductionGateError("INVALID_JOURNAL_PARTITION", "Forecast quota requires the /userId forecast journal container.");
        }
      }).catch(error => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  private async read(userId: string, id: string) {
    try {
      const response = await this.container.item(id, userId).read<ForecastUsageRecord>();
      const record = response.resource;
      if (!record) return null;
      if (record.userId !== userId || record.id !== id || record.kind !== "marketos-forecast-usage-v1" ||
          !Number.isInteger(record.count) || record.count < 0 || !Number.isInteger(record.limit) || record.limit < 1 ||
          typeof record.day !== "string" || !record._etag) {
        throw new ProductionGateError("INVALID_QUOTA_RECORD", "Stored forecast quota state is invalid.");
      }
      return record;
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }

  async consume(userId: string, limit: number, now = Date.now()): Promise<ForecastQuotaDecision> {
    await this.ensureContainer();
    if (!userId || !Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new ProductionGateError("INVALID_QUOTA_REQUEST", "Forecast quota request is invalid.");
    }
    const window = utcUsageWindow(now);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const current = await this.read(userId, window.id);
      if (!current) {
        const created: ForecastUsageRecord = {
          id: window.id,
          userId,
          kind: "marketos-forecast-usage-v1",
          day: window.day,
          count: 1,
          limit,
          updatedAt: now,
        };
        try {
          await this.container.items.create(created);
          return { allowed: true, day: window.day, used: 1, limit, remaining: Math.max(0, limit - 1), resetAt: window.resetAt };
        } catch (error) {
          if (statusCode(error) === 409) continue;
          throw error;
        }
      }

      if (current.day !== window.day) {
        throw new ProductionGateError("INVALID_QUOTA_RECORD", "Stored forecast quota day does not match its key.");
      }
      if (current.count >= limit) {
        return { allowed: false, day: window.day, used: current.count, limit, remaining: 0, resetAt: window.resetAt };
      }

      const { _etag, ...currentData } = current;
      const next: ForecastUsageRecord = {
        ...currentData,
        count: current.count + 1,
        limit,
        updatedAt: now,
      };
      try {
        await this.container.item(current.id, userId).replace(next, {
          accessCondition: { type: "IfMatch", condition: current._etag },
        });
        return {
          allowed: true,
          day: window.day,
          used: next.count,
          limit,
          remaining: Math.max(0, limit - next.count),
          resetAt: window.resetAt,
        };
      } catch (error) {
        if (statusCode(error) === 412) continue;
        throw error;
      }
    }

    throw new ProductionGateError("FORECAST_QUOTA_CONTENTION", "Forecast quota changed concurrently too many times. Retry shortly.", 503);
  }
}

let quotaStore: CosmosForecastQuotaStore | undefined;
export function getForecastQuotaStore(): ForecastQuotaStore {
  const config = forecastLedgerConfig();
  if (!quotaStore) {
    const client = new CosmosClient(config.connectionString);
    quotaStore = new CosmosForecastQuotaStore(client.database(config.databaseId).container(config.containerId));
  }
  return quotaStore;
}
