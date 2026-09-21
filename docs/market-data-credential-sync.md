# Market-data credential sync

Use `infrastructure/azure/sync-market-data-credential.ps1` only after you have a provider
credential that you are authorized to use.

The helper asks for the Twelve Data key with hidden input and synchronizes it to:

- the MarketOS Azure Static Web App backend setting `TWELVE_DATA_API_KEY`; and
- the GitHub environment secret `market-data-acceptance / TWELVE_DATA_API_KEY`.

The Azure update uses the Static Sites app-settings REST API with an Azure management token and
an in-memory request body. The key is not placed in Azure CLI arguments. The GitHub copy is piped
to `gh secret set` through stdin. The script does not print the key or write it to a file.

It intentionally does **not** set `MARKET_DATA_PROVIDER`, `MARKETOS_REQUIRE_REAL_DATA`, timing,
usage scope, or rights confirmation. Credential possession is not proof of realtime entitlement,
commercial display rights, or exchange permission.

After credential sync, separately:

1. declare the actual timing/usage scope with `configure-market-data-policy.ps1`;
2. run **Real Provider Check** with the same declared policy;
3. configure the remaining production storage/operations/evaluator gates;
4. deploy the exact verified production SHA and run the release evidence gate.

Azure Static Web Apps application settings are backend environment variables and are encrypted at
rest by Azure. Keep provider credentials out of `VITE_*` frontend variables.

References:
- https://learn.microsoft.com/rest/api/appservice/static-sites/list-static-site-app-settings
- https://learn.microsoft.com/rest/api/appservice/static-sites/create-or-update-static-site-app-settings
- https://learn.microsoft.com/azure/static-web-apps/application-settings
