import webpush from "web-push";
import type { ServerAlertTriggered } from "../alerts/serverAlertService.js";
import type {
  PushSubscriptionRecord,
  UserCloudState,
} from "../storage/types.js";

export type WebPushDeliverySummary = {
  subscriptions: PushSubscriptionRecord[];
  attempted: number;
  sent: number;
  stale: number;
  failed: number;
  staleEndpoints: string[];
};

const MAX_PUSH_SUBSCRIPTIONS = 5;

function enabledFlag() {
  return (process.env.WEB_PUSH_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function getWebPushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    "https://marketos.invalid";

  const configured =
    enabledFlag() &&
    publicKey.length >= 40 &&
    privateKey.length >= 20 &&
    (subject.startsWith("https://") || subject.startsWith("mailto:"));

  return {
    enabled: configured,
    publicKey: configured ? publicKey : "",
    subject: configured ? subject : "",
    privateKey: configured ? privateKey : "",
  };
}

export function sanitizePushSubscriptions(
  value: unknown,
  limit = MAX_PUSH_SUBSCRIPTIONS,
): PushSubscriptionRecord[] {
  if (!Array.isArray(value)) return [];

  const output: PushSubscriptionRecord[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<PushSubscriptionRecord>;

    if (
      typeof record.endpoint !== "string" ||
      !record.endpoint.startsWith("https://") ||
      record.endpoint.length > 2048 ||
      !record.keys ||
      typeof record.keys.p256dh !== "string" ||
      typeof record.keys.auth !== "string" ||
      record.keys.p256dh.length === 0 ||
      record.keys.p256dh.length > 512 ||
      record.keys.auth.length === 0 ||
      record.keys.auth.length > 512
    ) {
      continue;
    }

    if (seen.has(record.endpoint)) continue;
    seen.add(record.endpoint);

    output.push({
      endpoint: record.endpoint,
      expirationTime:
        typeof record.expirationTime === "number" &&
        Number.isFinite(record.expirationTime)
          ? Math.floor(record.expirationTime)
          : null,
      keys: {
        p256dh: record.keys.p256dh,
        auth: record.keys.auth,
      },
      createdAt:
        typeof record.createdAt === "number" &&
        Number.isFinite(record.createdAt)
          ? Math.floor(record.createdAt)
          : Date.now(),
      lastSeenAt:
        typeof record.lastSeenAt === "number" &&
        Number.isFinite(record.lastSeenAt)
          ? Math.floor(record.lastSeenAt)
          : Date.now(),
      userAgent:
        typeof record.userAgent === "string"
          ? record.userAgent.slice(0, 300)
          : undefined,
    });

    if (output.length >= Math.max(1, Math.min(MAX_PUSH_SUBSCRIPTIONS, limit))) {
      break;
    }
  }

  return output;
}

export function upsertPushSubscription(
  current: unknown,
  candidate: {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  userAgent?: string | null,
) {
  const now = Date.now();
  const next = sanitizePushSubscriptions(current)
    .filter((item) => item.endpoint !== candidate.endpoint);

  next.unshift({
    endpoint: candidate.endpoint,
    expirationTime:
      typeof candidate.expirationTime === "number" &&
      Number.isFinite(candidate.expirationTime)
        ? Math.floor(candidate.expirationTime)
        : null,
    keys: {
      p256dh: candidate.keys.p256dh,
      auth: candidate.keys.auth,
    },
    createdAt: now,
    lastSeenAt: now,
    userAgent: userAgent?.slice(0, 300) || undefined,
  });

  return next.slice(0, MAX_PUSH_SUBSCRIPTIONS);
}

export function removePushSubscription(
  current: unknown,
  endpoint: string,
) {
  return removePushSubscriptions(current, [endpoint]);
}

export function removePushSubscriptions(
  current: unknown,
  endpoints: string[],
) {
  const removed = new Set(endpoints);
  return sanitizePushSubscriptions(current)
    .filter((item) => !removed.has(item.endpoint));
}

function isStalePushError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode =
    "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
  return statusCode === 404 || statusCode === 410;
}

function buildPayload(triggered: ServerAlertTriggered[]) {
  const first = triggered[0];
  const title =
    triggered.length === 1
      ? `MarketOS · ${first.symbol}`
      : `MarketOS · ${triggered.length} تنبيهات`;

  const body =
    triggered.length === 1
      ? `تفعّل تنبيه ${first.timeframe.toUpperCase()} الآن`
      : triggered
          .slice(0, 3)
          .map((item) => `${item.symbol} ${item.timeframe.toUpperCase()}`)
          .join(" · ");

  return JSON.stringify({
    title,
    body,
    tag: "marketos-alert-inbox",
    data: {
      url: "/?inbox=alerts",
    },
  });
}

export async function sendBackgroundAlertPushes(
  state: UserCloudState,
  triggered: ServerAlertTriggered[],
): Promise<WebPushDeliverySummary> {
  const subscriptions = sanitizePushSubscriptions(
    state.pushSubscriptions,
  );
  const configuration = getWebPushConfiguration();

  if (!configuration.enabled || subscriptions.length === 0 || triggered.length === 0) {
    return {
      subscriptions,
      attempted: 0,
      sent: 0,
      stale: 0,
      failed: 0,
      staleEndpoints: [],
    };
  }

  try {
    webpush.setVapidDetails(
      configuration.subject,
      configuration.publicKey,
      configuration.privateKey,
    );
  } catch {
    return {
      subscriptions,
      attempted: 0,
      sent: 0,
      stale: 0,
      failed: subscriptions.length,
      staleEndpoints: [],
    };
  }

  const payload = buildPayload(triggered);
  const staleEndpoints = new Set<string>();
  let attempted = 0;
  let sent = 0;
  let stale = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    attempted += 1;

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: subscription.keys,
        },
        payload,
        {
          TTL: 300,
        },
      );
      sent += 1;
    } catch (error) {
      if (isStalePushError(error)) {
        staleEndpoints.add(subscription.endpoint);
        stale += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    subscriptions: subscriptions.filter(
      (item) => !staleEndpoints.has(item.endpoint),
    ),
    attempted,
    sent,
    stale,
    failed,
    staleEndpoints: [...staleEndpoints],
  };
}
