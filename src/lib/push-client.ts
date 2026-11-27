// Browser side of push notifications, shared by the settings card (More) and the "turn on" banner.
import { saveSubscription } from "@/lib/actions/features";
import type { ErrorKey } from "@/lib/errors";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function swRegistration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
}

/** Can this device get notifications, and are they on? (iPhones need the app on the Home Screen first.) */
export async function pushState(): Promise<PushState> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const sub = await (await swRegistration()).pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Ask the phone for permission (the person taps "Allow") and register this device. */
export async function enablePush(vapidKey: string): Promise<{ state: PushState; error?: ErrorKey }> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { state: perm === "denied" ? "denied" : "off" };
  const reg = await swRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }));
  const r = await saveSubscription(sub.toJSON(), navigator.userAgent);
  if (r.error) return { state: "off", error: r.error };
  return { state: "on" };
}
