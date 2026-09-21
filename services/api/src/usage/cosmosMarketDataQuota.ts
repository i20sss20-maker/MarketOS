import {
  CosmosClient,
  type Container,
} from "@azure/cosmos";
import {
  forecastLedgerConfig,
  ProductionGateError,
} from "../production/policy.js";
import {
  marketDataUsageWindow,
  type MarketDataQuotaDecision,
  type MarketDataQuotaStore,
  type MarketDataUsageRecord,
} from "./marketDataQuota.js";

function statusCode(
  error: unknown,
) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error
  )
    ? Number(
        (
          error as {
            code?: unknown;
          }
        ).code,
      )
    : undefined;
}

export class CosmosMarketDataQuotaStore
implements MarketDataQuotaStore {
  private ready:
    Promise<void> | null =
    null;

  constructor(
    private readonly container:
      Container,
  ) {}

  private ensureContainer() {
    if (!this.ready) {
      this.ready =
        this.container
          .read()
          .then(
            ({ resource }) => {
              const paths =
                resource
                  ?.partitionKey
                  ?.paths;

              if (
                !paths ||
                paths.length !== 1 ||
                paths[0] !==
                  "/userId"
              ) {
                throw new ProductionGateError(
                  "INVALID_JOURNAL_PARTITION",
                  "Market-data quota requires the /userId forecast journal container.",
                );
              }
            },
          )
          .catch(
            (error) => {
              this.ready = null;
              throw error;
            },
          );
    }

    return this.ready;
  }

  private async read(
    userId: string,
    id: string,
  ) {
    try {
      const response =
        await this.container
          .item(
            id,
            userId,
          )
          .read<MarketDataUsageRecord>();

      const record =
        response.resource;

      if (!record) {
        return null;
      }

      if (
        record.userId !==
          userId ||
        record.id !== id ||
        record.kind !==
          "marketos-market-data-usage-v1" ||
        !Number.isInteger(
          record.count,
        ) ||
        record.count < 0 ||
        !Number.isInteger(
          record.limit,
        ) ||
        record.limit < 1 ||
        typeof record.day !==
          "string" ||
        !record._etag
      ) {
        throw new ProductionGateError(
          "INVALID_MARKET_DATA_QUOTA_RECORD",
          "Stored market-data quota state is invalid.",
        );
      }

      return record;
    } catch (error) {
      if (
        statusCode(error) ===
        404
      ) {
        return null;
      }

      throw error;
    }
  }

  async consume(
    userId: string,
    limit: number,
    units = 1,
    now = Date.now(),
  ): Promise<MarketDataQuotaDecision> {
    await this.ensureContainer();

    if (
      !userId ||
      !Number.isInteger(limit) ||
      limit < 10 ||
      limit > 100_000 ||
      !Number.isInteger(units) ||
      units < 1 ||
      units > 25
    ) {
      throw new ProductionGateError(
        "INVALID_MARKET_DATA_QUOTA_REQUEST",
        "Market-data quota request is invalid.",
      );
    }

    const window =
      marketDataUsageWindow(now);

    for (
      let attempt = 0;
      attempt < 6;
      attempt += 1
    ) {
      const current =
        await this.read(
          userId,
          window.id,
        );

      if (!current) {
        if (units > limit) {
          return {
            allowed: false,
            day: window.day,
            used: 0,
            requestedUnits:
              units,
            limit,
            remaining: limit,
            resetAt:
              window.resetAt,
          };
        }

        const created:
          MarketDataUsageRecord =
          {
            id: window.id,
            userId,
            kind:
              "marketos-market-data-usage-v1",
            day: window.day,
            count: units,
            limit,
            updatedAt: now,
          };

        try {
          await this.container
            .items
            .create(created);

          return {
            allowed: true,
            day: window.day,
            used: units,
            requestedUnits:
              units,
            limit,
            remaining:
              Math.max(
                0,
                limit - units,
              ),
            resetAt:
              window.resetAt,
          };
        } catch (error) {
          if (
            statusCode(error) ===
            409
          ) {
            continue;
          }
          throw error;
        }
      }

      if (
        current.day !==
        window.day
      ) {
        throw new ProductionGateError(
          "INVALID_MARKET_DATA_QUOTA_RECORD",
          "Stored market-data quota day does not match its key.",
        );
      }

      if (
        current.count + units >
        limit
      ) {
        return {
          allowed: false,
          day: window.day,
          used: current.count,
          requestedUnits: units,
          limit,
          remaining:
            Math.max(
              0,
              limit -
                current.count,
            ),
          resetAt:
            window.resetAt,
        };
      }

      const {
        _etag,
        ...currentData
      } = current;

      const next:
        MarketDataUsageRecord =
        {
          ...currentData,
          count:
            current.count +
            units,
          limit,
          updatedAt: now,
        };

      try {
        await this.container
          .item(
            current.id,
            userId,
          )
          .replace(
            next,
            {
              accessCondition: {
                type:
                  "IfMatch",
                condition:
                  current._etag,
              },
            },
          );

        return {
          allowed: true,
          day: window.day,
          used: next.count,
          requestedUnits: units,
          limit,
          remaining:
            Math.max(
              0,
              limit -
                next.count,
            ),
          resetAt:
            window.resetAt,
        };
      } catch (error) {
        if (
          statusCode(error) ===
          412
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ProductionGateError(
      "MARKET_DATA_QUOTA_CONTENTION",
      "Market-data quota changed concurrently too many times. Retry shortly.",
      503,
    );
  }
}

let quotaStore:
  CosmosMarketDataQuotaStore |
  undefined;

export function getMarketDataQuotaStore():
MarketDataQuotaStore {
  const config =
    forecastLedgerConfig();

  if (!quotaStore) {
    const client =
      new CosmosClient(
        config.connectionString,
      );

    quotaStore =
      new CosmosMarketDataQuotaStore(
        client
          .database(
            config.databaseId,
          )
          .container(
            config.containerId,
          ),
      );
  }

  return quotaStore;
}
