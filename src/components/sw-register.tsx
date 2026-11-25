"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    // Development: make sure an installed service worker can't serve stale code.
    // Fetch the latest sw.js (it skips caching on localhost) and drop any stored copies.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.update().catch(() => {})));
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }, []);
  return null;
}
