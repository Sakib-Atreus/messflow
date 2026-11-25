"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { removeSubscription, saveSubscription, sendTestPush, updateNotifyPrefs } from "@/lib/actions/features";
import type { NotifyPrefs } from "@/lib/push";
import { btn } from "./ui";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
}

const KINDS = ["cutoff", "duty", "dues", "notices", "deposits"] as const;

/** compact: only the on/off switch (used on the waiting-for-approval screen) */
export function NotificationSettings({ vapidKey, prefs: initial, compact }: { vapidKey: string | null; prefs: NotifyPrefs; compact?: boolean }) {
  const t = useTranslations("notify");
  const tErr = useTranslations("errors");
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const sub = await (await registration()).pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  if (!vapidKey) return <p className="text-sm text-slate-500">{t("notConfigured")}</p>;

  const enable = () =>
    start(async () => {
      setMsg(null);
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }));
      const r = await saveSubscription(sub.toJSON(), navigator.userAgent);
      if (r.error) return setMsg(tErr(r.error));
      setState("on");
    });

  const disable = () =>
    start(async () => {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      setMsg(r.error ? tErr(r.error) : t("testSent"));
    });

  const toggle = (k: (typeof KINDS)[number], v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    start(async () => {
      const r = await updateNotifyPrefs(next);
      if (r.error) setMsg(tErr(r.error));
    });
  };

  return (
    <div className="space-y-4">
      {state === "unsupported" && <p className="text-sm text-slate-500">{t("unsupported")}</p>}
      {state === "ios-install" && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t("iosInstall")}</p>}
      {state === "denied" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("denied")}</p>}
      {state === "off" && (
        <button type="button" className={btn.primary} disabled={pending} onClick={enable}>
          🔔 {t("enable")}
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-brand-600 dark:text-brand-400">✓ {t("on")}</span>
          <button type="button" className={btn.small} disabled={pending} onClick={test}>{t("test")}</button>
          <button type="button" className={btn.small} disabled={pending} onClick={disable}>{t("disable")}</button>
        </div>
      )}
      {msg && <p className="text-sm text-slate-600 dark:text-slate-300">{msg}</p>}

      {!compact && <div>
        <div className="mb-2 text-sm font-medium">{t("types")}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={prefs[k] !== false}
                onChange={(e) => toggle(k, e.target.checked)}
              />
              {t(k)}
            </label>
          ))}
        </div>
      </div>}
    </div>
  );
}
