import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Checkbox, Field, inputClass } from "@/components/ui";
import { cancelCookLeave, markCookLeave, reviewCookOffer } from "@/lib/actions/people";
import { addDays, todayDhaka } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import type { CookLeave } from "@/lib/leave";
import type { MealKind } from "@/lib/types";

/** Manager (inside the "Khala's leave" dialog): mark leave, answer "I'll cook" offers, cancel, see this month's leave days. */
export async function LeavePanel({ upcoming, past, kinds, locale }: { upcoming: CookLeave[]; past: CookLeave[]; kinds: MealKind[]; locale: string }) {
  const t = await getTranslations();
  const today = todayDhaka();
  const day = (d: string) => fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" });

  // this month's leave days, one line per date: "Mon 3 Nov - full day", "Wed 12 Nov - Lunch"
  const byDate = new Map<string, MealKind[]>();
  for (const l of past) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l.meal]);
  const record = [...byDate].map(([d, meals]) => `${day(d)} - ${meals.length === kinds.length ? t("leave.fullDay") : meals.map((k) => t(`meal.${k}`)).join(", ")}`);

  return (
    <div>
      <ActionForm action={markCookLeave}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("leave.from")}>
            <input type="date" name="from" required min={today} defaultValue={addDays(today, 1)} className={inputClass} />
          </Field>
          <Field label={t("leave.to")} hint={t("leave.toHint")}>
            <input type="date" name="to" min={today} className={inputClass} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          {kinds.map((k) => (
            <Checkbox key={k} name="meals" value={k} defaultChecked label={t(`meal.${k}`)} />
          ))}
        </div>
        <p className="text-xs text-slate-500">{t("leave.help")}</p>
        <SubmitButton>{t("leave.mark")}</SubmitButton>
      </ActionForm>

      {upcoming.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {upcoming.map((l) => {
            const cooks = l.offers.filter((o) => o.status === "approved");
            const waiting = l.offers.filter((o) => o.status === "pending");
            return (
              <li key={l.id} data-leave={`${l.date}:${l.meal}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{day(l.date)} · {t(`meal.${l.meal}`)}</span>{" "}
                    {cooks.length ? (
                      <Badge tone="green">{t("leave.willCook", { names: cooks.map((c) => c.name).join(", ") })}</Badge>
                    ) : (
                      <Badge tone="amber">{t("leave.mealOffShort")}</Badge>
                    )}
                  </div>
                  <ActionButton action={cancelCookLeave.bind(null, l.id)} className={btn.small} confirm={t("leave.cancelConfirm")}>
                    {t("leave.cancel")}
                  </ActionButton>
                </div>
                {waiting.map((o) => (
                  <div key={o.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
                    <span>{t("leave.offer", { name: o.name })}</span>
                    <div className="flex gap-2">
                      <ActionButton action={reviewCookOffer.bind(null, o.id, true)} className={btn.approve} icon="approve">
                        {t("common.approve")}
                      </ActionButton>
                      <ActionButton action={reviewCookOffer.bind(null, o.id, false)} className={btn.danger} icon="reject">
                        {t("common.reject")}
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
        <div className="font-medium">{t("leave.record")}</div>
        <p className="text-slate-500">{record.length ? record.join(" · ") : t("leave.noLeave")}</p>
      </div>
    </div>
  );
}
