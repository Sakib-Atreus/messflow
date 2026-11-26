"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setMeal } from "@/lib/actions/mess";
import { fmtNumber } from "@/lib/format";
import type { MealKind } from "@/lib/types";
import { useFeedback } from "./feedback";
import { cn } from "./ui";

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  meals: Partial<Record<MealKind, { on: boolean; half: boolean }>>;
  locked: MealKind[];
};

/** A month of one person's meals; tap L / D (and B) to switch a meal on or off. */
export function MealCalendar({ memberId, days, kinds, weekdays }: { memberId: string; days: CalendarDay[]; kinds: MealKind[]; weekdays: string[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const { toast } = useFeedback();
  const [state, setState] = useState(() => Object.fromEntries(days.map((d) => [d.date, d.meals])));
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const toggle = (date: string, k: MealKind) => {
    const cur = state[date]?.[k];
    if (!cur) return;
    const next = !cur.on;
    setState((s) => ({ ...s, [date]: { ...s[date], [k]: { on: next, half: next ? cur.half : false } } }));
    setBusy(`${date}${k}`);
    start(async () => {
      const r = await setMeal(memberId, date, { [k]: next });
      setBusy(null);
      if (r.error) {
        setState((s) => ({ ...s, [date]: { ...s[date], [k]: cur } }));
        toast(t(`errors.${r.error}`), "error");
      }
    });
  };

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            className={cn(
              "flex min-h-[4.25rem] flex-col rounded-xl border p-1 sm:p-1.5",
              !d.inMonth && "border-transparent opacity-30",
              d.inMonth && "border-slate-200 dark:border-slate-700",
              d.isToday && "border-brand-500 ring-2 ring-brand-500/20",
            )}
          >
            <span className={cn("text-xs tabular-nums", d.isToday ? "font-bold text-brand-700 dark:text-brand-400" : "text-slate-500")}>
              {fmtNumber(locale, Number(d.date.slice(8)), 0)}
            </span>
            {d.inMonth && (
              <div className="mt-auto flex flex-wrap gap-0.5 sm:gap-1">
                {kinds.map((k) => {
                  const m = state[d.date]?.[k];
                  const locked = d.locked.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={locked || busy === `${d.date}${k}`}
                      onClick={() => toggle(d.date, k)}
                      aria-pressed={!!m?.on}
                      aria-label={`${t(`meal.${k}`)} ${d.date}`}
                      title={t(`meal.${k}`)}
                      className={cn(
                        "grid h-6 min-w-6 flex-1 place-items-center rounded-md text-[10px] font-bold transition sm:h-7",
                        m?.on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800",
                        locked && "cursor-default opacity-50",
                        busy === `${d.date}${k}` && "animate-pulse",
                      )}
                    >
                      {m?.on && m.half ? "½" : t(`meal.${k}`).slice(0, 1)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
