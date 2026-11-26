import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Checkbox, Field, inputClass, PageTitle } from "@/components/ui";
import { BellRing, Calculator, UserPlus } from "lucide-react";
import { fmtDate, fmtNumber } from "@/lib/format";
import { updateMessSettings } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { intervalToMinutes } from "@/lib/dates";

const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { mess, can } = await getContext();
  const isManager = can("settings");
  const t = await getTranslations();
  const bMins = intervalToMinutes(mess.breakfast_cutoff);

  return (
    <div className="space-y-5">
      <PageTitle>{t("settings.title")}</PageTitle>
      {!isManager && <p className="text-sm text-slate-500">{t("settings.managerOnly")}</p>}

      <ActionForm action={updateMessSettings} reset={false}>
        <fieldset disabled={!isManager} className="space-y-5">
          <Card title={t("settings.mess")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("onboarding.messName")}>
                <input name="name" defaultValue={mess.name} required className={inputClass} />
              </Field>
              <Field label={t("onboarding.address")}>
                <input name="address" defaultValue={mess.address ?? ""} className={inputClass} />
              </Field>
            </div>
          </Card>

          <Card title={t("settings.mealRules")}>
            <div className="mb-4">
              <Checkbox name="breakfast_enabled" label={t("settings.enableBreakfast")} defaultChecked={mess.breakfast_enabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <div className="font-medium">{t("meal.breakfast")}</div>
                <Field label={t("settings.weight")} hint={t("settings.weightHelp")}>
                  <input name="breakfast_weight" type="number" step="0.25" min="0" defaultValue={mess.breakfast_weight} className={inputClass} />
                </Field>
                <Field label={t("settings.cutoff")}>
                  <input name="breakfast_cutoff" type="time" defaultValue={hhmm(bMins)} className={inputClass} />
                </Field>
                <Checkbox name="breakfast_prev_day" label={t("settings.prevDay")} defaultChecked={bMins < 0} />
              </div>
              {(["lunch", "dinner"] as const).map((k) => (
                <div key={k} className="space-y-2">
                  <div className="font-medium">{t(`meal.${k}`)}</div>
                  <Field label={t("settings.weight")}>
                    <input name={`${k}_weight`} type="number" step="0.25" min="0" defaultValue={mess[`${k}_weight`]} className={inputClass} />
                  </Field>
                  <Field label={t("settings.cutoff")}>
                    <input name={`${k}_cutoff`} type="time" defaultValue={hhmm(intervalToMinutes(mess[`${k}_cutoff`]))} className={inputClass} />
                  </Field>
                </div>
              ))}
            </div>
          </Card>
          <Card title={t("settings.calcTitle")} icon={Calculator}>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{t("settings.rounding")}</legend>
              {(["exact", "sheet"] as const).map((v) => (
                <label key={v} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 dark:border-slate-700 dark:has-[:checked]:bg-brand-950/30">
                  <input type="radio" name="meal_rate_rounding" value={v} defaultChecked={mess.meal_rate_rounding === v} className="mt-1 size-4 accent-brand-600" />
                  <span>
                    <span className="block text-sm font-medium">{t(`settings.round_${v}`)}</span>
                    <span className="block text-xs text-slate-500">{t(`settings.round_${v}Help`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field label={t("settings.lowDays")} hint={t("settings.lowDaysHelp")}>
              <select name="low_meal_days" defaultValue={String(mess.low_meal_days)} className={`${inputClass} sm:max-w-xs`}>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{t("settings.daysLeftOption", { n })}</option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title={t("settings.remindersTitle")} icon={BellRing}>
            <p className="-mt-1 mb-4 text-sm text-slate-500">{t("settings.remindersHelp")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.duesReminder")} hint={t("settings.duesReminderHelp")}>
                <div className="flex gap-2">
                  <select name="dues_reminder_day" defaultValue={mess.dues_reminder_day === null ? "off" : String(mess.dues_reminder_day)} className={inputClass}>
                    <option value="off">{t("settings.off")}</option>
                    {[6, 0, 1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>{fmtDate(locale, `2026-11-${22 + d}`, { weekday: "long" })}</option>
                    ))}
                  </select>
                  <input name="dues_reminder_time" type="time" defaultValue={hhmm(mess.dues_reminder_time)} className={`${inputClass} w-36`} />
                </div>
              </Field>
              <Field label={t("settings.dutyReminder")} hint={t("settings.dutyReminderHelp")}>
                <div className="flex items-center gap-3">
                  <Checkbox name="duty_reminder_on" label={t("settings.on")} defaultChecked={mess.duty_reminder_time !== null} />
                  <input name="duty_reminder_time" type="time" defaultValue={hhmm(mess.duty_reminder_time ?? 1200)} className={`${inputClass} w-36`} />
                </div>
              </Field>
              <Field label={t("settings.cutoffReminder")} hint={t("settings.cutoffReminderHelp")}>
                <select name="cutoff_reminder_min" defaultValue={mess.cutoff_reminder_min === null ? "off" : String(mess.cutoff_reminder_min)} className={inputClass}>
                  <option value="off">{t("settings.off")}</option>
                  {[30, 45, 60].map((m) => (
                    <option key={m} value={m}>{t("settings.minutesBefore", { n: fmtNumber(locale, m) })}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title={t("settings.newMemberTitle")} icon={UserPlus}>
            <p className="-mt-1 mb-3 text-sm text-slate-500">{t("settings.newMemberHelp")}</p>
            <div className="flex flex-wrap gap-4">
              {mess.breakfast_enabled && <Checkbox name="new_member_breakfast" label={t("meal.breakfast")} defaultChecked={mess.new_member_breakfast} />}
              <Checkbox name="new_member_lunch" label={t("meal.lunch")} defaultChecked={mess.new_member_lunch} />
              <Checkbox name="new_member_dinner" label={t("meal.dinner")} defaultChecked={mess.new_member_dinner} />
            </div>
          </Card>

          {isManager && <SubmitButton>{t("common.save")}</SubmitButton>}
        </fieldset>
      </ActionForm>
    </div>
  );
}
