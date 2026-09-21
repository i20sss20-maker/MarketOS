import {
  app,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import {
  getAuthenticatedUser,
} from "../auth/clientPrincipal.js";
import {
  entitlementStore,
} from "../entitlements/index.js";
import {
  getForecastLedger,
} from "../forecasts/cosmosLedger.js";
import {
  ownerKey,
  type ForecastLedger,
} from "../forecasts/ledger.js";
import {
  json,
  preflight,
} from "../http/responses.js";
import {
  assertRequestOrigin,
  ProductionGateError,
} from "../production/policy.js";
import {
  userStateStore,
} from "../storage/index.js";
import type {
  UserStateStore,
} from "../storage/types.js";
import type {
  EntitlementStore,
} from "../entitlements/types.js";

const CONFIRMATION =
  "DELETE MARKETOS DATA";

export function createAccountDataEraseHandler(
  deps: {
    userStore: UserStateStore;
    entitlementStore: EntitlementStore;
    forecastLedger:
      () => ForecastLedger;
  } = {
    userStore:
      userStateStore,
    entitlementStore,
    forecastLedger:
      getForecastLedger,
  },
) {
  return async (
    request: HttpRequest,
  ): Promise<HttpResponseInit> => {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return preflight();
    }

    const user =
      getAuthenticatedUser(
        request,
      );

    if (!user) {
      return json(401, {
        ok: false,
        code: "AUTH_REQUIRED",
        error:
          "Sign in to erase MarketOS account data.",
      });
    }

    try {
      assertRequestOrigin(
        request.headers.get(
          "origin",
        ),
      );

      if (
        request.method !==
        "POST"
      ) {
        return json(405, {
          ok: false,
          error:
            "Method not allowed.",
        });
      }

      if (
        deps.userStore.mode !==
          "cosmos" ||
        deps.entitlementStore
          .mode !== "cosmos"
      ) {
        throw new ProductionGateError(
          "PERSISTENT_ACCOUNT_STORAGE_REQUIRED",
          "Persistent account storage must be configured before account data erasure can be confirmed.",
        );
      }

      if (
        !request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith(
            "application/json",
          )
      ) {
        return json(415, {
          ok: false,
          error:
            "JSON content is required.",
        });
      }

      if (
        Number(
          request.headers.get(
            "content-length",
          ),
        ) > 2048
      ) {
        return json(413, {
          ok: false,
          error:
            "Request is too large.",
        });
      }

      const text =
        await request.text();

      if (
        Buffer.byteLength(
          text,
          "utf8",
        ) > 2048
      ) {
        return json(413, {
          ok: false,
          error:
            "Request is too large.",
        });
      }

      let confirmation:
        | string
        | undefined;

      try {
        const body =
          JSON.parse(text) as
            unknown;

        if (
          !body ||
          typeof body !==
            "object" ||
          Array.isArray(body) ||
          Object.keys(
            body,
          ).some(
            key =>
              key !==
              "confirmation",
          )
        ) {
          throw new Error();
        }

        confirmation =
          (
            body as {
              confirmation?:
                unknown;
            }
          ).confirmation as
            | string
            | undefined;
      } catch {
        return json(400, {
          ok: false,
          code:
            "INVALID_ERASURE_REQUEST",
          error:
            "Send only the required deletion confirmation.",
        });
      }

      if (
        confirmation !==
        CONFIRMATION
      ) {
        return json(400, {
          ok: false,
          code:
            "ERASURE_CONFIRMATION_REQUIRED",
          error:
            "Account data erasure requires the exact confirmation phrase.",
        });
      }

      const forecastOwner =
        ownerKey(user);

      const ledger =
        deps.forecastLedger();

      // Each delete is idempotent. If one subsystem fails after another
      // succeeded, the same authenticated request can safely be retried.
      const [
        stateResult,
        entitlementResult,
        forecastResult,
      ] =
        await Promise.allSettled(
          [
            deps.userStore.delete(
              user.userId,
            ),
            deps.entitlementStore.delete(
              user.userId,
            ),
            ledger.deleteUserData(
              forecastOwner,
            ),
          ],
        );

      const failed =
        [
          stateResult,
          entitlementResult,
          forecastResult,
        ].some(
          result =>
            result.status ===
            "rejected",
        );

      if (failed) {
        return json(503, {
          ok: false,
          code:
            "ACCOUNT_ERASURE_INCOMPLETE",
          error:
            "Account data erasure did not complete across every store. It is safe to retry the same request.",
          retrySafe: true,
        });
      }

      return json(200, {
        ok: true,
        erased: true,
        storage: "cosmos",
        forecastItemsDeleted:
          forecastResult.status ===
          "fulfilled"
            ? forecastResult
                .value.deleted
            : 0,
        note:
          "MarketOS application data was erased from the active stores. Identity-provider account records are managed by the sign-in provider.",
      });
    } catch (error) {
      if (
        error instanceof
        ProductionGateError
      ) {
        return json(
          error.status,
          {
            ok: false,
            code: error.code,
            error:
              error.message,
          },
        );
      }

      return json(503, {
        ok: false,
        code:
          "ACCOUNT_ERASURE_UNAVAILABLE",
        error:
          "Account data erasure is unavailable. No success was reported.",
        retrySafe: true,
      });
    }
  };
}

export const accountDataErase =
  createAccountDataEraseHandler();

app.http(
  "accountDataErase",
  {
    methods: [
      "POST",
      "OPTIONS",
    ],
    authLevel:
      "anonymous",
    route:
      "user/account-data/erase",
    handler:
      accountDataErase,
  },
);
