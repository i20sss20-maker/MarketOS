import type {
  Container,
  CosmosClient,
} from "@azure/cosmos";
import {
  ProductionGateError,
} from "../production/policy.js";

export function existingUserPartitionContainer(
  client: CosmosClient,
  databaseId: string,
  containerId: string,
  label: string,
) {
  const container =
    client
      .database(databaseId)
      .container(containerId);

  let ready:
    Promise<Container> |
    null = null;

  return () => {
    if (!ready) {
      ready =
        container
          .read()
          .then(
            ({
              resource,
            }) => {
              const paths =
                resource
                  ?.partitionKey
                  ?.paths;

              if (
                !paths ||
                paths.length !==
                  1 ||
                paths[0] !==
                  "/userId"
              ) {
                throw new ProductionGateError(
                  "INVALID_COSMOS_PARTITION",
                  `${label} must use the /userId partition key.`,
                );
              }

              return container;
            },
          )
          .catch(
            (error) => {
              ready = null;

              if (
                error instanceof
                ProductionGateError
              ) {
                throw error;
              }

              const code =
                error &&
                typeof error ===
                  "object" &&
                "code" in error
                  ? Number(
                      (
                        error as {
                          code?: unknown;
                        }
                      ).code,
                    )
                  : undefined;

              if (
                code === 404
              ) {
                throw new ProductionGateError(
                  "COSMOS_CONTAINER_MISSING",
                  `${label} is not provisioned. Run the approved infrastructure bootstrap; runtime provisioning is disabled.`,
                );
              }

              throw error;
            },
          );
    }

    return ready;
  };
}
