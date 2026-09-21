# Hosted ingress load acceptance

This manual workflow gives MarketOS a small, repeatable production ingress/managed-function
load check without consuming market-data credits or touching Cosmos.

It targets only `/api/health`, with repository-enforced limits of 20–500 total requests and
1–20 concurrent workers. The default is 100 requests at concurrency 5.

Evidence records success/failure counts, throughput and p50/p95/p99/max latency. Acceptance
requires zero failed requests and a deliberately loose p95 ceiling of 5 seconds.

This is **not** a complete capacity or disaster-recovery test. It does not exercise:
- provider rate limits or market-data entitlement;
- authenticated routes;
- Cosmos throughput/contention;
- forecast generation/evaluation;
- regional failover or recovery after an Azure outage.

Those remain separate acceptance gates. The workflow is manual-only because even health
requests consume hosted service resources.
