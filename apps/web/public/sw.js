self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "MarketOS",
      body: event.data ? event.data.text() : "لديك تنبيه جديد.",
    };
  }

  const title =
    typeof payload.title === "string" && payload.title
      ? payload.title
      : "MarketOS";
  const body =
    typeof payload.body === "string" && payload.body
      ? payload.body
      : "لديك تنبيه جديد.";
  const tag =
    typeof payload.tag === "string" && payload.tag
      ? payload.tag
      : "marketos-alert";
  const url =
    payload.data &&
    typeof payload.data.url === "string" &&
    payload.data.url.startsWith("/")
      ? payload.data.url
      : "/?inbox=alerts";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target =
    event.notification.data &&
    typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/?inbox=alerts";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            if ("navigate" in client) {
              return client.navigate(target).then(() => client.focus());
            }
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(target);
        }

        return undefined;
      }),
  );
});
