import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Banknote, PiggyBank, Receipt, ShoppingCart, Sheet, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { Avatar, Badge, Card, cn, Empty, PageTitle, Stat } from "@/components/ui";
import { getContext } from "@/lib/mess";
import { getOpening } from "@/lib/opening";
import { addDays, monthEnd, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { getAvatars, getMembers, getMonthSummary, mealKinds, mealValue, weightedMeals } from "@/lib/queries";
import { mealWallet } from "@/lib/meal-wallet";
import type { Meal, MealKind, PaymentMethod } from "@/lib/types";

const TABS = ["meals", "bazar", "bills", "payments", "money"] as const;
type Tab = (typeof TABS)[number];

/** The paper/Excel sheet, inside the app: one month of meals, bazar and everyone's money. Read-only for all. */
export default async function SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me } = await getContext();
  const t = await getTranslations();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = parseMonth(sp.month, today);
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "meals";
  const end = monthEnd(month);
  const lastDay = end < today ? end : today; // meals only count up to today

  const membersP = getMembers(supabase, mess.id);
  const [opening, summary, members, { data: mealRows }, { data: bazarRows }, { data: billRows }, { data: payRows }, avatars] = await Promise.all([
    getOpening(supabase, mess.id),
    getMonthSummary(supabase, mess.id, month),
    membersP,
    lastDay >= month
      ? supabase.from("meals").select("*").eq("mess_id", mess.id).gte("date", month).lte("date", lastDay)
      : Promise.resolve({ data: [] }),
    supabase.from("bazar_entries").select("id, date, amount, items, shopper_id").eq("mess_id", mess.id).gte("date", month).lte("date", end).order("date"),
    supabase.from("fixed_costs").select("id, title, amount, fixed_cost_shares(member_id, amount)").eq("mess_id", mess.id).eq("month", month).order("created_at"),
    supabase
      .from("deposits")
      .select("id, member_id, date, amount, method, status")
      .eq("mess_id", mess.id)
      .neq("status", "rejected")
      .gte("date", month)
      .lte("date", end)
      .order("date"),
    membersP.then((ms) => getAvatars(supabase, ms.map((m) => m.user_id))),
  ]);
  const carryLabel = opening.month === month ? t("opening.line") : t("person.previous");
  type Bill = { id: string; title: string; amount: number; fixed_cost_shares: { member_id: string; amount: number }[] };
  type Pay = { id: string; member_id: string; date: string; amount: number; method: PaymentMethod; status: string };
  const bills = (billRows ?? []) as Bill[];
  const pays = (payRows ?? []) as Pay[];
  const meals = (mealRows ?? []) as Meal[];
  const bazar = (bazarRows ?? []) as { id: string; date: string; amount: number; items: string | null; shopper_id: string | null }[];
  const people = summary.members; // everyone in the mess that month, sorted by name
  const photoOf = (memberId: string) => {
    const uid = members.find((m) => m.id === memberId)?.user_id;
    return uid ? avatars.get(uid) ?? null : null;
  };
  const billOf = (memberId: string, b: Bill) => Number(b.fixed_cost_shares.find((x) => x.member_id === memberId)?.amount ?? 0);
  const totalBills = bills.reduce((a, b) => a + Number(b.amount), 0);
  const cashInHand = people.reduce((a, p) => a + p.balance, 0);
  // meal money per person (paid + previous − bills, minus meals so far) and its status
  const walletOf = (p: (typeof people)[number]) => {
    const mealsByDay: Record<string, number> = {};
    for (const r of meals) if (r.member_id === p.member_id) mealsByDay[r.date] = weightedMeals(mess, r);
    return mealWallet({
      lowDays: mess.low_meal_days,
      month, monthEnd: end, today, rate: summary.meal_rate, bills: p.fixed_share, carry: p.carry_in, balance: p.balance,
      deposits: pays.filter((d) => d.member_id === p.member_id && d.status === "approved").map((d) => ({ date: d.date, amount: Number(d.amount) })),
      mealsByDay,
    });
  };
  const kinds = mealKinds(mess);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "-";
  const money = (n: number) => fmtMoney(locale, n);
  const num = (n: number) => fmtNumber(locale, n);
  const days: string[] = [];
  for (let d = month; d <= lastDay; d = addDays(d, 1)) days.push(d);
  const mealOf = (memberId: string, day: string) => meals.find((m) => m.member_id === memberId && m.date === day);
  /** what the sheet would show in a cell: 1, ½, 2 (=1 + 1 guest), blank */
  const cell = (m: Meal | undefined, k: MealKind) => (m ? mealValue(m, k) + m[`guest_${k}`] : 0);
  const cellText = (v: number) => (v === 0 ? "" : v === 0.5 ? "½" : num(v));
  const dayTotal = (day: string) =>
    people.reduce((a, p) => a + kinds.reduce((b, k) => b + cell(mealOf(p.member_id, day), k), 0), 0);
  const bazarTotal = bazar.reduce((a, b) => a + Number(b.amount), 0);
  const tabHref = (k: Tab) => ({ pathname: "/sheet", query: { month: month.slice(0, 7), tab: k } });
  const personHref = (id: string) => ({ pathname: `/members/${id}`, query: { month: month.slice(0, 7) } });
  const short = (d: string) => fmtDate(locale, d, { day: "numeric", month: "short" });
  const isFuture = month > today;

  return (
    <div className="space-y-5">
      <PageTitle
        sub={summary.status === "closed" ? t("sheet.closedSub") : t("sheet.subtitle")}
        action={<MonthNav path="/sheet" month={month} query={{ tab }} />}
      >
        <span className="inline-flex items-center gap-2">
          {t("sheet.title")}
          {summary.status === "closed" && <Badge tone="slate">{t("report.closed")}</Badge>}
        </span>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("dashboard.totalBazar")} value={money(summary.total_bazar)} icon={ShoppingCart} />
        <Stat label={t("dashboard.totalMeals")} value={num(summary.total_meals)} icon={UtensilsCrossed} />
        <Stat label={t("dashboard.mealRate")} value={money(summary.meal_rate)} icon={Sheet} />
        <Stat label={t("sheet.totalBills")} value={money(totalBills)} icon={Receipt} />
        <Stat label={t("sheet.totalPaid")} value={money(summary.total_deposits)} icon={Wallet} />
        {/* everyone's balances together: members still owe (to collect) or the mess holds extra */}
        <Stat
          label={cashInHand < -0.004 ? t("sheet.toCollect") : t("sheet.extraInHand")}
          value={money(Math.abs(cashInHand))}
          tone={cashInHand < -0.004 ? "bad" : "good"}
          icon={Banknote}
          hint={cashInHand < -0.004 ? t("sheet.toCollectHelp") : t("sheet.extraHelp")}
        />
      </div>

      {/* tabs */}
      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="grid min-w-[34rem] grid-cols-5 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {TABS.map((k) => {
          const Icon = { meals: UtensilsCrossed, bazar: ShoppingCart, bills: Receipt, payments: Wallet, money: Users }[k];
          return (
            <Link
              key={k}
              href={tabHref(k)}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium transition",
                tab === k
                  ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <Icon className="size-4" /> {t(`sheet.tab_${k}`)}
            </Link>
          );
        })}
        </div>
      </nav>

      {/* ---------------- meals grid: dates × people (like rows 2–31 of the sheet) */}
      {tab === "meals" && (
        <Card>
          {isFuture || people.length === 0 ? (
            <Empty icon={UtensilsCrossed}>{t("sheet.noMeals")}</Empty>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">{t("sheet.mealsHelp")}</p>
              <div className="-mx-4 max-h-[70vh] overflow-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full border-separate border-spacing-0 text-center text-sm tabular-nums">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-20 border-b border-slate-200 bg-white px-2 py-2 text-left text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                        {t("common.date")}
                      </th>
                      {people.map((p) => (
                        <th
                          key={p.member_id}
                          colSpan={kinds.length}
                          className={cn(
                            "border-l border-slate-200 bg-white px-2 pt-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900",
                            p.member_id === me.id && "text-brand-700 dark:text-brand-400",
                          )}
                        >
                          <Link href={personHref(p.member_id)} className="inline-flex flex-col items-center gap-1 hover:underline">
                            <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-7 text-[10px]" />
                            {p.display_name}
                          </Link>
                        </th>
                      ))}
                      <th rowSpan={2} className="border-b border-l border-slate-200 bg-white px-2 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
                        {t("common.total")}
                      </th>
                    </tr>
                    <tr>
                      {people.map((p) =>
                        kinds.map((k, i) => (
                          <th
                            key={p.member_id + k}
                            className={cn(
                              "border-b border-slate-200 bg-white px-1.5 pb-1.5 text-[10px] font-medium uppercase text-slate-400 dark:border-slate-700 dark:bg-slate-900",
                              i === 0 && "border-l",
                            )}
                          >
                            {t(`meal.${k}`).slice(0, 1)}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => {
                      const total = dayTotal(d);
                      return (
                        <tr key={d} className={cn(d === today && "bg-brand-50/70 dark:bg-brand-950/30", total === 0 && "text-slate-400")}>
                          <td className={cn("sticky left-0 border-b border-slate-100 px-2 py-1.5 text-left text-xs whitespace-nowrap dark:border-slate-800", d === today ? "bg-brand-50 font-semibold dark:bg-brand-950" : "bg-white dark:bg-slate-900")}>
                            {fmtDate(locale, d, { day: "numeric", weekday: "short" })}
                          </td>
                          {people.map((p) => {
                            const m = mealOf(p.member_id, d);
                            return kinds.map((k, i) => {
                              const v = cell(m, k);
                              return (
                                <td
                                  key={p.member_id + k}
                                  className={cn(
                                    "border-b border-slate-100 px-1.5 py-1.5 dark:border-slate-800",
                                    i === 0 && "border-l border-l-slate-200 dark:border-l-slate-700",
                                    v > 0 && "font-medium text-slate-800 dark:text-slate-100",
                                    v === 0.5 && "text-amber-600 dark:text-amber-400",
                                    v > 1 && "text-sky-700 dark:text-sky-400",
                                  )}
                                >
                                  {cellText(v)}
                                </td>
                              );
                            });
                          })}
                          <td className="border-b border-l border-slate-100 border-l-slate-200 px-2 py-1.5 font-semibold dark:border-slate-800 dark:border-l-slate-700">
                            {total ? num(total) : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 font-semibold">
                    <tr>
                      <td className="sticky left-0 z-20 border-t-2 border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs dark:border-slate-700 dark:bg-slate-800">
                        {t("sheet.mealsRow")}
                      </td>
                      {people.map((p) => (
                        <td key={p.member_id} colSpan={kinds.length} className="border-l border-t-2 border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-800">
                          {num(p.meals)}
                        </td>
                      ))}
                      <td className="border-l border-t-2 border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-800">{num(summary.total_meals)}</td>
                    </tr>
                    <tr>
                      <td className="sticky left-0 z-20 bg-slate-50 px-2 pb-2 text-left text-xs dark:bg-slate-800">{t("sheet.mealTkRow")}</td>
                      {people.map((p) => (
                        <td key={p.member_id} colSpan={kinds.length} className="border-l border-slate-200 bg-slate-50 px-2 pb-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                          {money(p.meal_cost)}
                        </td>
                      ))}
                      <td className="border-l border-slate-200 bg-slate-50 px-2 pb-2 text-xs dark:border-slate-700 dark:bg-slate-800">{money(summary.total_bazar)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span><b className="text-slate-800 dark:text-slate-100">1</b> {t("sheet.legendFull")}</span>
                <span><b className="text-amber-600">½</b> {t("sheet.legendHalf")}</span>
                <span><b className="text-sky-700">2, 3</b> {t("sheet.legendGuest")}</span>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ---------------- bazar list (Date · Taka · Name) */}
      {tab === "bazar" && (
        <Card>
          {bazar.length === 0 ? (
            <Empty icon={ShoppingCart}>{t("sheet.noBazar")}</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 font-medium">{t("common.date")}</th>
                  <th className="py-2 font-medium">{t("sheet.who")}</th>
                  <th className="hidden py-2 font-medium sm:table-cell">{t("bazar.items")}</th>
                  <th className="py-2 text-right font-medium">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bazar.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 whitespace-nowrap">{short(b.date)}</td>
                    <td className="py-2.5">{nameOf(b.shopper_id)}</td>
                    <td className="hidden max-w-xs truncate py-2.5 text-slate-500 sm:table-cell">{b.items ?? ""}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{money(Number(b.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                  <td className="py-2.5" colSpan={2}>{t("common.total")}</td>
                  <td className="hidden sm:table-cell" />
                  <td className="py-2.5 text-right tabular-nums">{money(bazarTotal)}</td>
                </tr>
                <tr className="text-sm text-slate-500">
                  <td className="pb-1" colSpan={3}>
                    {t("sheet.rateLine", { bazar: money(bazarTotal), meals: num(summary.total_meals) })}
                  </td>
                  <td className="pb-1 text-right font-semibold text-slate-800 tabular-nums dark:text-slate-100">{money(summary.meal_rate)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      )}

      {/* ---------------- bills: who pays which fixed bill (rent, gas, chef …) */}
      {tab === "bills" && (
        <Card>
          {bills.length === 0 ? (
            <Empty icon={Receipt}>{t("sheet.noBills")}</Empty>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="sticky left-0 bg-white py-2 pr-3 text-left align-bottom font-medium dark:bg-slate-900">{t("common.member")}</th>
                    {bills.map((b) => (
                      <th key={b.id} className="min-w-[5rem] px-2 py-2 align-bottom font-medium leading-tight">{b.title}</th>
                    ))}
                    <th className="py-2 pl-3 align-bottom font-semibold text-slate-700 dark:text-slate-200">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {people.map((p) => (
                    <tr key={p.member_id} className={cn("text-right", p.member_id === me.id && "bg-brand-50/60 dark:bg-brand-950/30")}>
                      <td className={cn("sticky left-0 py-2.5 pr-3 text-left", p.member_id === me.id ? "bg-brand-50 dark:bg-brand-950" : "bg-white dark:bg-slate-900")}>
                        <Link href={personHref(p.member_id)} className="inline-flex min-h-8 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-400">
                          <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-7 text-[10px]" />
                          {p.display_name}
                        </Link>
                      </td>
                      {bills.map((b) => {
                        const v = billOf(p.member_id, b);
                        return (
                          <td key={b.id} className={cn("px-2", v === 0 && "text-slate-300 dark:text-slate-600")}>{v === 0 ? "-" : money(v)}</td>
                        );
                      })}
                      <td className="py-2.5 pl-3 font-semibold">{money(p.fixed_share)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 text-right font-semibold dark:border-slate-700">
                    <td className="sticky left-0 bg-white py-2.5 pr-3 text-left dark:bg-slate-900">{t("common.total")}</td>
                    {bills.map((b) => (
                      <td key={b.id} className="px-2">{money(Number(b.amount))}</td>
                    ))}
                    <td className="py-2.5 pl-3">{money(totalBills)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------------- payments: how much each person paid, and when */}
      {tab === "payments" && (
        <Card>
          {pays.length === 0 ? (
            <Empty icon={Wallet}>{t("sheet.noPayments")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {people.map((p) => {
                const mine = pays.filter((d) => d.member_id === p.member_id);
                const approved = mine.filter((d) => d.status === "approved").reduce((a, d) => a + Number(d.amount), 0);
                return (
                  <li key={p.member_id} className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
                    <Link href={personHref(p.member_id)} className="inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline dark:text-brand-400">
                      <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-8 text-xs" />
                      {p.display_name}
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {mine.length === 0 ? (
                        <span className="text-sm text-slate-400">{t("sheet.notPaidYet")}</span>
                      ) : (
                        mine.map((d) => (
                          <span
                            key={d.id}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                              d.status === "approved"
                                ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                            )}
                          >
                            <b className="tabular-nums">{money(Number(d.amount))}</b>
                            <span className="text-slate-500 dark:text-slate-400">
                              {short(d.date)} · {t(`methods.${d.method}`)}
                            </span>
                            {d.status !== "approved" && <span className="font-medium">· {t("deposits.status.pending")}</span>}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="text-right font-bold tabular-nums">{money(approved)}</div>
                  </li>
                );
              })}
              <li className="flex justify-between py-3 font-bold">
                <span>{t("common.total")}</span>
                <span className="tabular-nums">{money(summary.total_deposits)}</span>
              </li>
            </ul>
          )}
        </Card>
      )}

      {/* ---------------- money: previous → paid → bills → for meals → meal cost → left / due */}
      {tab === "money" && (
        <>
          {people.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { key: "due", rows: people.filter((p) => p.balance < -0.004).sort((a, b) => a.balance - b.balance), tone: "red" as const },
                { key: "back", rows: people.filter((p) => p.balance > 0.004).sort((a, b) => b.balance - a.balance), tone: "green" as const },
              ].map(({ key, rows, tone }) => (
                <Card
                  key={key}
                  title={key === "due" ? t("sheet.dueList") : t("sheet.backList")}
                  icon={key === "due" ? AlertTriangle : PiggyBank}
                  className={tone === "red" && rows.length ? "border-red-200 dark:border-red-900" : undefined}
                >
                  {rows.length === 0 ? (
                    <p className="py-2 text-sm text-slate-500">{key === "due" ? t("sheet.nobodyDue") : t("sheet.nobodyBack")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((p) => (
                        <li key={p.member_id} className="flex justify-between py-2">
                          <Link href={personHref(p.member_id)} className="inline-flex items-center gap-2 hover:underline">
                            <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-7 text-[10px]" />
                            {p.display_name}
                          </Link>
                          <span className={cn("font-semibold tabular-nums", tone === "red" ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-400")}>
                            {money(Math.abs(p.balance))}
                          </span>
                        </li>
                      ))}
                      <li className="flex justify-between py-2 font-bold">
                        <span>{t("common.total")}</span>
                        <span className="tabular-nums">{money(Math.abs(rows.reduce((a, p) => a + p.balance, 0)))}</span>
                      </li>
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}

          <Card title={t("sheet.everyone")} icon={Users}>
            {people.length === 0 ? (
              <Empty icon={Users}>{t("common.none")}</Empty>
            ) : (
              <>
                {/* phones: one card per person */}
                <ul className="space-y-2 md:hidden">
                  {people.map((p) => {
                    const w = walletOf(p);
                    const owes = p.balance < -0.004;
                    return (
                      <li key={p.member_id}>
                        <Link
                          href={personHref(p.member_id)}
                          className={cn(
                            "block rounded-xl border p-3 transition hover:border-brand-400",
                            p.member_id === me.id ? "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30" : "border-slate-200 dark:border-slate-700",
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold">
                              <span className="relative">
                                <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-8 text-xs" />
                                <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900", DOT[w.status])} />
                              </span>
                              {p.display_name}
                            </span>
                            <span className={cn("font-bold tabular-nums", owes ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-400")}>
                              {owes ? t("person.due") : t("person.getsBack")} {money(Math.abs(p.balance))}
                            </span>
                          </div>
                          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs tabular-nums">
                            {([
                              [carryLabel, money(p.carry_in)],
                              [t("person.paid"), money(p.deposits)],
                              [t("sheet.colBills"), money(p.fixed_share)],
                              [t("sheet.colForMeals"), money(w.forMeals)],
                              [t("sheet.colMeal"), `${money(p.meal_cost)} · ${num(p.meals)}`],
                              [t("sheet.colLeft"), money(p.balance)],
                            ] as const).map(([k, v]) => (
                              <div key={k}>
                                <dt className="text-slate-500">{k}</dt>
                                <dd className="font-medium">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {/* wider screens: the sheet's per-person table, in the same order as the money flows */}
                <div className="-mx-5 hidden overflow-x-auto px-5 md:block">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 text-right text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                        <th className="py-2 pr-3 text-left font-medium">{t("common.member")}</th>
                        <th className="px-2 py-2 font-medium">{carryLabel}</th>
                        <th className="px-2 py-2 font-medium">{t("person.paid")}</th>
                        <th className="px-2 py-2 font-medium">− {t("sheet.colBills")}</th>
                        <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-200">= {t("sheet.colForMeals")}</th>
                        <th className="px-2 py-2 font-medium">{t("nav.meals")}</th>
                        <th className="px-2 py-2 font-medium">− {t("sheet.colMeal")}</th>
                        <th className="py-2 pl-3 font-semibold text-slate-700 dark:text-slate-200">= {t("sheet.colLeft")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {people.map((p) => {
                        const w = walletOf(p);
                        const owes = p.balance < -0.004;
                        return (
                          <tr key={p.member_id} className={cn("text-right", p.member_id === me.id && "bg-brand-50/60 dark:bg-brand-950/30")}>
                            <td className="py-2.5 pr-3 text-left">
                              <Link href={personHref(p.member_id)} className="inline-flex min-h-8 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-400">
                                <span className="relative">
                                  <Avatar name={p.display_name} src={photoOf(p.member_id)} className="size-8 text-xs" />
                                  <span
                                    className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900", DOT[w.status])}
                                    title={t(`wallet.status${w.status === "ok" ? "Ok" : w.status === "low" ? "Low" : w.status === "out" ? "Out" : "Idle"}`)}
                                  />
                                </span>
                                {p.display_name}
                              </Link>
                            </td>
                            <td className={cn("px-2", p.carry_in < 0 && "text-red-600 dark:text-red-400")}>{money(p.carry_in)}</td>
                            <td className="px-2">{money(p.deposits)}</td>
                            <td className="px-2">{money(p.fixed_share)}</td>
                            <td className={cn("px-2 font-medium", w.forMeals < 0 && "text-red-600 dark:text-red-400")}>{money(w.forMeals)}</td>
                            <td className="px-2">{num(p.meals)}</td>
                            <td className="px-2">{money(p.meal_cost)}</td>
                            <td className={cn("py-2.5 pl-3 font-bold", owes ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-400")}>
                              <span className="mr-1 text-xs font-medium opacity-80">{owes ? t("sheet.owes") : t("sheet.gets")}</span>
                              {money(Math.abs(p.balance))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 text-right font-semibold dark:border-slate-700">
                        <td className="py-2.5 pr-3 text-left">{t("common.total")}</td>
                        <td className="px-2">{money(people.reduce((a, p) => a + p.carry_in, 0))}</td>
                        <td className="px-2">{money(summary.total_deposits)}</td>
                        <td className="px-2">{money(summary.total_fixed)}</td>
                        <td className="px-2">{money(people.reduce((a, p) => a + p.carry_in + p.deposits - p.fixed_share, 0))}</td>
                        <td className="px-2">{num(summary.total_meals)}</td>
                        <td className="px-2">{money(people.reduce((a, p) => a + p.meal_cost, 0))}</td>
                        <td className="py-2.5 pl-3">{money(cashInHand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{t("sheet.moneyHelp2")}</span>
                  {(["out", "low", "ok"] as const).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", DOT[k])} /> {t(`wallet.status${k === "ok" ? "Ok" : k === "low" ? "Low" : "Out"}`)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const DOT = { out: "bg-red-500", low: "bg-amber-500", ok: "bg-brand-500", idle: "bg-slate-400" } as const;
