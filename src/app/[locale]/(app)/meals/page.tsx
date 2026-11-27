import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChefHat, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { GuestPanel, GuestStepper, HalfToggle, MealToggle } from "@/components/meal-toggle";
import { MealCalendar, type CalendarDay } from "@/components/meal-calendar";
import { MenuCard, WeeklyMenuForm, type Menu } from "@/components/menu-card";
import { getDayMenu, getWeeklyMenu, weekdayOf } from "@/lib/menu";
import { LeaveBanner } from "@/components/leave-banner";
import { LeavePanel } from "@/components/leave-panel";
import { Drawer } from "@/components/drawer";
import { closedByLeave, getLeaves } from "@/lib/leave";
import { btn, Card, Checkbox, Field, inputClass, PageTitle } from "@/components/ui";
import { setMealRange, updateMyDefaults } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { addDays, addMonths, intervalToMinutes, isPastCutoff, isValidDate, monthEnd, monthStart, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMonth, fmtNumber, fmtTime } from "@/lib/format";
import type { Meal } from "@/lib/types";
import { activeOn, effectiveMeal, getMealsBetween, getMembers, mealKinds, mealValue } from "@/lib/queries";

export default async function MealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; cal?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { supabase, mess, me, can, isVirtual, isManager } = await getContext();
  const isStaff = can("meals");
  const t = await getTranslations();
  const today = todayDhaka();
  const day = isValidDate(sp.date) ? sp.date : today;
  const kinds = mealKinds(mess);
  // calendar month (?cal=YYYY-MM), Saturday-first weeks like the bazar roster
  const calMonth = sp.cal && /^\d{4}-\d{2}$/.test(sp.cal) ? `${sp.cal}-01` : monthStart(today);
  const calEnd = monthEnd(calMonth);
  // khala's leave: this month so far, the next month ahead, the calendar month and the chosen day
  const leaveFrom = [monthStart(today), calMonth, day].sort()[0];
  const leaveTo = [addDays(today, 31), calEnd, day].sort()[2];
  const gridStart = addDays(calMonth, -((new Date(`${calMonth}T00:00:00Z`).getUTCDay() + 1) % 7));
  const gridEnd = addDays(calEnd, (5 - new Date(`${calEnd}T00:00:00Z`).getUTCDay() + 7) % 7);

  const [leaves, members, dayMeals, myMonth, { data: dailyMenu }, dayMenu, week] = await Promise.all([
    getLeaves(supabase, mess.id, leaveFrom, leaveTo),
    getMembers(supabase, mess.id),
    getMealsBetween(supabase, mess.id, day, day),
    supabase.from("meals").select("*").eq("member_id", me.id).gte("date", calMonth).lte("date", calEnd),
    supabase.from("meal_menus").select("breakfast, lunch, dinner, note").eq("mess_id", mess.id).eq("date", day).maybeSingle(),
    // what people see that day: its own dishes, else the weekly menu
    getDayMenu(supabase, mess.id, day),
    isManager ? getWeeklyMenu(supabase, mess.id) : Promise.resolve(new Map()),
  ]);
  const closed = closedByLeave(leaves);
  const upcoming = leaves.filter((l) => l.date >= today);
  const pendingOffers = upcoming.reduce((n, l) => n + l.offers.filter((o) => o.status === "pending").length, 0);
  const locked = (date: string, k: (typeof kinds)[number]) => !isStaff && (isPastCutoff(date, mess[`${k}_cutoff`]) || closed(date, k));
  const weekdays = [6, 0, 1, 2, 3, 4, 5].map((d) => fmtDate(locale, `2026-11-${22 + d}`, { weekday: "short" }));
  const calendarDays: CalendarDay[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const inMonth = d >= calMonth && d <= calEnd;
    const row = ((myMonth.data ?? []) as Meal[]).find((x) => x.date === d);
    const meal = effectiveMeal(mess, me, d, row);
    const active = activeOn(me, d);
    calendarDays.push({
      date: d,
      inMonth,
      isToday: d === today,
      meals: Object.fromEntries(kinds.map((k) => [k, { on: !!meal[k], half: !!meal[`half_${k}`] }])),
      locked: kinds.filter((k) => !active || locked(d, k)),
    });
  }
  const shown = members.filter((m) => activeOn(m, day) || dayMeals.some((x) => x.member_id === m.id));
  const rows = shown.map((m) => ({ m, meal: effectiveMeal(mess, m, day, dayMeals.find((x) => x.member_id === m.id)) }));
  const totals = kinds.map((k) => rows.reduce((a, r) => a + mealValue(r.meal, k) + r.meal[`guest_${k}`], 0));
  const dayLabel =
    day === today ? t("common.today") : day === addDays(today, 1) ? t("common.tomorrow") : day === addDays(today, -1) ? t("common.yesterday") : "";

  return (
    <div className="space-y-5">
      <PageTitle>{t("meals.title")}</PageTitle>

      <p className="text-sm text-slate-500">
        {kinds.map((k) => `${t(`meal.${k}`)}: ${t("meals.cutoff", { time: fmtTime(locale, intervalToMinutes(mess[`${k}_cutoff`])) })}`).join(" · ")}
      </p>

      <MenuCard
        date={day}
        dateLabel={dayLabel || fmtDate(locale, day, { weekday: "short", day: "numeric", month: "short" })}
        kinds={kinds}
        menu={dayMenu}
        daily={dailyMenu as Menu}
        weekDishes={week.get(weekdayOf(day))}
        canEdit={isManager}
        action={
          isManager && (
            <div className="flex flex-wrap gap-2">
            <Drawer label={t("menu.weekly")} title={t("menu.weeklyTitle")} icon="week" side={false} wide className={btn.small}>
              <WeeklyMenuForm kinds={kinds} week={week} />
            </Drawer>
            <Drawer
              label={t("leave.title")}
              title={t("leave.title")}
              icon="chef"
              side={false}
              className={btn.small}
              badge={pendingOffers}
            >
              <LeavePanel upcoming={upcoming} past={leaves.filter((l) => l.date >= monthStart(today) && l.date < today)} kinds={kinds} locale={locale} />
            </Drawer>
            </div>
          )
        }
        footer={
          isManager && upcoming.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <ChefHat className="size-4 shrink-0" />
              {t("leave.next", { when: `${fmtDate(locale, upcoming[0].date, { weekday: "short", day: "numeric", month: "short" })} · ${upcoming.filter((l) => l.date === upcoming[0].date).map((l) => t(`meal.${l.meal}`)).join(", ")}` })}
              {pendingOffers > 0 && <span className="font-semibold">· {t("pending.cookOffers", { count: pendingOffers })}</span>}
            </p>
          )
        }
      />

      {!isManager && (
        <LeaveBanner
          leaves={leaves.filter((l) => l.date >= today && l.date <= addDays(today, 7))}
          locale={locale}
          myMemberId={isVirtual ? null : me.id}
        />
      )}

      {/* ---- everyone, one day ---- */}
      <Card
        title={t("meals.everyone")}
        action={
          <div className="flex items-center gap-2">
            <Link href={{ pathname: "/meals", query: { date: addDays(day, -1) } }} className={btn.small} aria-label={t("common.prev")}>
              <ChevronLeft className="size-4" />
            </Link>
            <span className="text-center text-sm font-medium">
              {fmtDate(locale, day, { weekday: "short", day: "numeric", month: "short" })}
              {dayLabel && <span className="block text-xs text-slate-500">{dayLabel}</span>}
            </span>
            <Link href={{ pathname: "/meals", query: { date: addDays(day, 1) } }} className={btn.small} aria-label={t("common.next")}>
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-sm sm:min-w-[28rem]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 font-medium">{t("common.member")}</th>
                {kinds.map((k) => (
                  <th key={k} className="py-2 font-medium">{t(`meal.${k}`)}</th>
                ))}
                <th className="hidden py-2 font-medium sm:table-cell">{t("meals.guests")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ m, meal }) => {
                const canEdit = isStaff || m.id === me.id;
                return (
                  <tr key={m.id}>
                    <td className="py-2 pr-2">
                      {m.display_name}
                      {m.id === me.id && <span className="text-xs text-slate-500"> ({t("common.you")})</span>}
                      {canEdit && (
                        <details className="mt-1 sm:hidden">
                          <summary className="mf-sum -ml-2.5 text-xs">
                            {t("meals.guests")}
                            {kinds.some((k) => meal[`guest_${k}`] > 0) &&
                              ` (${fmtNumber(locale, kinds.reduce((a, k) => a + meal[`guest_${k}`], 0))})`}
                          </summary>
                          <div className="mt-1 space-y-1">
                            {kinds.map((k) => (
                              <div key={k} className="flex items-center gap-2 text-xs">
                                <span className="w-12 text-slate-500">{t(`meal.${k}`)}</span>
                                <GuestStepper memberId={m.id} date={day} kind={k} count={meal[`guest_${k}`]} locked={locked(day, k)} />
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                    {kinds.map((k) => (
                      <td key={k} className="py-2 pr-2">
                        {canEdit ? (
                          <span className="inline-flex items-center gap-1">
                            <MealToggle memberId={m.id} date={day} kind={k} on={meal[k]} locked={locked(day, k)} showLabel={false} />
                            <HalfToggle memberId={m.id} date={day} kind={k} half={meal[`half_${k}`]} locked={locked(day, k)} />
                          </span>
                        ) : (
                          <span className={meal[k] ? "text-brand-600" : "text-slate-400"}>
                            {meal[k] ? (meal[`half_${k}`] ? "½" : "✓") : "✕"}
                          </span>
                        )}
                        {!canEdit && meal[`guest_${k}`] > 0 && (
                          <span className="ml-1 text-xs text-slate-500 sm:hidden">+{fmtNumber(locale, meal[`guest_${k}`])}</span>
                        )}
                      </td>
                    ))}
                    <td className="hidden space-y-1 py-2 sm:table-cell">
                      {canEdit ? (
                        <GuestPanel
                          memberId={m.id}
                          date={day}
                          kinds={kinds}
                          counts={{ breakfast: meal.guest_breakfast, lunch: meal.guest_lunch, dinner: meal.guest_dinner }}
                          lockedKinds={kinds.filter((k) => locked(day, k))}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">
                          {kinds.filter((k) => meal[`guest_${k}`] > 0).map((k) => `${t(`meal.${k}`)} +${fmtNumber(locale, meal[`guest_${k}`])}`).join(" · ") || "-"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                <td className="py-2">{t("common.total")}</td>
                {totals.map((n, i) => (
                  <td key={kinds[i]} className="py-2 tabular-nums">{fmtNumber(locale, n)}</td>
                ))}
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ---- my month on a calendar ---- */}
      {!isVirtual && (
        <Card
          title={`${t("meals.mine")} · ${fmtMonth(locale, calMonth)}`}
          action={
            <div className="flex items-center gap-1">
              <Link href={{ pathname: "/meals", query: { ...(sp.date ? { date: sp.date } : {}), cal: addMonths(calMonth, -1).slice(0, 7) } }} className={btn.icon} aria-label={t("common.prev")}>
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={{ pathname: "/meals", query: { ...(sp.date ? { date: sp.date } : {}), cal: addMonths(calMonth, 1).slice(0, 7) } }} className={btn.icon} aria-label={t("common.next")}>
                <ChevronRight className="size-4" />
              </Link>
            </div>
          }
        >
          <p className="-mt-1 mb-3 text-xs text-slate-500">{t("meals.calendarHelp")}</p>
          <MealCalendar memberId={me.id} kinds={kinds} weekdays={weekdays} days={calendarDays} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("meals.range")}>
          <p className="mb-3 text-sm text-slate-500">{t("meals.rangeHelp")}</p>
          <ActionForm action={setMealRange}>
            {isStaff && (
              <Field label={t("common.member")}>
                <select name="member_id" defaultValue={me.id} className={inputClass}>
                  {members.filter((m) => m.status === "active").map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("meals.from")}>
                <input type="date" name="from" required defaultValue={addDays(today, 1)} className={inputClass} />
              </Field>
              <Field label={t("meals.to")}>
                <input type="date" name="to" required defaultValue={addDays(today, 7)} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              {kinds.map((k) => (
                <Checkbox key={k} name={k} label={t(`meal.${k}`)} defaultChecked />
              ))}
            </div>
            <Field label={t("meals.mode")}>
              <select name="mode" className={inputClass} defaultValue="off">
                <option value="off">{t("meals.turnOff")}</option>
                <option value="on">{t("meals.turnOn")}</option>
              </select>
            </Field>
            <SubmitButton>{t("meals.apply")}</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={t("meals.defaults")}>
          <p className="mb-3 text-sm text-slate-500">{t("meals.defaultsHelp")}</p>
          <ActionForm action={updateMyDefaults} reset={false}>
            <div className="flex flex-wrap gap-4">
              {mess.breakfast_enabled ? (
                <Checkbox name="breakfast" label={t("meal.breakfast")} defaultChecked={me.default_breakfast} />
              ) : (
                <input type="hidden" name="breakfast" value={me.default_breakfast ? "on" : ""} />
              )}
              <Checkbox name="lunch" label={t("meal.lunch")} defaultChecked={me.default_lunch} />
              <Checkbox name="dinner" label={t("meal.dinner")} defaultChecked={me.default_dinner} />
            </div>
            <SubmitButton>{t("common.save")}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
