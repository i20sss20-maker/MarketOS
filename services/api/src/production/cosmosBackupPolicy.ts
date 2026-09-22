import {
  ProductionGateError,
  realDataRequired,
} from "./policy.js";

export type CosmosBackupPolicy = {
  verified: boolean;
  mode:
    | "periodic"
    | "continuous"
    | "unknown";
  verifiedAt?: string;
  configured: boolean;
};

function isoDate(
  value: string | undefined,
) {
  const raw =
    value?.trim() ?? "";

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      raw,
    )
  ) {
    return undefined;
  }

  const parsed =
    Date.parse(
      `${raw}T00:00:00Z`,
    );

  return Number.isFinite(
    parsed,
  )
    ? raw
    : undefined;
}

export function cosmosBackupPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
  now = new Date(),
): CosmosBackupPolicy {
  const verified =
    (
      env.MARKETOS_COSMOS_BACKUP_VERIFIED ??
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  const rawMode =
    (
      env.MARKETOS_COSMOS_BACKUP_MODE ??
      ""
    )
      .trim()
      .toLowerCase();

  const mode =
    rawMode === "periodic" ||
    rawMode === "continuous"
      ? rawMode
      : "unknown";

  const verifiedAt =
    isoDate(
      env.MARKETOS_COSMOS_BACKUP_VERIFIED_AT,
    );

  const today =
    now
      .toISOString()
      .slice(0, 10);

  const verifiedTimestamp =
    verifiedAt
      ? Date.parse(
          `${verifiedAt}T00:00:00Z`,
        )
      : NaN;

  const ageDays =
    Number.isFinite(
      verifiedTimestamp,
    )
      ? Math.floor(
          (
            Date.parse(
              `${today}T00:00:00Z`,
            ) -
            verifiedTimestamp
          ) /
            86_400_000,
        )
      : Number.POSITIVE_INFINITY;

  return {
    verified,
    mode,
    ...(verifiedAt
      ? { verifiedAt }
      : {}),
    configured:
      verified &&
      mode !== "unknown" &&
      ageDays >= 0 &&
      ageDays <= 30,
  };
}

export function assertCosmosBackupPolicy(
  env: NodeJS.ProcessEnv =
    process.env,
  now = new Date(),
) {
  const policy =
    cosmosBackupPolicy(
      env,
      now,
    );

  if (
    !realDataRequired(env)
  ) {
    return policy;
  }

  if (!policy.verified) {
    throw new ProductionGateError(
      "COSMOS_BACKUP_NOT_VERIFIED",
      "Production requires the Cosmos backup policy to be verified from Azure.",
    );
  }

  if (
    policy.mode === "unknown"
  ) {
    throw new ProductionGateError(
      "COSMOS_BACKUP_MODE_UNKNOWN",
      "Production requires the verified Cosmos backup mode to be recorded.",
    );
  }

  if (!policy.verifiedAt) {
    throw new ProductionGateError(
      "COSMOS_BACKUP_VERIFICATION_INVALID",
      "Production requires a valid Cosmos backup verification date.",
    );
  }

  const today =
    Date.parse(
      `${now
        .toISOString()
        .slice(0, 10)}T00:00:00Z`,
    );
  const checked =
    Date.parse(
      `${policy.verifiedAt}T00:00:00Z`,
    );
  const ageDays =
    Math.floor(
      (
        today -
        checked
      ) /
        86_400_000,
    );

  if (
    ageDays < 0 ||
    ageDays > 30
  ) {
    throw new ProductionGateError(
      "COSMOS_BACKUP_VERIFICATION_STALE",
      "Cosmos backup verification must be current within 30 days.",
    );
  }

  return policy;
}
