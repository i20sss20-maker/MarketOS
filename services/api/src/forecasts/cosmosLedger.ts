import { CosmosClient, type Container } from "@azure/cosmos";
import { forecastLedgerConfig, ProductionGateError } from "../production/policy.js";
import type { ForecastLedger, ForecastRecord } from "./ledger.js";

function code(error: unknown) {
  return error && typeof error === "object" && "code" in error ? Number(error.code) : undefined;
}

export class CosmosForecastLedger implements ForecastLedger {
  constructor(protected readonly container: Container) {}
  private ready: Promise<void> | null = null;
  protected ensureContainer() {
    if (!this.ready) this.ready = this.container.read().then(({ resource }) => {
      const paths = resource?.partitionKey?.paths;
      if (!paths || paths.length !== 1 || paths[0] !== "/userId") {
        throw new ProductionGateError("INVALID_JOURNAL_PARTITION", "The forecast journal must use its own /userId partitioned container.");
      }
    }).catch(error => { this.ready = null; throw error; });
    return this.ready;
  }

  async find(userId: string, id: string) {
    await this.ensureContainer();
    try {
      const { resource } = await this.container.item(id, userId).read<ForecastRecord>();
      if (!resource) return null;
      if (resource.userId !== userId || resource.kind !== "marketos-forecast-v1") throw new Error("Invalid journal record");
      return resource;
    } catch (error) {
      if (code(error) === 404) return null;
      throw error;
    }
  }

  async create(record: ForecastRecord) {
    await this.ensureContainer();
    try {
      await this.container.items.create<ForecastRecord>(record);
      return record;
    } catch (error) {
      if (code(error) !== 409) throw error;
      const existing = await this.find(record.userId, record.id);
      if (!existing) throw error;
      return existing;
    }
  }

  async list(userId: string, limit: number, cursor?: string) {
    await this.ensureContainer();
    const page = await this.container.items.query<ForecastRecord>({
      query: "SELECT * FROM c WHERE c.userId = @userId AND c.kind = @kind ORDER BY c.recordedAt DESC",
      parameters: [{ name: "@userId", value: userId }, { name: "@kind", value: "marketos-forecast-v1" }],
    }, { partitionKey: userId, maxItemCount: Math.min(50, Math.max(1, limit)), continuationToken: cursor }).fetchNext();
    return { records: page.resources, cursor: page.continuationToken || undefined };
  }

  async deleteUserData(userId: string) {
    await this.ensureContainer();
    if (!userId) {
      throw new ProductionGateError("INVALID_ERASURE_OWNER", "A forecast owner is required for data erasure.", 400);
    }

    let deleted = 0;

    // Use stable transactional batches instead of Cosmos' delete-by-partition
    // preview feature. Re-query the same logical partition after each batch,
    // so no continuation token can skip items that disappeared mid-erasure.
    for (let batchIndex = 0; batchIndex < 100; batchIndex += 1) {
      const page = await this.container.items.query<{ id: string }>({
        query: "SELECT TOP 100 c.id FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: userId }],
      }, {
        partitionKey: userId,
        maxItemCount: 100,
      }).fetchNext();

      const ids = (page.resources ?? [])
        .map(item => item?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (ids.length === 0) {
        return { deleted };
      }

      const response = await this.container.items.batch(
        ids.map(id => ({
          operationType: "Delete" as const,
          id,
        })),
        userId,
      );

      const failed = (response.result ?? []).find(item =>
        typeof item.statusCode === "number" &&
        (item.statusCode < 200 || item.statusCode >= 300),
      );

      if (failed) {
        throw new ProductionGateError(
          "FORECAST_ERASURE_FAILED",
          "Forecast data erasure did not complete. It is safe to retry.",
          503,
        );
      }

      deleted += ids.length;
    }

    throw new ProductionGateError(
      "FORECAST_ERASURE_LIMIT",
      "Forecast data erasure exceeded the bounded batch limit. Retry to continue.",
      503,
    );
  }
}

let ledger: CosmosForecastLedger | undefined;
export function getForecastLedger(): ForecastLedger {
  const config = forecastLedgerConfig();
  if (!ledger) {
    const client = new CosmosClient(config.connectionString);
    const container = client.database(config.databaseId).container(config.containerId);
    ledger = new CosmosForecastLedger(container);
  }
  return ledger;
}

export function storageUnavailable() {
  return new ProductionGateError("FORECAST_STORAGE_UNAVAILABLE", "The forecast journal is unavailable. No forecast was marked as saved.");
}
