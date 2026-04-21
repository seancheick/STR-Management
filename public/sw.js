// Service Worker for Web Push notifications + PWA install eligibility.
//
// Chrome / Edge only fire the `beforeinstallprompt` event when the SW has
// a `fetch` event listener (even a trivial pass-through counts). Without
// this, the Install banner on cleaner mobile never offers the in-page
// install button. The handler deliberately does no caching — we rely on
// Next.js for static asset delivery.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // No-op pass-through: browsers go to network normally.
});

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
    icon: "/icon-192.svg",
    badge: "/badge-72.svg",
    tag: payload.tag ?? "turnflow",
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
