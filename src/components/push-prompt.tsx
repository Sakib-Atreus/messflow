"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellRing, X } from "lucide-react";
import { enablePush, pushState, type PushState } from "@/lib/push-client";
import { useFeedback } from "./feedback";
import { btn, cn, Spinner } from "./ui";

const LATER_KEY = "mf-push-later";
const LATER_DAYS = 3; // "Later" hides the banner for a few days, then it asks again
const NOTE_DAYS = 30; // the "blocked" / "add to Home Screen" notes come back much less often

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(LATER_KEY) ?? 0);
  } catch {
    return 0;
  }
}
function snooze(days: number) {
  try {
    localStorage.setItem(LATER_KEY, String(Date.now() + days * 864e5));
  } catch {}
}

/**
 * Asks once to turn notifications on (dashboard and khala's page), like a chat app does on first open.
 * Phones only allow it after the person taps "Allow", so one tap here does that and registers the phone.
 * Hidden once on; "Later" hides it for a few days. If they're blocked, a short note says how to unblock.
 * Turning them off or choosing what to get stays in More → Notifications.
 */
export function PushPrompt({ vapidKey, forCook = false }: { vapidKey: string | null; forCook?: boolean }) {
  const t = useTranslations("notify");
  const tErr = useTranslations("errors");
  const { toast } = useFeedback();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vapidKey) return;
    pushState().then(
      (s) => {
        setState(s);
        setHidden(Date.now() < snoozedUntil());
      },
      () => setState("unsupported"),
    );
  }, [vapidKey]);

  if (!vapidKey || hidden || !state || state === "on" || state === "unsupported") return null;

  const close = (days: number) => {
    snooze(days);
    setHidden(true);
  };

  if (state === "denied" || state === "ios-install") {
    return (
      <div role="note" data-push-prompt={state} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <BellRing className="mt-0.5 size-5 shrink-0" />
        <p className="flex-1">{state === "denied" ? t("denied") : t("iosInstall")}</p>
        <button type="button" onClick={() => close(NOTE_DAYS)} aria-label={t("promptOk")} className="-m-1 rounded-lg p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const turnOn = () =>
    start(async () => {
      const r = await enablePush(vapidKey);
      if (r.error) return toast(tErr(r.error), "error");
      setState(r.state);
      if (r.state === "on") toast(t("promptDone"));
    });

  return (
    <section
      data-push-prompt="off"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center",
        "dark:border-brand-900 dark:bg-brand-950/40",
      )}
    >
      <div className="flex flex-1 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
          <BellRing className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">{t("promptTitle")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{forCook ? t("promptBodyCook") : t("promptBody")}</p>
        </div>
      </div>
      <div className="flex gap-2 sm:shrink-0">
        <button type="button" className={cn(btn.primary, "flex-1 sm:flex-none")} disabled={pending} onClick={turnOn}>
          {pending && <Spinner />}
          {t("promptOn")}
        </button>
        <button type="button" className={cn(btn.secondary, "flex-1 sm:flex-none")} disabled={pending} onClick={() => close(LATER_DAYS)}>
          {t("promptLater")}
        </button>
      </div>
    </section>
  );
}
