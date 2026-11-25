"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronRight, Circle, Rocket } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "./ui";

export type SetupStep = { key: string; done: boolean; href: string };

/** First-time setup for a manager; ticks itself off, can be hidden (remembered on this device). */
export function SetupChecklist({ messId, steps }: { messId: string; steps: SetupStep[] }) {
  const t = useTranslations("setup");
  const storageKey = `mf-setup-hidden-${messId}`;
  const [hidden, setHidden] = useState(true); // avoid a flash before we know
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
  }, [storageKey]);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;

  return (
    <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm sm:p-5 dark:border-brand-900/60 dark:from-brand-950/40 dark:to-slate-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <Rocket className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("progress", { done, total: steps.length })}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(storageKey, "1");
            } catch {}
            setHidden(true);
          }}
          className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-white/70 dark:hover:bg-slate-800"
        >
          {t("hide")}
        </button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-950">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                s.done ? "text-slate-500 dark:text-slate-400" : "bg-white font-medium shadow-sm hover:shadow dark:bg-slate-900",
              )}
            >
              {s.done ? <CheckCircle2 className="size-5 shrink-0 text-brand-600" /> : <Circle className="size-5 shrink-0 text-slate-300" />}
              <span className={cn("flex-1", s.done && "line-through")}>{t(`step_${s.key}`)}</span>
              {!s.done && <ChevronRight className="size-4 text-slate-400" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
