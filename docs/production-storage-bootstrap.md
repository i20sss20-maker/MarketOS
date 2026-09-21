# Production storage bootstrap

This script prepares the **storage foundation only**. It does not enable a market-data
provider, real-data mode, a paid plan, or a public launch.

Run with an explicit provider-request ceiling chosen for the data plan:

```powershell
./infrastructure/azure/bootstrap-production-storage.ps1 \
  -MarketDataDailyRequestHardCap <approved-per-user-daily-units>
```

The repository intentionally has no default for this market-data ceiling because the appropriate
value depends on the selected provider plan, permitted usage and budget.

The bootstrap is intentionally cost-conservative:

- it requires the MarketOS resource group and Static Web App to already exist;
- a new Cosmos account is created only with Free Tier enabled;
- an existing non-Free-Tier account is rejected;
- a new `marketos` database uses shared manual throughput, capped at 1000 RU/s;
- `userState`, `entitlements`, and `forecastJournal` inherit that shared throughput
  and all use partition key `/userId`;
- an existing database without shared throughput is rejected rather than migrated;
- a container with dedicated throughput is rejected rather than silently retained;
- the connection string is written directly to Static Web Apps app settings and is never
  printed by the script.
- the operator must choose a per-user daily provider-request ceiling; the script does not invent one.

Azure Cosmos DB Free Tier currently covers the first 1000 RU/s and 25 GB in a Free Tier
account. Usage above those limits can be billed. This bootstrap cannot guarantee a zero
bill because storage, networking, other Azure resources, policy changes, or manually
modified capacity can affect charges. Verify the subscription's Cost Management after
provisioning.

The script configures persistent user state, persistent entitlements, the server forecast
journal, and the operator forecast daily hard cap. It deliberately leaves these settings
untouched:

```text
MARKETOS_ENVIRONMENT
MARKETOS_REQUIRE_REAL_DATA
MARKET_DATA_PROVIDER
MARKET_EVENTS_PROVIDER
MARKET_FEED_PROVIDER
TWELVE_DATA_API_KEY
```

Those must only be activated after the chosen market-data license and live hosted
acceptance tests are confirmed.

If an older MarketOS bootstrap already created dedicated-throughput containers, this
script stops. Do not delete or recreate those containers automatically. Plan an explicit
data migration first.

References:
- https://learn.microsoft.com/azure/cosmos-db/free-tier
- https://learn.microsoft.com/azure/cosmos-db/set-throughput
- https://learn.microsoft.com/cli/azure/cosmosdb/sql/database
