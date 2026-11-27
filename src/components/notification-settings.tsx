"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { removeSubscription, sendTestPush, updateNotifyPrefs } from "@/lib/actions/features";
import type { NotifyPrefs } from "@/lib/push";
import { enablePush, pushState, swRegistration, type PushState } from "@/lib/push-client";
import { btn } from "./ui";

type State = "loading" | PushState;

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
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  if (!vapidKey) return <p className="text-sm text-slate-500">{t("notConfigured")}</p>;

  const enable = () =>
    start(async () => {
      setMsg(null);
      const r = await enablePush(vapidKey);
      setState(r.state);
      if (r.error) setMsg(tErr(r.error));
    });

  const disable = () =>
    start(async () => {
      const sub = await (await swRegistration()).pushManager.getSubscription();
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
            <label key={k} className="inline-flex min-h-10 items-center gap-3 rounded-lg pr-2 select-none">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
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
