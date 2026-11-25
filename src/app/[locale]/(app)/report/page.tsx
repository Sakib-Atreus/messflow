import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { ReportActions } from "@/components/report-actions";
import { Badge, btn, Card, PageTitle, Stat, cn } from "@/components/ui";
import { closeMonth, reopenMonth } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { monthEnd, todayDhaka } from "@/lib/dates";
import { fmtMoney, fmtMonth, fmtNumber } from "@/lib/format";
import { getMonthSummary } from "@/lib/queries";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, can } = await getContext();
  const isManager = can("month");
  const t = await getTranslations();
  const today = todayDhaka();
  const month = parseMonth((await searchParams).month, today);
  const [s, { data: shareRows }, { data: depRows }, { data: bazarRows }] = await Promise.all([
    getMonthSummary(supabase, mess.id, month),
    // for the Excel export: every bill share, payment and bazar entry of the month
    supabase
      .from("fixed_cost_shares")
      .select("member_id, amount, fixed_cost:fixed_costs!inner(title, month)")
      .eq("mess_id", mess.id)
      .eq("fixed_cost.month", month),
    supabase
      .from("deposits")
      .select("member_id, date, amount, method, status")
      .eq("mess_id", mess.id)
      .eq("status", "approved")
      .gte("date", month)
      .lte("date", monthEnd(month))
      .order("date"),
    supabase.from("bazar_entries").select("date, amount, items, shopper_id").eq("mess_id", mess.id).gte("date", month).lte("date", monthEnd(month)).order("date"),
  ]);
  type ShareRow = { member_id: string; amount: number; fixed_cost: { title: string } | null };
  const shares = (shareRows ?? []) as unknown as ShareRow[];
  const billTitles = [...new Set(shares.map((x) => x.fixed_cost?.title ?? ""))].filter(Boolean);
  const billOf = (memberId: string, title: string) =>
    shares.filter((x) => x.member_id === memberId && x.fixed_cost?.title === title).reduce((acc, x) => acc + Number(x.amount), 0);
  const nameOf = (id: string | null) => s.members.find((m) => m.member_id === id)?.display_name ?? "-";
  const closed = s.status === "closed";
  const sum = (k: "meals" | "meal_cost" | "fixed_share" | "deposits" | "carry_in" | "balance") =>
    s.members.reduce((a, m) => a + m[k], 0);

  const headers = [t("common.member"), t("nav.meals"), t("report.mealCost"), t("report.fixedShare"), t("report.deposited"), t("report.carryIn"), t("report.balance")];
  // laid out like the paper/Excel sheet: one row per person with every bill, then payments, then the bazar list
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const csvRows: (string | number)[][] = [
    [`${mess.name} - ${fmtMonth(locale, month)}`],
    [t("dashboard.mealRate"), s.meal_rate, t("dashboard.totalBazar"), s.total_bazar, t("dashboard.totalMeals"), s.total_meals],
    [],
    [t("common.member"), t("nav.meals"), t("report.mealCost"), ...billTitles, t("person.totalCost"), t("person.paid"), t("report.carryIn"), t("report.balance"), ""],
    ...s.members.map((m) => [
      m.display_name,
      m.meals,
      m.meal_cost,
      ...billTitles.map((bt) => r2(billOf(m.member_id, bt))),
      r2(m.meal_cost + m.fixed_share),
      m.deposits,
      m.carry_in,
      r2(m.balance),
      Math.abs(m.balance) < 0.005 ? "" : m.balance < 0 ? t("person.due") : t("person.getsBack"),
    ]),
    [
      t("common.total"), sum("meals"), r2(sum("meal_cost")),
      ...billTitles.map((bt) => r2(shares.filter((x) => x.fixed_cost?.title === bt).reduce((acc, x) => acc + Number(x.amount), 0))),
      r2(sum("meal_cost") + sum("fixed_share")), r2(sum("deposits")), r2(sum("carry_in")), r2(sum("balance")), "",
    ],
    [],
    [t("person.payments", { count: (depRows ?? []).length }), t("common.date"), t("common.amount"), t("deposits.method")],
    ...((depRows ?? []) as { member_id: string; date: string; amount: number; method: string }[]).map((d) => [
      nameOf(d.member_id), d.date, Number(d.amount), t(`methods.${d.method as "cash"}`),
    ]),
    [],
    [t("nav.bazar"), t("common.date"), t("common.amount"), t("bazar.items")],
    ...((bazarRows ?? []) as { date: string; amount: number; items: string | null; shopper_id: string | null }[]).map((b) => [
      nameOf(b.shopper_id), b.date, Number(b.amount), b.items ?? "",
    ]),
  ];


  return (
    <div className="space-y-5">
      <PageTitle action={<MonthNav path="/report" month={month} />}>
        {t("report.title")} <Badge tone={closed ? "green" : "amber"}>{closed ? t("report.closed") : t("report.open")}</Badge>
      </PageTitle>
      <h2 className="hidden text-xl font-semibold print:block">
        {mess.name} - {fmtMonth(locale, month)}
      </h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dashboard.mealRate")} value={fmtMoney(locale, s.meal_rate)} />
        <Stat label={t("dashboard.totalBazar")} value={fmtMoney(locale, s.total_bazar)} />
        <Stat label={t("dashboard.totalMeals")} value={fmtNumber(locale, s.total_meals)} />
        <Stat label={t("nav.costs")} value={fmtMoney(locale, s.total_fixed)} />
      </div>

      <Card>
        <ul className="divide-y divide-slate-100 sm:hidden dark:divide-slate-800">
          {s.members.map((m) => (
            <li key={m.member_id} className={cn("-mx-2 rounded-xl px-2 py-3", m.member_id === me.id && "bg-brand-50 dark:bg-brand-950/30")}>
              <div className="flex items-baseline justify-between gap-2">
                <Link href={{ pathname: `/members/${m.member_id}`, query: { month: month.slice(0, 7) } }} className="inline-flex min-h-8 items-center font-medium underline-offset-2 hover:underline">
                  {m.display_name}
                </Link>
                <span className={cn("font-bold tabular-nums", m.balance < -0.004 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400")}>
                  {fmtMoney(locale, m.balance)}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-xs tabular-nums">
                {([
                  [headers[1], fmtNumber(locale, m.meals)],
                  [headers[2], fmtMoney(locale, m.meal_cost)],
                  [headers[3], fmtMoney(locale, m.fixed_share)],
                  [headers[4], fmtMoney(locale, m.deposits)],
                  [headers[5], fmtMoney(locale, m.carry_in)],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
          <li className="flex justify-between py-3 font-semibold">
            <span>{t("common.total")}</span>
            <span className="tabular-nums">{fmtMoney(locale, sum("balance"))}</span>
          </li>
        </ul>
        <div className="-mx-4 hidden overflow-x-auto px-4 sm:block">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-right text-slate-500">
                {headers.map((h, i) => (
                  <th key={h} className={cn("py-2 font-medium", i === 0 && "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {s.members.map((m) => (
                <tr key={m.member_id} className={cn("text-right", m.member_id === me.id && "bg-brand-50 dark:bg-brand-950/30")}>
                  <td className="py-2 text-left">
                    <Link href={{ pathname: `/members/${m.member_id}`, query: { month: month.slice(0, 7) } }} className="inline-flex min-h-8 items-center text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
                      {m.display_name}
                    </Link>
                  </td>
                  <td>{fmtNumber(locale, m.meals)}</td>
                  <td>{fmtMoney(locale, m.meal_cost)}</td>
                  <td>{fmtMoney(locale, m.fixed_share)}</td>
                  <td>{fmtMoney(locale, m.deposits)}</td>
                  <td>{fmtMoney(locale, m.carry_in)}</td>
                  <td className={cn("font-semibold", m.balance < -0.004 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400")}>
                    {fmtMoney(locale, m.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 text-right font-semibold tabular-nums dark:border-slate-700">
                <td className="py-2 text-left">{t("common.total")}</td>
                <td>{fmtNumber(locale, sum("meals"))}</td>
                <td>{fmtMoney(locale, sum("meal_cost"))}</td>
                <td>{fmtMoney(locale, sum("fixed_share"))}</td>
                <td>{fmtMoney(locale, sum("deposits"))}</td>
                <td>{fmtMoney(locale, sum("carry_in"))}</td>
                <td>{fmtMoney(locale, sum("balance"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t("report.formula")}</p>
      </Card>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <ReportActions filename={`${mess.name}-${month.slice(0, 7)}.csv`} rows={csvRows} />
        {isManager &&
          (closed ? (
            <ActionButton action={reopenMonth.bind(null, month)} confirm={t("report.reopenConfirm")} className={btn.secondary} icon="unlock">
              {t("report.reopen")}
            </ActionButton>
          ) : (
            month <= today && (
              <ActionButton action={closeMonth.bind(null, month)} confirm={t("report.closeConfirm")} className={btn.primary} icon="lock">
                {t("report.closeMonth")}
              </ActionButton>
            )
          ))}
      </div>
    </div>
  );
}
