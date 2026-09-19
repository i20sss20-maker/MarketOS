# MarketOS Entitlements

MarketOS plans are server-owned. The browser cannot assign or upgrade its own plan.

## Plans

- Free
- Pro
- Elite AI

The shared plan model lives in:

`packages/entitlements-core`

The API resolves the authenticated user's plan from the entitlement store. If no entitlement exists, the user receives Free.

## Current enforced limits

The following are enforced both in the UI and by MarketOS API cloud-state validation:

- Watchlist collections
- Total Watchlist symbols across collections
- Saved workspaces
- Advanced alerts
- Custom indicators
- Chart templates

The following features are plan-gated:

- 4-chart layout
- Indicator Lab
- Strategy Tester
- Correlation Matrix
- Multi-Timeframe AI
- Background alert worker

Manual server-alert checks remain available on Free in the current plan definition.

## Storage

Development:

```text
ENTITLEMENT_DATA_PROVIDER=memory
```

Azure persistent mode:

```text
ENTITLEMENT_DATA_PROVIDER=cosmos
COSMOS_ENTITLEMENTS_CONTAINER=entitlements
```

The Cosmos bootstrap creates the entitlement container with partition key `/userId`.

## Internal test grant

This endpoint exists for development/admin testing before billing webhooks are connected:

```text
POST /api/internal/entitlements/grant
```

It requires the server-side header:

```text
x-marketos-worker-secret: <MARKETOS_WORKER_SECRET>
```

Example body:

```json
{
  "userId": "<Static Web Apps user id>",
  "plan": "pro",
  "status": "active"
}
```

Optional:

```json
{
  "userId": "<user id>",
  "plan": "elite",
  "status": "trialing",
  "validUntil": 1790000000000
}
```

Never place the worker secret in web source, screenshots, browser storage, issues, or chat logs.

## User API

Authenticated users can read their resolved plan at:

```text
GET /api/user/entitlements
```

This endpoint is under the authenticated `/api/user/*` Static Web Apps route.

## Billing status

Billing is **not connected yet**.

Do not treat the internal grant endpoint as a production purchase flow. The next billing phase should update the same entitlement records from trusted Web Billing, Apple, or Google verification/webhook flows.

Because the entitlement contract is provider-neutral, connecting billing later does not require rewriting chart feature gates.
