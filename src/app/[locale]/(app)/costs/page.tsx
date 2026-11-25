import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { AddFixedCost } from "@/components/fixed-cost-form";
import { COST_CATEGORIES } from "@/lib/costs";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { Avatar, Badge, btn, Card, cn, Empty, PageTitle, Stat } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import {
  ChefHat, Droplets, Flame, History, Home, ListChecks, Receipt, ReceiptText, Repeat, ShoppingBasket, Sparkles, User, Users, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { deleteFixedCost, setBillRepeat } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { monthEnd, todayDhaka } from "@/lib/dates";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { activeOn, getMembers } from "@/lib/queries";

type Cost = {
  id: string;
  category: string;
  title: string;
  amount: number;
  split_type: "equal" | "custom";
  repeat_monthly: boolean;
  fixed_cost_shares: { member_id: string; amount: number }[];
};

export default async function CostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, can } = await getContext();
  const isManager = can("costs");
  const t = await getTranslations();
  const month = parseMonth((await searchParams).month, todayDhaka());

  const [members, { data }] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase
      .from("fixed_costs")
      .select("id, category, title, amount, split_type, repeat_monthly, fixed_cost_shares(member_id, amount)")
      .eq("mess_id", mess.id)
      .eq("month", month)
      .order("created_at"),
  ]);
  const costs = (data ?? []) as Cost[];
  const total = costs.reduce((a, c) => a + Number(c.amount), 0);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "-";
  const catLabel = (c: string) =>
    (COST_CATEGORIES as readonly string[]).includes(c) ? t(`costs.categories.${c as (typeof COST_CATEGORIES)[number]}`) : c;
  const monthMembers = members.filter((m) => activeOn(m, monthEnd(month)) || activeOn(m, month));
  const money = (n: number) => fmtMoney(locale, n);

  // who pays what: one row per person, one column per bill (like the paper sheet)
  const payerIds = [...new Set(costs.flatMap((c) => c.fixed_cost_shares.filter((x) => Number(x.amount) > 0).map((x) => x.member_id)))];
  const people = members
    .filter((m) => payerIds.includes(m.id))
    .map((m) => {
      const parts = costs.map((c) => Number(c.fixed_cost_shares.find((x) => x.member_id === m.id)?.amount ?? 0));
      return { m, parts, total: parts.reduce((a, x) => a + x, 0) };
    })
    .sort((a, b) => b.total - a.total);
  const splitLine = (c: Cost) => {
    const paying = c.fixed_cost_shares.filter((x) => Number(x.amount) > 0);
    if (!paying.length) return t("costs.nobodyPays");
    // show the true equal part; a paisa of rounding may sit on one person
    if (c.split_type === "equal") return t("costs.equalLine", { count: paying.length, each: money(Math.floor((Number(c.amount) / paying.length) * 100) / 100) });
    if (paying.length === 1) return t("costs.onePerson", { name: nameOf(paying[0].member_id) });
    const amounts = paying.map((x) => Number(x.amount));
    return t("costs.customLine", { count: paying.length, min: money(Math.min(...amounts)), max: money(Math.max(...amounts)) });
  };
  const ICON: Record<string, LucideIcon> = {
    rent: Home, service: Wrench, electricity: Zap, gas: Flame, water: Droplets, internet: Wifi, cook: ChefHat, cleaner: Sparkles,
    extra: ShoppingBasket, personal: User, previous_due: History, other: Receipt,
  };

  return (
    <div className="space-y-5">
      <PageTitle sub={t("costs.subtitle")} action={<MonthNav path="/costs" month={month} />}>
        {t("costs.title")}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("costs.totalBills")} value={money(total)} icon={Receipt} />
        <Stat label={t("costs.billCount")} value={fmtNumber(locale, costs.length)} icon={ListChecks} />
        <Stat
          className="col-span-2 lg:col-span-1"
          label={t("costs.perPerson")}
          value={people.length ? money(total / people.length) : "-"}
          icon={Users}
          hint={t("costs.payers", { count: people.length })}
        />
      </div>

      {/* the bills */}
      <Card
        title={t("costs.billsTitle")}
        icon={ReceiptText}
        action={isManager && <AddFixedCost month={month} members={monthMembers.map((m) => ({ id: m.id, name: m.display_name }))} label={t("costs.add")} />}
      >
        {costs.length === 0 ? (
          <Empty icon={Receipt}>{isManager ? t("costs.emptyManager") : t("costs.empty")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {costs.map((c) => {
              const Icon = ICON[c.category] ?? Receipt;
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.title}</span>
                      {c.repeat_monthly && (
                        <Badge tone="blue">
                          <Repeat className="-mt-0.5 mr-1 inline size-3" />
                          {t("costs.repeatsBadge")}
                        </Badge>
                      )}
                    </div>
                    <div className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="hidden sm:inline">{catLabel(c.category)} · </span>
                      {splitLine(c)}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{money(Number(c.amount))}</span>
                  {isManager && (
                    <ActionButton
                      action={setBillRepeat.bind(null, c.id, !c.repeat_monthly)}
                      className={btn.icon}
                      icon={c.repeat_monthly ? "unrepeat" : "repeat"}
                      iconOnly
                    >
                      {c.repeat_monthly ? t("costs.stopRepeat") : t("costs.startRepeat")}
                    </ActionButton>
                  )}
                  {isManager && (
                    <ActionButton
                      action={deleteFixedCost.bind(null, c.id)}
                      confirm={t("costs.deleteConfirm", { title: c.title })}
                      className={btn.icon}
                      icon="delete"
                      iconOnly
                    >
                      {t("common.delete")}
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* who pays what */}
      {people.length > 0 && (
        <Card title={t("costs.whoPays")} icon={Users}>
          {/* phones: one card per person */}
          <ul className="space-y-2 md:hidden">
            {people.map(({ m, parts, total: tt }) => (
              <li key={m.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <Link href={{ pathname: `/members/${m.id}`, query: { month: month.slice(0, 7) } }} className="inline-flex min-h-8 items-center gap-2 font-medium hover:underline">
                    <Avatar name={m.display_name} className="size-7 text-xs" /> {m.display_name}
                  </Link>
                  <span className="font-bold tabular-nums">{money(tt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {costs.map((c, i) =>
                    parts[i] > 0 ? (
                      <span key={c.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                        {c.title} <b className="tabular-nums">{money(parts[i])}</b>
                      </span>
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* wider screens: the sheet-style table */}
          <div className="-mx-5 hidden overflow-x-auto px-5 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium dark:bg-slate-900">{t("common.member")}</th>
                  {costs.map((c) => (
                    <th key={c.id} className="whitespace-nowrap px-2 py-2 font-medium">{c.title}</th>
                  ))}
                  <th className="py-2 pl-3 font-semibold text-slate-700 dark:text-slate-200">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
                {people.map(({ m, parts, total: tt }) => (
                  <tr key={m.id} className="text-right hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="sticky left-0 bg-white py-2 pr-3 text-left dark:bg-slate-900">
                      <Link href={{ pathname: `/members/${m.id}`, query: { month: month.slice(0, 7) } }} className="inline-flex min-h-8 items-center gap-2 font-medium hover:underline">
                        <Avatar name={m.display_name} className="size-7 text-xs" /> {m.display_name}
                      </Link>
                    </td>
                    {parts.map((x, i) => (
                      <td key={costs[i].id} className={cn("px-2 py-2", x === 0 && "text-slate-300 dark:text-slate-600")}>
                        {x === 0 ? "-" : money(x)}
                      </td>
                    ))}
                    <td className="py-2 pl-3 font-semibold">{money(tt)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-right font-semibold tabular-nums dark:border-slate-700">
                  <td className="sticky left-0 bg-white py-2 pr-3 text-left dark:bg-slate-900">{t("common.total")}</td>
                  {costs.map((c) => (
                    <td key={c.id} className="px-2 py-2">{money(Number(c.amount))}</td>
                  ))}
                  <td className="py-2 pl-3">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {isManager && <p className="mt-3 text-xs text-slate-500">{t("costs.changeShares")}</p>}
        </Card>
      )}
    </div>
  );
}
