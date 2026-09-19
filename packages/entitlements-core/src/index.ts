export type PlanId =
  | "free"
  | "pro"
  | "elite";

export type EntitlementStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled";

export type EntitlementSource =
  | "default"
  | "internal"
  | "web-billing"
  | "apple"
  | "google";

export type FeatureId =
  | "cloudSync"
  | "multiChart"
  | "quadChart"
  | "customIndicatorLab"
  | "strategyTester"
  | "smartScreener"
  | "correlationMatrix"
  | "multiTimeframeAi"
  | "serverAlerts"
  | "backgroundAlerts"
  | "companyFeed";

export type PlanLimits = {
  watchlists: number;
  watchlistItems: number;
  savedWorkspaces: number;
  alerts: number;
  customIndicators: number;
  chartTemplates: number;
  chartPanes: number;
  aiQueriesPerDay: number;
  multiTimeframeQueriesPerDay: number;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  features: Record<FeatureId, boolean>;
  limits: PlanLimits;
};

export type UserEntitlement = {
  userId: string;
  plan: PlanId;
  status: EntitlementStatus;
  source: EntitlementSource;
  updatedAt: number;
  validUntil?: number;
};

export type ResolvedEntitlement = UserEntitlement & {
  definition: PlanDefinition;
  effective: boolean;
};

export const PLAN_DEFINITIONS: Record<
  PlanId,
  PlanDefinition
> = {
  free: {
    id: "free",
    name: "Free",
    description:
      "Charts, watchlist and core market tools.",
    features: {
      cloudSync: true,
      multiChart: true,
      quadChart: false,
      customIndicatorLab: false,
      strategyTester: false,
      smartScreener: true,
      correlationMatrix: false,
      multiTimeframeAi: false,
      serverAlerts: true,
      backgroundAlerts: false,
      companyFeed: true,
    },
    limits: {
      watchlists: 1,
      watchlistItems: 10,
      savedWorkspaces: 2,
      alerts: 3,
      customIndicators: 1,
      chartTemplates: 2,
      chartPanes: 2,
      aiQueriesPerDay: 10,
      multiTimeframeQueriesPerDay: 0,
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    description:
      "Professional chart workspace and automation.",
    features: {
      cloudSync: true,
      multiChart: true,
      quadChart: true,
      customIndicatorLab: true,
      strategyTester: true,
      smartScreener: true,
      correlationMatrix: true,
      multiTimeframeAi: true,
      serverAlerts: true,
      backgroundAlerts: true,
      companyFeed: true,
    },
    limits: {
      watchlists: 5,
      watchlistItems: 50,
      savedWorkspaces: 12,
      alerts: 25,
      customIndicators: 10,
      chartTemplates: 10,
      chartPanes: 4,
      aiQueriesPerDay: 100,
      multiTimeframeQueriesPerDay: 25,
    },
  },

  elite: {
    id: "elite",
    name: "Elite AI",
    description:
      "Highest limits for AI-heavy and alert-heavy workflows.",
    features: {
      cloudSync: true,
      multiChart: true,
      quadChart: true,
      customIndicatorLab: true,
      strategyTester: true,
      smartScreener: true,
      correlationMatrix: true,
      multiTimeframeAi: true,
      serverAlerts: true,
      backgroundAlerts: true,
      companyFeed: true,
    },
    limits: {
      watchlists: 20,
      watchlistItems: 100,
      savedWorkspaces: 30,
      alerts: 100,
      customIndicators: 30,
      chartTemplates: 30,
      chartPanes: 4,
      aiQueriesPerDay: 500,
      multiTimeframeQueriesPerDay: 100,
    },
  },
};

export function isPlanId(
  value: unknown,
): value is PlanId {
  return (
    value === "free" ||
    value === "pro" ||
    value === "elite"
  );
}

export function resolveEntitlement(
  entitlement:
    | UserEntitlement
    | null
    | undefined,
  now = Date.now(),
): ResolvedEntitlement {
  const fallback: UserEntitlement = {
    userId:
      entitlement?.userId ?? "",
    plan:
      entitlement?.plan &&
      isPlanId(entitlement.plan)
        ? entitlement.plan
        : "free",
    status:
      entitlement?.status ??
      "active",
    source:
      entitlement?.source ??
      "default",
    updatedAt:
      entitlement?.updatedAt ??
      now,
    validUntil:
      entitlement?.validUntil,
  };

  const timeValid =
    fallback.validUntil === undefined ||
    fallback.validUntil > now;

  const effective =
    timeValid &&
    (
      fallback.status === "active" ||
      fallback.status === "trialing"
    );

  const effectivePlan =
    effective
      ? fallback.plan
      : "free";

  return {
    ...fallback,
    plan: effectivePlan,
    definition:
      PLAN_DEFINITIONS[
        effectivePlan
      ],
    effective,
  };
}

export function canUseFeature(
  entitlement: ResolvedEntitlement,
  feature: FeatureId,
) {
  return Boolean(
    entitlement
      .definition
      .features[feature],
  );
}

export type CloudStateCounts = {
  watchlists: number;
  watchlistItems: number;
  savedWorkspaces: number;
  alerts: number;
  customIndicators: number;
  chartTemplates: number;
};

export type PlanLimitViolation = {
  key: keyof CloudStateCounts;
  current: number;
  limit: number;
};

export function cloudStateViolations(
  counts: CloudStateCounts,
  entitlement: ResolvedEntitlement,
): PlanLimitViolation[] {
  const limits =
    entitlement.definition.limits;

  const entries: Array<
    [
      keyof CloudStateCounts,
      number,
      number,
    ]
  > = [
    [
      "watchlists",
      counts.watchlists,
      limits.watchlists,
    ],
    [
      "watchlistItems",
      counts.watchlistItems,
      limits.watchlistItems,
    ],
    [
      "savedWorkspaces",
      counts.savedWorkspaces,
      limits.savedWorkspaces,
    ],
    [
      "alerts",
      counts.alerts,
      limits.alerts,
    ],
    [
      "customIndicators",
      counts.customIndicators,
      limits.customIndicators,
    ],
    [
      "chartTemplates",
      counts.chartTemplates,
      limits.chartTemplates,
    ],
  ];

  return entries.flatMap(
    ([key, current, limit]) =>
      current > limit
        ? [{
            key,
            current,
            limit,
          }]
        : [],
  );
}
