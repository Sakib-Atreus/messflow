import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, cn, Empty, Field, inputClass, PageTitle } from "@/components/ui";
import { assignDuty, deleteDuty, generateRoster, saveWeeklyDuty, setDutyDone, swapDuty } from "@/lib/actions/features";
import { CalendarDays, Repeat } from "lucide-react";
import { Tabs } from "@/components/tabs";
import { getContext } from "@/lib/mess";
import { addDays, monthEnd, monthStart, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getMembers } from "@/lib/queries";

type Duty = { id: string; date: string; member_id: string; done: boolean };

export default async function RosterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, can } = await getContext();
  const isStaff = can("roster");
  const t = await getTranslations();
  const today = todayDhaka();
  const from = monthStart(today);
  const until = addDays(today, 45);

  const [members, { data }, { data: weeklyRows }] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase
      .from("bazar_roster")
      .select("id, date, member_id, done")
      .eq("mess_id", mess.id)
      .gte("date", from)
      .lte("date", until > monthEnd(today) ? until : monthEnd(today))
      .order("date"),
    supabase.from("weekly_duty").select("weekday, member_id").eq("mess_id", mess.id),
  ]);
  const weekly = (weeklyRows ?? []) as { weekday: number; member_id: string }[];
  // Bangladesh week: Saturday first. Nov 22 2026 is a Sunday, so 22 + weekday gives a date with that weekday.
  const WEEK = [6, 0, 1, 2, 3, 4, 5];
  const dayName = (wd: number) => fmtDate(locale, `2026-11-${22 + wd}`, { weekday: "long" });
  const onDay = (wd: number) => weekly.filter((w) => w.weekday === wd).map((w) => w.member_id);
  const myDays = WEEK.filter((wd) => onDay(wd).includes(me.id));
  const duties = (data ?? []) as Duty[];
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "-";
  const active = members.filter((m) => m.status === "active");

  const upcoming = duties.filter((d) => d.date >= today);
  const byDate = new Map<string, Duty[]>();
  for (const d of upcoming) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);

  const myUpcoming = upcoming.filter((d) => d.member_id === me.id && !d.done);
  const othersUpcoming = upcoming.filter((d) => d.member_id !== me.id && !d.done);

  const monthDuties = duties.filter((d) => d.date <= monthEnd(today));
  const stats = active
    .map((m) => ({
      m,
      assigned: monthDuties.filter((d) => d.member_id === m.id).length,
      done: monthDuties.filter((d) => d.member_id === m.id && d.done).length,
      missed: monthDuties.filter((d) => d.member_id === m.id && !d.done && d.date < today).length,
    }))
    .filter((s) => s.assigned > 0);

  const dayLabel = (d: string) =>
    d === today ? t("common.today") : d === addDays(today, 1) ? t("common.tomorrow") : "";
  const longDate = (d: string) => fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="space-y-5">
      <PageTitle>{t("roster.title")}</PageTitle>

      {weekly.length > 0 && (
        <Card title={t("roster.weeklyTitle")} icon={CalendarDays}>
          {myDays.length > 0 && (
            <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950/50 dark:text-brand-200">
              {t("roster.yourDays", { days: myDays.map(dayName).join(", ") })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {WEEK.map((wd) => {
              const ids = onDay(wd);
              return (
                <div
                  key={wd}
                  className={cn(
                    "rounded-xl border p-2.5 text-sm",
                    ids.includes(me.id)
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                      : "border-slate-200 dark:border-slate-700",
                  )}
                >
                  <div className="text-xs font-medium text-slate-500">{dayName(wd)}</div>
                  <div className={cn("mt-0.5 font-medium", !ids.length && "text-slate-400")}>
                    {ids.length ? ids.map(nameOf).join(", ") : "-"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={t("roster.upcoming")}>
        {byDate.size === 0 ? (
          <Empty>{t("roster.none")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...byDate.entries()].map(([date, list]) => (
              <li key={date} className={cn("flex flex-wrap items-start gap-3 py-2.5", date === today && "font-medium")}>
                <div className="w-28 shrink-0 text-sm">
                  {longDate(date)}
                  {dayLabel(date) && <div className="text-xs text-brand-600">{dayLabel(date)}</div>}
                </div>
                <div className="flex flex-1 flex-wrap gap-2">
                  {list.map((d) => (
                    <span
                      key={d.id}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                        d.member_id === me.id ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-slate-200 dark:border-slate-700",
                      )}
                    >
                      {nameOf(d.member_id)}
                      {d.done && <Badge tone="green">✓ {t("roster.done")}</Badge>}
                      {isStaff && (
                        <>
                          <ActionButton action={setDutyDone.bind(null, d.id, !d.done)} className={btn.ghost} icon={d.done ? "undo" : "done"}>
                            {d.done ? t("roster.undo") : t("roster.markDone")}
                          </ActionButton>
                          <ActionButton action={deleteDuty.bind(null, d.id)} confirm={t("common.confirmDelete")} className={btn.icon} icon="delete" iconOnly>
                            ✕
                          </ActionButton>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">{t("roster.autoDone")}</p>
      </Card>

      {myUpcoming.length > 0 && othersUpcoming.length > 0 && (
        <Card title={t("roster.swap")}>
          <p className="mb-3 text-sm text-slate-500">{t("roster.swapHelp")}</p>
          <ActionForm action={swapDuty}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("roster.myDuty")}>
                <select name="mine" className={inputClass}>
                  {myUpcoming.map((d) => (
                    <option key={d.id} value={d.id}>{longDate(d.date)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("roster.theirDuty")}>
                <select name="other" className={inputClass}>
                  {othersUpcoming.map((d) => (
                    <option key={d.id} value={d.id}>
                      {longDate(d.date)} · {nameOf(d.member_id)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <SubmitButton>{t("roster.swap")}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {stats.length > 0 && (
        <Card title={t("roster.stats")}>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {stats.map(({ m, assigned, done, missed }) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.display_name}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">
                  {fmtNumber(locale, done)}/{fmtNumber(locale, assigned)} {t("roster.doneCount")}
                  {missed > 0 && <span className="ml-2 text-red-600">· {fmtNumber(locale, missed)} {t("roster.missed")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isStaff && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t("roster.planTitle")}>
            <Tabs
              initial="weekly"
              tabs={[
                {
                  key: "weekly",
                  label: t("roster.tabWeekly"),
                  icon: <CalendarDays className="size-4" />,
                  content: (
                    <ActionForm action={saveWeeklyDuty} reset={false}>
                      <p className="text-sm text-slate-500">{t("roster.weeklyHelp")}</p>
                      <div className="space-y-2">
                        {WEEK.map((wd) => {
                          const [a, b] = onDay(wd);
                          return (
                            <div key={wd} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2">
                              <span className="text-sm font-medium">{dayName(wd)}</span>
                              {[["a", a], ["b", b]].map(([slot, value]) => (
                                <select
                                  key={slot}
                                  name={`wd_${wd}_${slot}`}
                                  defaultValue={value ?? ""}
                                  aria-label={`${dayName(wd)} ${slot === "a" ? 1 : 2}`}
                                  className={`${inputClass} py-1.5 text-sm`}
                                >
                                  <option value="">{slot === "a" ? t("roster.nobody") : t("roster.secondPerson")}</option>
                                  {active.map((m) => (
                                    <option key={m.id} value={m.id}>{m.display_name}</option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <Field label={t("roster.weeklyFrom")} hint={t("roster.weeklyFromHelp")}>
                        <input type="date" name="from" defaultValue={addDays(today, 1)} required className={inputClass} />
                      </Field>
                      <SubmitButton>{t("roster.saveWeekly")}</SubmitButton>
                    </ActionForm>
                  ),
                },
                {
                  key: "rotation",
                  label: t("roster.tabRotation"),
                  icon: <Repeat className="size-4" />,
                  content: (
                    <div>
            <p className="mb-3 text-sm text-slate-500">{t("roster.generateHelp")}</p>
            <ActionForm action={generateRoster}>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">{t("roster.people")}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {active.map((m) => (
                    <label key={m.id} className="inline-flex items-center gap-2">
                      <input type="checkbox" name="members" value={m.id} defaultChecked className="size-4 accent-brand-600" />
                      {m.display_name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={t("roster.startWith")}>
                <select name="start_with" className={inputClass}>
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("meals.from")}>
                  <input type="date" name="from" defaultValue={addDays(today, 1)} required className={inputClass} />
                </Field>
                <Field label={t("meals.to")}>
                  <input type="date" name="to" defaultValue={monthEnd(addDays(today, 1))} required className={inputClass} />
                </Field>
                <Field label={t("roster.every")}>
                  <input type="number" name="every" min={1} max={14} defaultValue={1} className={inputClass} />
                </Field>
                <Field label={t("roster.perTurn")}>
                  <input type="number" name="per_turn" min={1} max={4} defaultValue={1} className={inputClass} />
                </Field>
              </div>
              <SubmitButton>{t("roster.generate")}</SubmitButton>
            </ActionForm>
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          <Card title={t("roster.assign")}>
            <ActionForm action={assignDuty}>
              <Field label={t("common.date")}>
                <input type="date" name="date" defaultValue={today} required className={inputClass} />
              </Field>
              <Field label={t("common.member")}>
                <select name="member_id" className={inputClass}>
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton className={btn.secondary}>{t("common.add")}</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
    </div>
  );
}
