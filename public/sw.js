// MessFlow service worker: makes the app installable and shows the last-seen pages offline.
const CACHE = "messflow-v5";
// On a development machine files change without new names, so never serve stored copies there
// (push notifications still work).
const DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => DEV || k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (DEV || req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const isStatic = req.url.includes("/_next/static/") || req.url.includes("/icons/");
  if (isStatic) {
    // cache-first for hashed assets
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (req.mode === "navigate") {
    // network-first for pages, fall back to the cached copy when offline
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/bn/dashboard")).then((hit) => hit || Response.error())),
    );
  }
});

// ---- push notifications
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "MessFlow", body: e.data ? e.data.text() : "" };
  }
  const tellTabs = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((wins) => wins.forEach((w) => w.postMessage({ type: "push", tag: data.tag })));
  e.waitUntil(Promise.all([tellTabs, self.registration.showNotification(data.title || "MessFlow", {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    })]),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
