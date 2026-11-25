import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, ReceiptText, ShoppingCart, UtensilsCrossed, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { WhatsAppButton } from "@/components/copy-button";
import { PrintButton } from "@/components/print-button";
import { Avatar, Badge, Card, cn, Empty } from "@/components/ui";
import { COST_CATEGORIES } from "@/lib/costs";
import { getContext } from "@/lib/mess";
import { monthEnd, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtMonth, fmtNumber } from "@/lib/format";
import { getAvatars, getMembers, getMonthSummary, mealKinds, weightedMeals } from "@/lib/queries";
import { mealWallet } from "@/lib/meal-wallet";
import { MealMoneyCard } from "@/components/meal-money";
import type { Meal, PaymentMethod } from "@/lib/types";

type Share = { amount: number; fixed_cost: { title: string; category: string; amount: number; month: string } | null };
type Dep = { id: string; date: string; amount: number; method: PaymentMethod; txn_id: string | null; status: string };

/** One person's bill for a month: meals, every bill share, payments, carry-over and the result. */
export default async function MemberDetails({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me } = await getContext();
  const t = await getTranslations();
  const today = todayDhaka();
  const month = parseMonth((await searchParams).month, today);
  const end = monthEnd(month);

  const [members, summary, { data: shareRows }, { data: depRows }, { data: mealRows }, { data: bazarRows }] = await Promise.all([
    getMembers(supabase, mess.id),
    getMonthSummary(supabase, mess.id, month),
    supabase
      .from("fixed_cost_shares")
      .select("amount, fixed_cost:fixed_costs!inner(title, category, amount, month)")
      .eq("member_id", id)
      .eq("fixed_cost.month", month),
    supabase
      .from("deposits")
      .select("id, date, amount, method, txn_id, status")
      .eq("member_id", id)
      .gte("date", month)
      .lte("date", end)
      .order("date"),
    supabase
      .from("meals")
      .select("*")
      .eq("member_id", id)
      .gte("date", month)
      .lte("date", end < today ? end : today)
      .order("date"),
    supabase.from("bazar_entries").select("date, amount, items").eq("shopper_id", id).gte("date", month).lte("date", end).order("date"),
  ]);
  const person = members.find((m) => m.id === id);
  if (!person) notFound();
  const personPhoto = person.user_id ? (await getAvatars(supabase, [person.user_id])).get(person.user_id) ?? null : null;

  const row = summary.members.find((m) => m.member_id === id);
  const meals = row?.meals ?? 0;
  const mealCost = row?.meal_cost ?? 0;
  const carry = row?.carry_in ?? 0;
  const balance = row?.balance ?? 0;
  const owes = balance < -0.004;
  const settled = Math.abs(balance) < 0.005;

  const catLabel = (c: string) =>
    (COST_CATEGORIES as readonly string[]).includes(c) ? t(`costs.categories.${c as (typeof COST_CATEGORIES)[number]}`) : c;
  const bills = ((shareRows ?? []) as unknown as Share[])
    .filter((s) => s.fixed_cost && Number(s.amount) > 0)
    .map((s) => ({ title: s.fixed_cost!.title, category: s.fixed_cost!.category, amount: Number(s.amount), of: Number(s.fixed_cost!.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const billsTotal = bills.reduce((a, b) => a + b.amount, 0);
  const totalCost = mealCost + billsTotal;
  const deps = (depRows ?? []) as Dep[];
  const paid = deps.filter((d) => d.status === "approved").reduce((a, d) => a + Number(d.amount), 0);
  const kinds = mealKinds(mess);
  const dayMeals = ((mealRows ?? []) as Meal[]).map((m) => ({
    date: m.date,
    flags: kinds.map((k) => ({ k, on: m[k], half: m[`half_${k}`], guests: m[`guest_${k}`] })),
    count: weightedMeals(mess, m),
  }));
  const bazar = (bazarRows ?? []) as { date: string; amount: number; items: string | null }[];
  const bazarTotal = bazar.reduce((a, b) => a + Number(b.amount), 0);

  const money = (n: number) => fmtMoney(locale, n);
  const short = (d: string) => fmtDate(locale, d, { day: "numeric", month: "short" });
  const statement = [
    `${person.display_name} - ${mess.name} · ${fmtMonth(locale, month)}`,
    `${t("person.mealLine", { meals: fmtNumber(locale, meals), rate: money(summary.meal_rate) })}: ${money(mealCost)}`,
    ...bills.map((b) => `${b.title}: ${money(b.amount)}`),
    `${t("person.totalCost")}: ${money(totalCost)}`,
    `${t("person.paid")}: ${money(paid)}`,
    ...(Math.abs(carry) > 0.004 ? [`${t("person.previous")}: ${money(carry)}`] : []),
    `${settled ? t("person.settled") : owes ? t("person.due") : t("person.getsBack")}: ${money(Math.abs(balance))}`,
  ].join("\n");

  const line = (label: React.ReactNode, value: number, opts: { sub?: string; strong?: boolean; sign?: "+" | "−" } = {}) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", opts.strong && "font-semibold")}>
      <span className="min-w-0">
        {label}
        {opts.sub && <span className="block text-xs font-normal text-slate-500">{opts.sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums">
        {opts.sign && <span className="text-slate-400">{opts.sign} </span>}
        {money(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* who + month */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.display_name} src={personPhoto} className="size-12 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {person.display_name}
              {person.id === me.id && <span className="text-sm font-normal text-slate-500"> ({t("common.you")})</span>}
            </h1>
            <p className="text-sm text-slate-500">{[person.room, person.phone].filter(Boolean).join(" · ") || t("person.subtitle")}</p>
          </div>
        </div>
        <div className="no-print">
          <MonthNav path={`/members/${id}`} month={month} />
        </div>
      </div>

      {/* person picker: jump to anyone in the mess */}
      <nav className="no-print -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {members
          .filter((m) => m.status === "active" || m.id === id)
          .map((m) => (
            <Link
              key={m.id}
              href={{ pathname: `/members/${m.id}`, query: { month: month.slice(0, 7) } }}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm transition",
                m.id === id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
              )}
            >
              {m.display_name}
            </Link>
          ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* the bill statement - same idea as the sheet's per-person row */}
        <Card title={t("person.statement", { month: fmtMonth(locale, month) })} icon={ReceiptText} className="lg:col-span-3">
          <div className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <div className="pb-1">
              {line(t("person.meal"), mealCost, {
                sub: t("person.mealLine", { meals: fmtNumber(locale, meals), rate: money(summary.meal_rate) }),
              })}
            </div>
            <div className="py-1">
              {bills.length === 0 ? (
                <div className="py-1.5 text-slate-500">{t("person.noBills")}</div>
              ) : (
                bills.map((b) => (
                  <div key={b.title + b.amount}>
                    {line(b.title, b.amount, { sub: `${catLabel(b.category)} · ${t("person.ofBill", { amount: money(b.of) })}` })}
                  </div>
                ))
              )}
            </div>
            <div className="py-1">{line(t("person.totalCost"), totalCost, { strong: true })}</div>
            <div className="py-1">
              {line(t("person.paid"), paid, { sign: "−" })}
              {Math.abs(carry) > 0.004 &&
                line(carry < 0 ? t("person.previousDue") : t("person.previousCredit"), Math.abs(carry), {
                  sign: carry < 0 ? "+" : "−",
                  sub: t("person.previousHelp"),
                })}
            </div>
            <div
              className={cn(
                "mt-2 flex items-baseline justify-between gap-3 rounded-xl px-4 py-3",
                settled
                  ? "bg-slate-50 dark:bg-slate-800/60"
                  : owes
                    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-300",
              )}
            >
              <span className="font-semibold">{settled ? t("person.settled") : owes ? t("person.due") : t("person.getsBack")}</span>
              <span className="text-2xl font-bold tabular-nums">{money(Math.abs(balance))}</span>
            </div>
          </div>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <WhatsAppButton text={statement} label={t("person.share")} />
            <PrintButton label={t("report.print")} />
          </div>
        </Card>

        {/* payments */}
        <Card title={t("person.payments", { count: deps.length })} icon={Wallet} className="lg:col-span-2">
          {deps.length === 0 ? (
            <Empty>{t("person.noPayments")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {deps.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {short(d.date)} · {t(`methods.${d.method}`)}
                    {d.txn_id && <span className="text-slate-500"> · {d.txn_id}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {d.status !== "approved" && <Badge tone={d.status === "pending" ? "amber" : "red"}>{t(`deposits.status.${d.status as "pending"}`)}</Badge>}
                    <span className={cn("font-semibold tabular-nums", d.status !== "approved" && "text-slate-400 line-through")}>{money(d.amount)}</span>
                  </span>
                </li>
              ))}
              <li className="flex justify-between py-2 font-semibold">
                <span>{t("common.total")}</span>
                <span className="tabular-nums">{money(paid)}</span>
              </li>
            </ul>
          )}
        </Card>
      </div>

      {row && (
        <MealMoneyCard
          wallet={mealWallet({
      lowDays: mess.low_meal_days,
            month, monthEnd: end, today, rate: summary.meal_rate, bills: row.fixed_share, carry: row.carry_in, balance: row.balance,
            deposits: deps.filter((d) => d.status === "approved").map((d) => ({ date: d.date, amount: Number(d.amount) })),
            mealsByDay: Object.fromEntries(dayMeals.map((d) => [d.date, d.count])),
          })}
          month={month}
          monthEnd={end}
          isMe={person.id === me.id}
          name={person.display_name}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* every day's meals */}
        <Card title={t("person.dailyMeals", { count: fmtNumber(locale, meals) })} icon={UtensilsCrossed} className="lg:col-span-3">
          {dayMeals.length === 0 ? (
            <Empty>{t("common.none")}</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {dayMeals.map((d) => (
                <div
                  key={d.date}
                  className={cn("flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm dark:border-slate-800", d.count === 0 && "text-slate-400")}
                >
                  <span className="tabular-nums">{short(d.date)}</span>
                  <span className="flex items-center gap-1">
                    {d.flags.map((f) => (
                      <span
                        key={f.k}
                        title={t(`meal.${f.k}`)}
                        className={cn(
                          "grid size-5 place-items-center rounded text-[10px] font-bold",
                          f.on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800",
                        )}
                      >
                        {f.on && f.half ? "½" : t(`meal.${f.k}`).slice(0, 1)}
                        {f.guests > 0 && <sup className="text-[9px]">+{f.guests}</sup>}
                      </span>
                    ))}
                    <span className="w-6 text-right font-semibold tabular-nums">{fmtNumber(locale, d.count)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* bazar this person did */}
        <Card title={t("person.bazarDone")} icon={ShoppingCart} className="lg:col-span-2">
          {bazar.length === 0 ? (
            <Empty>{t("person.noBazar")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {bazar.map((b, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {short(b.date)}
                    {b.items && <span className="text-slate-500"> · {b.items}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(b.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between py-2 font-semibold">
                <span>{t("common.total")}</span>
                <span className="tabular-nums">{money(bazarTotal)}</span>
              </li>
            </ul>
          )}
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <CalendarDays className="size-3.5" /> {t("person.bazarHelp")}
          </p>
        </Card>
      </div>
    </div>
  );
}
