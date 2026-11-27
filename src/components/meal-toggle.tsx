"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setMeal, setMealHalf } from "@/lib/actions/mess";
import { fmtNumber } from "@/lib/format";
import type { MealKind } from "@/lib/types";
import { useFeedback } from "./feedback";
import { cn } from "./ui";

export function MealToggle({
  memberId,
  date,
  kind,
  on,
  locked,
  showLabel = true,
}: {
  memberId: string;
  date: string;
  kind: MealKind;
  on: boolean;
  locked: boolean;
  showLabel?: boolean;
}) {
  const t = useTranslations();
  const { toast } = useFeedback();
  const [val, setVal] = useState(on);
  const [pending, start] = useTransition();
  // follow the server value when it changes (e.g. after someone else edits it)
  const [seen, setSeen] = useState(on);
  if (seen !== on) {
    setSeen(on);
    setVal(on);
  }

  return (
    <button
      type="button"
      aria-pressed={val}
      disabled={locked || pending}
      title={locked ? t("meals.locked") : undefined}
      onClick={() => {
        const next = !val;
        setVal(next);
        start(async () => {
          const r = await setMeal(memberId, date, { [kind]: next });
          if (r.error) {
            setVal(!next);
            toast(t(`errors.${r.error}`), "error");
          }
        });
      }}
      className={cn(
        "min-h-9 min-w-16 rounded-lg border px-3 text-sm font-medium transition",
        val
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900",
        locked && "cursor-default opacity-50",
        pending && "animate-pulse",
      )}
    >
      {val ? "✓" : "✕"} {showLabel && t(`meal.${kind}`)}
    </button>
  );
}

export function GuestStepper({
  memberId,
  date,
  kind,
  count,
  locked,
}: {
  memberId: string;
  date: string;
  kind: MealKind;
  count: number;
  locked: boolean;
}) {
  const t = useTranslations();
  const { toast } = useFeedback();
  const locale = useLocale();
  const [val, setVal] = useState(count);
  const [pending, start] = useTransition();
  // follow the server value when it changes (e.g. after someone else edits it)
  const [seen, setSeen] = useState(count);
  if (seen !== count) {
    setSeen(count);
    setVal(count);
  }

  const change = (delta: number) => {
    const next = Math.max(0, Math.min(20, val + delta));
    if (next === val) return;
    const prev = val;
    setVal(next);
    start(async () => {
      const r = await setMeal(memberId, date, { [`guest_${kind}`]: next });
      if (r.error) {
        setVal(prev);
        toast(t(`errors.${r.error}`), "error");
      }
    });
  };

  const b =
    "grid size-8 place-items-center rounded-lg border border-slate-300 text-base leading-none transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:disabled:hover:bg-transparent";
  return (
    <span className={cn("inline-flex items-center gap-1", pending && "opacity-60")}>
      <button type="button" className={b} disabled={locked || val === 0} onClick={() => change(-1)} aria-label={`${t("common.decrease")} - ${t(`meal.${kind}`)} ${t("meal.guest")}`} data-step="-">−</button>
      <span className="w-5 text-center tabular-nums">{fmtNumber(locale, val)}</span>
      <button type="button" className={b} disabled={locked} onClick={() => change(1)} aria-label={`${t("common.increase")} - ${t(`meal.${kind}`)} ${t("meal.guest")}`} data-step="+">+</button>
    </span>
  );
}

/** Small "½" switch: the meal counts as half (switching it on also turns the meal on). */
export function HalfToggle({
  memberId, date, kind, half, locked,
}: { memberId: string; date: string; kind: MealKind; half: boolean; locked: boolean }) {
  const t = useTranslations();
  const { toast } = useFeedback();
  const [val, setVal] = useState(half);
  const [pending, start] = useTransition();
  // follow the server value when it changes (e.g. after someone else edits it)
  const [seen, setSeen] = useState(half);
  if (seen !== half) {
    setSeen(half);
    setVal(half);
  }
  return (
    <button
      type="button"
      aria-pressed={val}
      aria-label={t("meals.half")}
      title={t("meals.halfHelp")}
      disabled={locked || pending}
      onClick={() => {
        const next = !val;
        setVal(next);
        start(async () => {
          const r = await setMealHalf(memberId, date, kind, next);
          if (r.error) {
            setVal(!next);
            toast(t(`errors.${r.error}`), "error");
          }
        });
      }}
      className={cn(
        "grid size-8 place-items-center rounded-lg border text-xs font-bold leading-none transition",
        val
          ? "border-amber-500 bg-amber-400 text-amber-950"
          : "border-slate-200 text-slate-400 dark:border-slate-700",
        !val && !locked && "hover:border-slate-400",
        locked && "cursor-default opacity-50",
        pending && "animate-pulse",
      )}
    >
      ½
    </button>
  );
}

/**
 * Guests, folded away: "+ Add guest" (or "Guests: Dinner +1 · Edit" when there are some);
 * tap to open the − / + controls for each meal.
 */
export function GuestPanel({
  memberId, date, kinds, counts, lockedKinds,
}: {
  memberId: string;
  date: string;
  kinds: MealKind[];
  counts: Record<MealKind, number>;
  /** meals whose cutoff has passed for this person */
  lockedKinds: MealKind[];
}) {
  const locked = (k: MealKind) => lockedKinds.includes(k);
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const have = kinds.filter((k) => counts[k] > 0);
  const allLocked = kinds.every((k) => locked(k));
  if (allLocked && !have.length) return null; // nothing to show or change any more today

  return (
    <div className="text-sm">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
        >
          {have.length ? (
            <>
              {t("meals.guests")}: {have.map((k) => `${t(`meal.${k}`)} +${fmtNumber(locale, counts[k])}`).join(" · ")}
              {!allLocked && <span className="text-slate-500"> · {t("common.edit")}</span>}
            </>
          ) : (
            <>+ {t("meals.addGuest")}</>
          )}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          {kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span className="text-xs text-slate-500">{t(`meal.${k}`)}</span>
              <GuestStepper memberId={memberId} date={date} kind={k} count={counts[k]} locked={locked(k)} />
            </span>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            {t("common.close")}
          </button>
        </div>
      )}
    </div>
  );
}
