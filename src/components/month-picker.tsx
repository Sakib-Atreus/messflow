"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { btn, cn } from "./ui";

const fmt = (locale: string, opts: Intl.DateTimeFormatOptions, y: number, m = 0) =>
  new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));

/**
 * The month name in the month switcher: tap it to pick any month and year from a small calendar.
 * `month` and `thisMonth` are "YYYY-MM-01". Months after this month are shown but greyed out.
 */
export function MonthPicker({
  path, month, thisMonth, query = {},
}: { path: string; month: string; thisMonth: string; query?: Record<string, string> }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const box = useRef<HTMLDivElement>(null);
  const selY = Number(month.slice(0, 4)), selM = Number(month.slice(5, 7)) - 1;
  const nowY = Number(thisMonth.slice(0, 4)), nowM = Number(thisMonth.slice(5, 7)) - 1;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, selY]);

  const go = (y: number, m: number) => {
    setOpen(false);
    router.push({ pathname: path, query: { ...query, month: `${y}-${String(m + 1).padStart(2, "0")}` } });
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setYear(selY);
          setOpen(!open);
        }}
        className={cn(btn.small, "min-w-36 justify-between border-transparent bg-transparent font-semibold hover:border-slate-300 dark:bg-transparent")}
      >
        <CalendarDays className="size-4 text-brand-600 dark:text-brand-400" />
        {fmt(locale, { month: "long", year: "numeric" }, selY, selM)}
        <ChevronDown className={cn("size-4 opacity-60 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("pickMonth")}
          className="animate-in absolute left-0 z-40 mt-2 w-72 sm:left-auto sm:right-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {/* year */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={btn.icon} aria-label={t("prevYear")} onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-base font-bold tabular-nums">{fmt(locale, { year: "numeric" }, year)}</span>
            <button
              type="button"
              className={btn.icon}
              aria-label={t("nextYear")}
              disabled={year >= nowY}
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {/* months */}
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, m) => {
              const selected = year === selY && m === selM;
              const current = year === nowY && m === nowM;
              const future = year > nowY || (year === nowY && m > nowM);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={future}
                  aria-current={selected ? "date" : undefined}
                  onClick={() => go(year, m)}
                  className={cn(
                    "min-h-10 rounded-xl text-sm font-medium transition disabled:cursor-default disabled:opacity-35",
                    selected
                      ? "bg-brand-600 text-white shadow-sm"
                      : "hover:bg-brand-50 dark:hover:bg-brand-950/50",
                    !selected && current && "ring-2 ring-inset ring-brand-500/50 text-brand-700 dark:text-brand-400",
                  )}
                >
                  {fmt(locale, { month: "short" }, year, m)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <button type="button" className={btn.ghost} onClick={() => go(nowY, nowM)}>
              {t("thisMonth")}
            </button>
            <button type="button" className={btn.ghost} onClick={() => setOpen(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
