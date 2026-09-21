# Azure operations guardrails

This bootstrap prepares two operational controls for MarketOS:

1. Azure Monitor metric alerts for managed Static Web Apps `FunctionErrors` and `SiteErrors`.
2. A monthly Azure Cost Management budget at the MarketOS resource-group scope.

It does **not** enable Application Insights and it does **not** stop resources when a
budget threshold is crossed.

## Explicit consent

The script requires all of these values at runtime:

- an operations email address;
- the monthly budget amount chosen by the operator;
- `-IUnderstandAzureMonitorMayCharge`.

No default monetary budget is invented by the repository.

Example only:

```powershell
./infrastructure/azure/bootstrap-operations-guardrails.ps1 \
  -ContactEmail "ops@example.com" \
  -MonthlyBudgetAmount 25 \
  -IUnderstandAzureMonitorMayCharge
```

Replace the example values with approved values before running.

## What it creates or verifies

The script refuses to create a resource group or Static Web App. They must already exist.

It verifies that the Static Web App publishes the documented `FunctionErrors` and
`SiteErrors` metrics, then creates/reuses:

- `marketos-ops` action group with the requested email receiver;
- `marketos-function-errors`: any function error in the five-minute window;
- `marketos-site-errors`: more than five site errors in the five-minute window;
- `marketos-rg-monthly`: monthly resource-group budget with 80% and 100% actual-cost
  notifications.

If an existing action group has a different email, an alert is disabled/wrongly scoped,
its metric/threshold/cadence/action group differs, or an existing budget amount/80%-100%
notification policy differs, the script stops rather than silently rewriting operational policy.

Only after the resources verify does it set:

```text
MARKETOS_METRIC_ALERTS_CONFIGURED=true
MARKETOS_COST_BUDGET_CONFIGURED=true
```

Production configuration readiness requires both flags.

## Important limits

Azure Cost Management budgets are notification/monitoring controls; crossing a threshold
does not stop Azure resources or spending. Budget emails can also be delayed relative to
the instant a threshold is crossed.

Azure Monitor metric alerts and action groups have their own pricing/limits. The script
therefore requires explicit acknowledgement before creating them.

Detailed request/exception investigation still requires the separate
`APPLICATION_INSIGHTS_AND_LOG_REVIEW` production acceptance gate. MarketOS does not mark
itself fully production-ready merely because metric alerts and a budget exist.

References:

- https://learn.microsoft.com/azure/static-web-apps/metrics
- https://learn.microsoft.com/cli/azure/monitor/metrics/alert
- https://learn.microsoft.com/azure/cost-management-billing/costs/tutorial-acm-create-budgets
