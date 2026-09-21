# Live account-erasure storage acceptance

This manual production acceptance check exercises the **real compiled account-erasure
handler** against the already-provisioned MarketOS Cosmos containers. It does not call a
market-data provider or public hosted endpoint and does not provision Azure resources.

Run **Live Account Erasure Storage Acceptance** manually in the `azure-production`
environment after the production Cosmos secret is available.

The check creates synthetic, randomly partitioned acceptance data only:

1. one user-state record for a target owner and one for a different owner;
2. one entitlement for each owner;
3. three forecast-journal records for the target forecast owner and one sentinel record for
   the different owner;
4. a local Azure `HttpRequest` carrying a synthetic authenticated principal is passed to the
   actual compiled `createAccountDataEraseHandler`;
5. the handler must report success and exactly three forecast-journal deletions;
6. target user state, entitlement and the entire target forecast partition must be gone;
7. the different owner's state, entitlement and forecast sentinel must still exist;
8. all acceptance data—including the sentinel owner—is removed in final cleanup and verified.

The evidence artifact contains only container names, aggregate deletion state/counts and cleanup
booleans. It never contains the Cosmos connection string, random owner IDs, principal payload or
record contents.

This proves the **persistent-store orchestration** portion of `HOSTED_ACCOUNT_ERASURE`. It is
not the final hosted-auth proof because the synthetic principal is injected directly into the
handler rather than passing through Static Web Apps. The hosted boundary still must prove that
only the real signed-in owner can invoke erasure and that forged principal headers are stripped.
