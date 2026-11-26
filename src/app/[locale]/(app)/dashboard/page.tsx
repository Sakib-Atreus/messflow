import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Banknote, BarChart3, CalendarCheck, ChefHat, CookingPot, Megaphone, PieChart, PiggyBank, Receipt, Scale, ShoppingCart, TrendingUp,
  Sheet, UserCheck, UserPlus, UtensilsCrossed, Wallet,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GuestPanel, MealToggle } from "@/components/meal-toggle";
import { WhatsAppButton } from "@/components/copy-button";
import { RemindDuesButton } from "@/components/remind-dues-button";
import { BalanceBars, BreakdownBars, CumulativeLines, DailyBars, Legend } from "@/components/charts";
import { Alert, Avatar, Badge, btn, Card, cn, Empty, Stat } from "@/components/ui";
import { getContext } from "@/lib/mess";
import { getDueReach } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, isPastCutoff, monthEnd, monthStart, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtMonth, fmtNumber } from "@/lib/format";
import { countMeals, effectiveMeal, getAvatars, getMealsBetween, getMembers, getMonthSummary, mealKinds, weightedMeals } from "@/lib/queries";
import { mealWallet } from "@/lib/meal-wallet";
import { MealMoneyCard, MealMoneyOverview } from "@/components/meal-money";
import { SetupChecklist } from "@/components/setup-checklist";
import { menuLine, type Menu } from "@/components/menu-card";
import { LeaveBanner } from "@/components/leave-banner";
import { closedByLeave, getLeaves } from "@/lib/leave";
import { getOpening } from "@/lib/opening";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, can, isStaff, isManager, isVirtual, profile } = await getContext();
  const t = await getTranslations();
  const today = todayDhaka();
  const month = monthStart(today);
  const kinds = mealKinds(mess);
  const tomorrow = addDays(today, 1);

  const [summary, monthMeals, pending, joins, members, dueReach, duties, notice, deposits, bazar, fixed, { data: menuRow }] = await Promise.all([
    getMonthSummary(supabase, mess.id, month),
    getMealsBetween(supabase, mess.id, month, today),
    can("deposits")
      ? supabase.from("deposits").select("id", { count: "exact", head: true }).eq("mess_id", mess.id).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    can("members")
      ? supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("mess_id", mess.id).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    getMembers(supabase, mess.id),
    // who owes + whether a push can reach them (service role: reads other people's subscriptions)
    can("deposits") ? getDueReach(createAdminClient(), mess) : Promise.resolve([]),
    supabase.from("bazar_roster").select("date, member_id, done").eq("mess_id", mess.id).in("date", [today, tomorrow]),
    supabase
      .from("notices")
      .select("id, title, pinned, created_at")
      .eq("mess_id", mess.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("deposits").select("member_id, date, amount").eq("mess_id", mess.id).eq("status", "approved").gte("date", month).lte("date", today),
    supabase.from("bazar_entries").select("date, amount").eq("mess_id", mess.id).gte("date", month).lte("date", today),
    supabase.from("fixed_costs").select("category, amount").eq("mess_id", mess.id).eq("month", month),
    supabase.from("meal_menus").select("breakfast, lunch, dinner").eq("mess_id", mess.id).eq("date", today).maybeSingle(),
  ]);
  const todayMenu = menuLine(menuRow as Menu, kinds, (k) => t(`meal.${k}`), locale);
  const leaves = await getLeaves(supabase, mess.id, today, tomorrow);
  const closed = closedByLeave(leaves);
  const opening = await getOpening(supabase, mess.id);
  const carryLabel = opening.month === month ? t("opening.line") : t("report.carryIn");
  const todayMeals = monthMeals.filter((m) => m.date === today);
  // first-time setup for managers: which steps are already done
  const setup = isManager && !isVirtual
    ? await Promise.all([
        supabase.from("weekly_duty").select("id", { count: "exact", head: true }).eq("mess_id", mess.id),
        supabase.from("bazar_roster").select("id", { count: "exact", head: true }).eq("mess_id", mess.id).gte("date", today),
        supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", me.user_id ?? ""),
      ]).then(([weekly, roster, push]) => [
        { key: "members", done: members.filter((m) => m.status === "active").length >= 2, href: "/members" },
        { key: "logins", done: members.some((m) => m.user_id && m.id !== me.id), href: "/members" },
        { key: "bills", done: (fixed.data ?? []).length > 0, href: "/costs" },
        { key: "duty", done: (weekly.count ?? 0) + (roster.count ?? 0) > 0, href: "/roster" },
        { key: "notify", done: (push.count ?? 0) > 0, href: "/more" },
        // old notebook balances: optional, and only until the first month is closed
        ...(opening.locked ? [] : [{ key: "opening", done: opening.amounts.size > 0, href: "/members?opening=1", optional: true }]),
      ])
    : null;
  const avatars = await getAvatars(supabase, members.map((m) => m.user_id));
  const photoOf = (memberId: string) => {
    const uid = members.find((m) => m.id === memberId)?.user_id;
    return uid ? avatars.get(uid) ?? null : null;
  };

  const dutyNames = (d: string) =>
    (duties.data ?? [])
      .filter((x) => x.date === d)
      .map((x) => `${members.find((m) => m.id === x.member_id)?.display_name ?? "-"}${x.done ? " ✓" : ""}`)
      .join(", ") || t("dashboard.dutyNone");
  const iAmOnDuty = (duties.data ?? []).some((x) => x.member_id === me.id && !x.done);
  // show a notice if it's pinned or less than 7 days old
  const latestNotice =
    notice.data && (notice.data.pinned || Date.now() - Date.parse(notice.data.created_at) < 7 * 86400_000) ? notice.data : null;

  const mine = summary.members.find((m) => m.member_id === me.id);
  const myToday = effectiveMeal(mess, me, today, todayMeals.find((m) => m.member_id === me.id));
  const dues = summary.members.filter((m) => m.balance < 0).sort((a, b) => a.balance - b.balance);
  const messCash = summary.members.reduce((a, m) => a + m.carry_in + m.deposits, 0) - summary.total_bazar - summary.total_fixed;
  const counts = kinds.map((k) => ({ kind: k, ...countMeals(todayMeals, k) }));
  const cookText = [
    `${mess.name} · ${fmtDate(locale, today, { weekday: "long", day: "numeric", month: "long" })}`,
    ...counts.map((c) => `${t(`meal.${c.kind}`)}: ${fmtNumber(locale, c.members + c.guests)}${c.guests ? ` (${t("meal.guest")} ${fmtNumber(locale, c.guests)})` : ""}`),
  ].join("\n");
  const showCarryWarning = isStaff && !summary.prev_month_closed && mess.created_at.slice(0, 10) < month;
  const balance = mine?.balance ?? 0;
  const settled = Math.abs(balance) < 0.005;
  const pendingDeposits = pending.count ?? 0;
  const pendingJoins = joins.count ?? 0;

  // ---- chart data: every day of this month up to today
  const days: string[] = [];
  for (let d = month; d <= today; d = addDays(d, 1)) days.push(d);
  const dayAxis = days.map((d) => ({
    key: d,
    tick: fmtNumber(locale, Number(d.slice(8)), 0),
    title: fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" }),
  }));
  const mealsPerDay = days.map((d, i) => {
    const rows = monthMeals.filter((m) => m.date === d);
    const c = kinds.map((k) => countMeals(rows, k));
    const guests = c.reduce((a, x) => a + x.guests, 0);
    return {
      ...dayAxis[i],
      value: c.reduce((a, x) => a + x.members + x.guests, 0),
      note: guests ? `${t("meal.guest")} ${fmtNumber(locale, guests)}` : undefined,
    };
  });
  const perDay = (rows: { date: string; amount: number }[] | null) =>
    days.map((d) => (rows ?? []).filter((r) => r.date === d).reduce((a, r) => a + Number(r.amount), 0));
  const cumulative = (xs: number[]) => xs.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
  const moneyIn = cumulative(perDay(deposits.data));
  const spent = cumulative(perDay(bazar.data));
  const hasMoney = (moneyIn[moneyIn.length - 1] ?? 0) > 0 || (spent[spent.length - 1] ?? 0) > 0;

  const byCategory = new Map<string, number>();
  for (const f of fixed.data ?? []) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + Number(f.amount));
  const breakdown = [
    { label: t("nav.bazar"), value: summary.total_bazar },
    ...[...byCategory].map(([c, v]) => ({
      label: t.has(`costs.categories.${c}`) ? t(`costs.categories.${c}` as "costs.categories.other") : c,
      value: v,
    })),
  ]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const balances = [...summary.members]
    .map((m) => ({ id: m.member_id, label: m.display_name, value: m.balance }))
    .sort((a, b) => a.value - b.value);
  // meal money: what's left of each person's payments after bills, and how fast it goes
  const walletOf = (memberId: string) => {
    const row = summary.members.find((x) => x.member_id === memberId);
    if (!row) return null;
    const mealsByDay: Record<string, number> = {};
    for (const r of monthMeals) if (r.member_id === memberId) mealsByDay[r.date] = weightedMeals(mess, r);
    return mealWallet({
      lowDays: mess.low_meal_days,
      month, monthEnd: monthEnd(month), today, rate: summary.meal_rate, bills: row.fixed_share, carry: row.carry_in, balance: row.balance,
      deposits: (deposits.data ?? []).filter((d) => d.member_id === memberId), mealsByDay,
    });
  };
  const myWallet = !isVirtual ? walletOf(me.id) : null;
  const urgency = { out: 0, low: 1, ok: 2, idle: 3 } as const;
  const everyone = isStaff
    ? summary.members
        .map((m) => ({ m, w: walletOf(m.member_id)! }))
        .filter((x) => x.w)
        .sort((a, b) => urgency[a.w.status] - urgency[b.w.status] || a.w.left - b.w.left)
        .map(({ m, w }) => ({
          id: m.member_id,
          name: m.display_name,
          phone: members.find((x) => x.id === m.member_id)?.phone ?? null,
          photo: photoOf(m.member_id),
          status: w.status,
          left: w.left,
          perDay: w.perDay,
          daysLeft: w.daysLeft,
          runOut: w.runOut,
          ranOutOn: w.ranOutOn,
          suggest: w.suggest,
          lastsMonth: w.lastsMonth,
          endLeft: w.endLeft,
        }))
    : [];
  const avgMeals = mealsPerDay.length ? mealsPerDay.reduce((a, d) => a + d.value, 0) / mealsPerDay.length : 0;

  const quick = [
    can("bazar") && { href: "/bazar", label: t("dashboard.qBazar"), Icon: ShoppingCart },
    can("deposits") && { href: "/deposits", label: t("dashboard.qDeposit"), Icon: Wallet },
    can("meals") && { href: "/meals", label: t("dashboard.qMeals"), Icon: UtensilsCrossed },
    can("members") && { href: "/members", label: t("dashboard.qMember"), Icon: UserPlus },
    can("notices") && { href: "/notices", label: t("dashboard.qNotice"), Icon: Megaphone },
    can("costs") && { href: "/costs", label: t("dashboard.qCost"), Icon: Receipt },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof Wallet }[];

  const roleLabel = isVirtual ? t("roles.superAdmin") : isManager ? t("roles.manager") : (me.mess_role?.name ?? t("roles.member"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={me.display_name} src={profile?.avatar_url} className="size-12 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{t("dashboard.hello", { name: me.display_name })}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {fmtDate(locale, today, { weekday: "long", day: "numeric", month: "long" })} · {fmtMonth(locale, month)}
            </p>
          </div>
        </div>
        <Badge tone={isStaff ? "blue" : "slate"}>{roleLabel}</Badge>
      </div>

      {setup && <SetupChecklist messId={mess.id} steps={setup} />}

      {/* things waiting for this person */}
      {(pendingJoins > 0 || pendingDeposits > 0) && (
        <div className={cn("grid gap-3", pendingJoins > 0 && pendingDeposits > 0 && "sm:grid-cols-2")}>
          {pendingJoins > 0 && (
            <Link href="/members">
              <Alert className="flex items-center gap-3">
                <UserCheck className="size-5 shrink-0" />
                <span className="font-medium">{t("dashboard.pendingJoins", { count: pendingJoins })}</span>
              </Alert>
            </Link>
          )}
          {pendingDeposits > 0 && (
            <Link href="/deposits">
              <Alert className="flex items-center gap-3">
                <Wallet className="size-5 shrink-0" />
                <span className="font-medium">{t("dashboard.pendingDeposits", { count: pendingDeposits })}</span>
              </Alert>
            </Link>
          )}
        </div>
      )}

      {latestNotice && (
        <Link href="/notices" className="block">
          <Alert>
            <span className="text-sm opacity-80">📢 {t("dashboard.latestNotice")}</span>
            <div className="font-semibold">{latestNotice.title}</div>
          </Alert>
        </Link>
      )}

      <LeaveBanner leaves={leaves} locale={locale} myMemberId={isVirtual || isManager ? null : me.id} />

      {showCarryWarning && <Alert>{t("dashboard.carryWarning")}</Alert>}

      {myWallet && (myWallet.status === "low" || myWallet.status === "out") && (
        <Link href={`/members/${me.id}`} className="block">
          <Alert tone={myWallet.status === "out" ? "red" : "amber"} className="flex items-center gap-3">
            <Wallet className="size-5 shrink-0" />
            <span className="flex-1">
              <b>{myWallet.status === "out" ? t("wallet.statusOut") : t("wallet.statusLow")}</b>{" "}
              {myWallet.status === "out"
                ? t("wallet.msgOutMe", { owe: fmtMoney(locale, Math.abs(myWallet.left)), pay: fmtMoney(locale, myWallet.suggest) })
                : t("wallet.msgLowMe", { days: fmtNumber(locale, Math.floor(myWallet.daysLeft ?? 0)), pay: fmtMoney(locale, myWallet.suggest) })}
            </span>
          </Alert>
        </Link>
      )}

      {/* personal area: every real member */}
      {!isVirtual && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl p-5 text-white shadow-sm lg:col-span-2",
              settled || balance > 0 ? "bg-gradient-to-br from-brand-500 to-brand-800" : "bg-gradient-to-br from-rose-500 to-red-700",
            )}
          >
            <PiggyBank className="absolute -bottom-4 -right-4 size-28 opacity-15" />
            <div className="text-sm opacity-90">
              {settled ? t("dashboard.myBalance") : balance < 0 ? t("dashboard.youOwe") : t("dashboard.youGet")}
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums">{fmtMoney(locale, Math.abs(balance))}</div>
            <Link href={`/members/${me.id}`} className="relative -ml-1 mt-1 inline-flex min-h-9 items-center rounded-lg px-1 text-sm font-medium underline underline-offset-2 opacity-90 hover:opacity-100">
              {t("person.seeDetails")} →
            </Link>
            {mine && (
              <>
                {/* the whole bill, so the balance always adds up on screen */}
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
                  {[
                    [t("dashboard.billMeals", { n: fmtNumber(locale, mine.meals) }), fmtMoney(locale, mine.meal_cost)],
                    [t("dashboard.billFixed"), fmtMoney(locale, mine.fixed_share)],
                    [t("dashboard.billPaid"), fmtMoney(locale, mine.deposits)],
                    ...(Math.abs(mine.carry_in) > 0.004 ? [[carryLabel, fmtMoney(locale, mine.carry_in)]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="opacity-80">{k}</div>
                      <div className="font-semibold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <Card title={t("dashboard.myToday")} icon={UtensilsCrossed} className="lg:col-span-3">
            <div className="flex flex-wrap gap-2">
              {kinds.map((k) => (
                <MealToggle
                  key={k}
                  memberId={me.id}
                  date={today}
                  kind={k}
                  on={myToday[k]}
                  locked={!can("meals") && (isPastCutoff(today, mess[`${k}_cutoff`]) || closed(today, k))}
                />
              ))}
            </div>
            <div className="mt-2">
              <GuestPanel
                memberId={me.id}
                date={today}
                kinds={kinds}
                counts={{ breakfast: myToday.guest_breakfast, lunch: myToday.guest_lunch, dinner: myToday.guest_dinner }}
                lockedKinds={can("meals") ? [] : kinds.filter((k) => isPastCutoff(today, mess[`${k}_cutoff`]) || closed(today, k))}
              />
            </div>
            {todayMenu && (
              <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <CookingPot className="mr-1 inline size-4" />
                <b>{t("menu.title")}:</b> {todayMenu}
              </div>
            )}
            <div
              className={cn(
                todayMenu ? "mt-2" : "mt-4",
                "rounded-xl px-3 py-2 text-sm",
                iAmOnDuty ? "bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200" : "bg-slate-50 dark:bg-slate-800/60",
              )}
            >
              <CalendarCheck className="mr-1 inline size-4" />
              <b>{t("dashboard.dutyTitle")}:</b> {t("common.today")} - {dutyNames(today)} · {t("common.tomorrow")} - {dutyNames(tomorrow)}
            </div>
          </Card>
        </div>
      )}

      {myWallet && <MealMoneyCard wallet={myWallet} month={month} monthEnd={monthEnd(month)} isMe name={me.display_name} />}

      {/* mess numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dashboard.mealRate")} value={fmtMoney(locale, summary.meal_rate)} icon={TrendingUp} />
        <Stat label={t("dashboard.totalBazar")} value={fmtMoney(locale, summary.total_bazar)} icon={ShoppingCart} />
        <Stat
          label={t("dashboard.totalMeals")}
          value={fmtNumber(locale, summary.total_meals)}
          icon={UtensilsCrossed}
          hint={t("charts.avgPerDay", { n: fmtNumber(locale, avgMeals, 1) })}
        />
        <Stat label={t("dashboard.messBalance")} value={fmtMoney(locale, messCash)} tone={messCash < 0 ? "bad" : "good"} icon={Banknote} />
      </div>
      <div className="-mt-2 flex justify-end">
        <Link href="/sheet" className={btn.ghost}>
          <Sheet className="size-4" /> {t("dashboard.openSheet")} →
        </Link>
      </div>

      {isStaff && quick.length > 0 && (
        <Card title={t("dashboard.quickActions")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {quick.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-center text-xs font-medium transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/40"
              >
                <Icon className="size-5 text-brand-600 dark:text-brand-400" />
                {label}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* manager: every member's meal money, most urgent first */}
      {everyone.length > 0 && <MealMoneyOverview rows={everyone} messName={mess.name} />}

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("charts.mealsPerDay")} icon={BarChart3} className="lg:col-span-2">
          <p className="-mt-2 mb-3 text-xs text-slate-500 dark:text-slate-400">{t("charts.mealsPerDayHelp")}</p>
          <DailyBars data={mealsPerDay} label={t("charts.mealsPerDay")} highlight={today} />
        </Card>
        <Card title={t("charts.whereMoney")} icon={PieChart}>
          {breakdown.length ? <BreakdownBars rows={breakdown} label={t("charts.whereMoney")} /> : <Empty>{t("charts.noSpend")}</Empty>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("charts.cashFlow")} icon={TrendingUp}>
          <div className="-mt-1 mb-3">
            <Legend
              items={[
                { name: t("charts.moneyIn"), color: "1", line: true },
                { name: t("charts.bazarSpent"), color: "2", line: true },
              ]}
            />
          </div>
          {hasMoney ? (
            <CumulativeLines
              x={dayAxis}
              series={[
                { name: t("charts.moneyIn"), color: "1", values: moneyIn },
                { name: t("charts.bazarSpent"), color: "2", values: spent },
              ]}
              label={t("charts.cashFlow")}
            />
          ) : (
            <Empty>{t("charts.noMoney")}</Empty>
          )}
        </Card>
        <Card title={t("charts.balances")} icon={Scale}>
          <div className="-mt-1 mb-3">
            <Legend
              items={[
                { name: t("charts.getsBack"), color: "2" },
                { name: t("charts.owes"), color: "neg" },
              ]}
            />
          </div>
          {balances.length ? (
            <BalanceBars rows={balances} label={t("charts.balances")} posLabel={t("charts.getsBack")} negLabel={t("charts.owes")} highlight={me.id} />
          ) : (
            <Empty>{t("common.none")}</Empty>
          )}
        </Card>
      </div>

      <div className={cn("grid gap-4", can("deposits") && "lg:grid-cols-2")}>
        <Card title={t("dashboard.todayCount")} icon={ChefHat} action={can("meals") && <WhatsAppButton text={cookText} label={t("dashboard.shareCount")} />}>
          <div className={cn("grid gap-2 text-center", counts.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {counts.map((c) => (
              <div key={c.kind} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-sm text-slate-500 dark:text-slate-400">{t(`meal.${c.kind}`)}</div>
                <div className="text-2xl font-bold tabular-nums">{fmtNumber(locale, c.members + c.guests)}</div>
                {c.guests > 0 && (
                  <div className="text-xs text-slate-500">
                    {t("meal.guest")} {fmtNumber(locale, c.guests)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {can("deposits") ? (
          <Card title={t("dashboard.dueList")} icon={Wallet} action={dueReach.length > 0 && <RemindDuesButton dues={dueReach} messName={mess.name} />}>
            {dues.length === 0 ? (
              <Empty>{t("dashboard.noDues")}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {dues.map((d) => (
                  <li key={d.member_id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <Avatar name={d.display_name} src={photoOf(d.member_id)} className="size-7 text-[10px]" />
                      {d.display_name}
                    </span>
                    <span className="font-semibold text-red-600 tabular-nums dark:text-red-400">{fmtMoney(locale, Math.abs(d.balance))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
