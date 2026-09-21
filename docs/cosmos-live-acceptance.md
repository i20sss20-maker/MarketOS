# Live Cosmos storage acceptance

This is a manual production acceptance test for the already-provisioned MarketOS Cosmos
containers. It does not create databases, containers, throughput, or Azure resources.

The workflow **Cosmos Live Storage Acceptance** runs only by manual dispatch in the
`azure-production` GitHub environment. It requires `COSMOS_CONNECTION_STRING` as an
environment secret.

It creates one temporary acceptance record in each of:

- `userState`
- `entitlements`
- `forecastJournal`

Each container must already use partition key `/userId`.

The check then:

1. creates records through one Cosmos client;
2. reads them through a fresh independent client, proving persistence is not in-process memory;
3. verifies a point read with the wrong partition key cannot return the record;
4. deletes every temporary record in a `finally` block;
5. uses another client to verify cleanup;
6. writes only booleans/container names to the evidence artifact—never the connection string,
   record nonce, user ID, or market/user data.

This closes the storage-layer portion of `COSMOS_WRITE_READ_RESTART`. A fresh SDK client is
not the same as restarting the Azure service; after deployment, MarketOS still needs an
end-to-end hosted write/read check through its authenticated API.

The workflow deliberately fails if the GitHub production environment does not contain the
Cosmos credential. The credential should be copied through a secure secret-management path;
never paste it into source, logs, issues, or chat.
