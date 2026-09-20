import { CosmosClient, type Container } from "@azure/cosmos";
import { forecastLedgerConfig, ProductionGateError } from "../production/policy.js";
import type { ForecastLedger, ForecastRecord } from "./ledger.js";

function code(error: unknown) {
  return error && typeof error === "object" && "code" in error ? Number(error.code) : undefined;
}

export class CosmosForecastLedger implements ForecastLedger {
  constructor(private readonly container: Container) {}
  private ready: Promise<void> | null = null;
  private ensureContainer() {
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
