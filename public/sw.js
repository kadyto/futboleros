self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    return;
  }
  if (!data || typeof data.title !== "string") return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:
        typeof data.body === "string"
          ? data.body
          : "Hay novedades en el calendario.",
      icon: "/logo-futboleros.png",
      tag: typeof data.tag === "string" ? data.tag : "calendar-update",
      data: { url: data.url || "/?view=calendar" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target;
  try {
    target = new URL(
      event.notification.data?.url || "/?view=calendar",
      self.location.origin,
    );
  } catch {
    target = new URL("/?view=calendar", self.location.origin);
  }
  if (target.origin !== self.location.origin)
    target = new URL("/?view=calendar", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) =>
          new URL(client.url).origin === self.location.origin &&
          new URL(client.url).pathname === "/",
      );
      if (existing) {
        try {
          await existing.navigate(target.href);
          await existing.focus();
          return;
        } catch {
          /* Open a new window if the old one disappeared. */
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
