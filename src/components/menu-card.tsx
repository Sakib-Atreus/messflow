import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { CookingPot, Repeat } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, cn, Field, inputClass } from "@/components/ui";
import { saveMenu, saveWeeklyMenu } from "@/lib/actions/people";
import type { MealKind } from "@/lib/types";
import { translateMenu } from "@/lib/dishes";
import { fmtDate } from "@/lib/format";
import { WEEK_ORDER, type DayMenu, type WeekDishes } from "@/lib/menu";

export type Menu = (Partial<Record<MealKind, string | null>> & { note?: string | null }) | null;

/**
 * "What to cook" for one day: the manager writes it, everyone else reads it.
 * `menu` is what people see (the day's own dishes, else the weekly menu). For the manager's form,
 * `daily` is only what was written for this day and `weekDishes` the weekly menu for this weekday,
 * shown as grey hints: an empty box means "use the weekly menu".
 */
export async function MenuCard({ date, dateLabel, kinds, menu, daily, weekDishes, canEdit, action, footer }: {
  date: string;
  dateLabel: string;
  kinds: MealKind[];
  menu: DayMenu;
  daily?: Menu;
  weekDishes?: WeekDishes;
  canEdit: boolean;
  /** shown in the card header (e.g. the "Khala's leave" button) */
  action?: ReactNode;
  /** a status line under the card body (e.g. khala's next leave) */
  footer?: ReactNode;
}) {
  const t = await getTranslations();
  const title = `${t("menu.title")} · ${dateLabel}`;
  if (canEdit) {
    const hasWeekly = kinds.some((k) => weekDishes?.[k]);
    return (
      <Card title={title} icon={CookingPot} action={action}>
        <ActionForm action={saveMenu} reset={false} key={date}>
          <input type="hidden" name="date" value={date} />
          <div className="grid gap-3 sm:grid-cols-2">
            {kinds.map((k) => (
              <Field key={k} label={t(`meal.${k}`)}>
                <input
                  name={k}
                  maxLength={200}
                  defaultValue={daily?.[k] ?? ""}
                  placeholder={weekDishes?.[k] ? t("menu.fromWeekly", { dish: weekDishes[k]! }) : t("menu.placeholder")}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {hasWeekly && <span className="font-medium text-slate-600 dark:text-slate-300">{t("menu.emptyUsesWeekly")} </span>}
            {t("menu.help")}
          </p>
          <Field label={t("menu.note")} hint={t("menu.noteHint")}>
            <textarea name="note" rows={2} maxLength={500} defaultValue={daily?.note ?? ""} placeholder={t("menu.notePlaceholder")} className={inputClass} />
          </Field>
          <SubmitButton>{t("menu.save")}</SubmitButton>
        </ActionForm>
        {footer}
      </Card>
    );
  }
  const set = kinds.filter((k) => menu?.[k]);
  const locale = await getLocale();
  return (
    <Card title={title} icon={CookingPot} action={action}>
      {set.length ? (
        <dl className="space-y-1.5">
          {set.map((k) => (
            <div key={k} className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-500">{t(`meal.${k}`)}</dt>
              <dd className="font-medium">
                {translateMenu(menu![k], locale)}
                {menu?.weekly?.[k] && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-slate-400" title={t("menu.weekly")}>
                    <Repeat className="size-3" /> {t("menu.weeklyShort")}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-slate-500">{t("menu.notSet")}</p>
      )}
      {footer}
    </Card>
  );
}

/** Manager: the weekly menu, Saturday → Friday. Written once, it repeats every week. */
export async function WeeklyMenuForm({ kinds, week }: { kinds: MealKind[]; week: Map<number, WeekDishes> }) {
  const t = await getTranslations();
  const locale = await getLocale();
  // 22 Nov 2026 was a Sunday, so 22 + weekday number gives a date with that weekday's name
  const dayName = (d: number) => fmtDate(locale, `2026-11-${22 + d}`, { weekday: "long" });
  return (
    <ActionForm action={saveWeeklyMenu} reset={false}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t("menu.weeklyHelp")}</p>
      {/* column headings on wider screens (on phones each box has its own label) */}
      <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[8rem_1fr]">
        <span />
        <div className={kinds.length === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
          {kinds.map((k) => <span key={k} className="px-1">{t(`meal.${k}`)}</span>)}
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {WEEK_ORDER.map((d) => (
          <div key={d} data-weekday={d} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
            <div className="font-semibold">{dayName(d)}</div>
            <div className={kinds.length === 3 ? "grid gap-2 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
              {kinds.map((k) => (
                <label key={k} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:block">
                  <span className="text-sm text-slate-500 sm:hidden">{t(`meal.${k}`)}</span>
                  <input
                    name={`${d}_${k}`}
                    maxLength={200}
                    defaultValue={week.get(d)?.[k] ?? ""}
                    placeholder={t(`meal.${k}`)}
                    aria-label={`${dayName(d)} - ${t(`meal.${k}`)}`}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <SubmitButton>{t("menu.weeklySave")}</SubmitButton>
    </ActionForm>
  );
}

/** Members: this week's menu, Saturday → Friday, read-only. Today is highlighted, past days are faded. */
export async function WeekMenuList({ days, kinds, today }: { days: { date: string; menu: DayMenu }[]; kinds: MealKind[]; today: string }) {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {days.map(({ date, menu }) => {
        const isToday = date === today;
        return (
          <li
            key={date}
            data-day={date}
            className={cn(
              "grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-3",
              isToday && "-mx-3 rounded-xl bg-brand-50 px-3 dark:bg-brand-950/40",
              date < today && "opacity-60",
            )}
          >
            <div className="font-semibold">
              {fmtDate(locale, date, { weekday: "long" })}
              <span className="ml-1.5 text-sm font-normal text-slate-500">{fmtDate(locale, date, { day: "numeric", month: "short" })}</span>
              {isToday && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">{t("menu.today")}</span>}
            </div>
            <dl className="space-y-0.5">
              {kinds.map((k) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-16 shrink-0 text-slate-500">{t(`meal.${k}`)}</dt>
                  <dd className={menu?.[k] ? "font-medium" : "text-slate-400"}>{menu?.[k] ? translateMenu(menu[k], locale) : "-"}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** One short line for the dashboard: "Lunch: rice, chicken · Dinner: fish". Null when nothing is set. */
export function menuLine(menu: Menu, kinds: MealKind[], label: (k: MealKind) => string, locale: string): string | null {
  const parts = kinds.filter((k) => menu?.[k]).map((k) => `${label(k)}: ${translateMenu(menu![k], locale)}`);
  return parts.length ? parts.join(" · ") : null;
}
