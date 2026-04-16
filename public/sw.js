// Service Worker for Web Push notifications
// Receives push events and displays notifications to the user.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "New notification", body: event.data.text() };
  }

  const options = {
    body: payload.body ?? "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.tag ?? "airbnb-ops",
    data: { url: payload.url ?? "/" },
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Airbnb Ops", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.includes(url) && "focus" in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      }),
  );
});
