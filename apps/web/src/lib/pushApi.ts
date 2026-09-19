export type PushDeviceState = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  subscriptionCount: number;
};

type PushConfigResponse = {
  ok: boolean;
  enabled: boolean;
  publicKey: string;
};

type PushSubscriptionResponse = {
  ok: boolean;
  configured: boolean;
  subscriptionCount: number;
  error?: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function jsonRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as
    | (T & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ??
      (response.status === 401
        ? "Authentication required."
        : `Push request failed (${response.status}).`),
    );
  }

  if (payload.error) throw new Error(payload.error);
  return payload;
}

export function getPushConfig() {
  return jsonRequest<PushConfigResponse>("/push/config");
}

async function getServerSubscriptionCount() {
  try {
    const response = await jsonRequest<PushSubscriptionResponse>(
      "/user/push/subscription",
    );
    return response.subscriptionCount ?? 0;
  } catch {
    return 0;
  }
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? null;
}

export async function getPushDeviceState(): Promise<PushDeviceState> {
  if (!supported()) {
    return {
      supported: false,
      configured: false,
      permission: "unsupported",
      subscribed: false,
      subscriptionCount: 0,
    };
  }

  const config = await getPushConfig();
  const registration = await getRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;

  return {
    supported: true,
    configured: config.enabled && Boolean(config.publicKey),
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    subscriptionCount: await getServerSubscriptionCount(),
  };
}

export async function enablePushNotifications(): Promise<PushDeviceState> {
  if (!supported()) {
    throw new Error("هذا المتصفح لا يدعم Web Push.");
  }

  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) {
    throw new Error("Web Push غير مهيأ على خادم MarketOS.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "تم رفض إذن الإشعارات من المتصفح."
        : "لم يتم منح إذن الإشعارات.",
    );
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  let subscription = await registration.pushManager.getSubscription();
  let createdNow = false;

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
    createdNow = true;
  }

  const json = subscription.toJSON();
  if (
    !json.endpoint ||
    !json.keys?.p256dh ||
    !json.keys?.auth
  ) {
    if (createdNow) await subscription.unsubscribe().catch(() => false);
    throw new Error("تعذر قراءة بيانات اشتراك الإشعارات.");
  }

  try {
    const response = await jsonRequest<PushSubscriptionResponse>(
      "/user/push/subscription",
      {
        method: "POST",
        body: JSON.stringify({
          subscription: {
            endpoint: json.endpoint,
            expirationTime: json.expirationTime ?? null,
            keys: {
              p256dh: json.keys.p256dh,
              auth: json.keys.auth,
            },
          },
        }),
      },
    );

    return {
      supported: true,
      configured: true,
      permission: Notification.permission,
      subscribed: true,
      subscriptionCount: response.subscriptionCount,
    };
  } catch (error) {
    if (createdNow) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function disablePushNotifications(): Promise<PushDeviceState> {
  if (!supported()) {
    return {
      supported: false,
      configured: false,
      permission: "unsupported",
      subscribed: false,
      subscriptionCount: 0,
    };
  }

  const registration = await getRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;

  if (subscription) {
    await jsonRequest<PushSubscriptionResponse>(
      "/user/push/subscription",
      {
        method: "DELETE",
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      },
    );
    await subscription.unsubscribe();
  }

  return getPushDeviceState();
}
