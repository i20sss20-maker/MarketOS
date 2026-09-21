# Account data erasure

MarketOS distinguishes **delete cloud copy** from **erase all MarketOS cloud account data**.

The full erasure action is available only to an authenticated user and requires the exact
confirmation phrase `DELETE MARKETOS DATA`. The browser never submits a user ID or forecast
owner ID; both are derived from the trusted Static Web Apps principal.

The server erases:

- the authenticated user's `userState` document, including cloud preferences, alert inbox
  history and registered Push endpoints;
- the authenticated user's stored entitlement record;
- the hashed forecast-owner partition in `forecastJournal`, including immutable forecasts,
  resolved forecast outcomes, daily forecast quota records, and daily provider-request quota records.

The forecast/quota partition is removed with bounded transactional delete batches. MarketOS
does not depend on Cosmos DB's delete-by-partition preview feature. If one store fails after
another store has already completed, the endpoint returns `ACCOUNT_ERASURE_INCOMPLETE` and
marks the request as safe to retry. Deletes are idempotent.

The action does **not** delete:

- localStorage or other data on the current browser/device;
- the user's Microsoft Entra ID, Microsoft account, or GitHub account;
- Azure operational logs/backups that are governed by the operator's retention policy;
- data held independently by a licensed market-data provider.

The UI states those boundaries before confirmation.

## Production acceptance

Before launch, verify with two real hosted test users that:

1. user A cannot erase or read user B's data;
2. user A's cloud state, entitlement, forecast history and current quota partition disappear
   after erasure;
3. repeating the same erasure succeeds safely;
4. user B remains unchanged;
5. a newly generated post-erasure record is not removed by the completed erasure request.

Cosmos point/batch deletion is stable SDK functionality. MarketOS deliberately avoids the
separate delete-all-by-partition preview feature.

References:
- https://learn.microsoft.com/javascript/api/@azure/cosmos/items
- https://learn.microsoft.com/azure/cosmos-db/nosql/transactional-batch
