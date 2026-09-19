# Azure foundation

MarketOS Azure resources must be isolated in MarketOS-only resource groups.

Suggested development group:

`rg-marketos-dev`

Potential resources, created only when needed:

- web hosting
- Function App
- Storage Account
- Key Vault
- Application Insights
- database/cache after workload requirements are measured

## Cost rule

Do not provision paid resources by default. The Azure for Students credit is for development and validation, so cost controls and budgets should be configured before real-time market workloads are enabled.

## Secret rule

Never place API keys, Azure connection strings, AI keys, or market-data credentials in GitHub source files.
