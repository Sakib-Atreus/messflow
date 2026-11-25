import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, MessageCircle, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { WalletChart } from "./charts";
import { Avatar, btn, Card, cn } from "./ui";
import { addDays } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import type { Wallet as WalletData } from "@/lib/meal-wallet";

/** "Meal money" card: how much is left after bills, how fast it goes, when it runs out. */
export async function MealMoneyCard({
  wallet, month, monthEnd, isMe, name, className,
}: { wallet: WalletData; month: string; monthEnd: string; isMe: boolean; name: string; className?: string }) {
  const t = await getTranslations("wallet");
  const locale = await getLocale();
  const money = (n: number) => fmtMoney(locale, n);
  const dayTitle = (d: string) => fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" });
  const monthDays: { key: string; tick: string; title: string }[] = [];
  for (let d = month; d <= monthEnd; d = addDays(d, 1)) monthDays.push({ key: d, tick: fmtNumber(locale, Number(d.slice(8)), 0), title: dayTitle(d) });

  const tone = {
    ok: { box: "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-200", Icon: CheckCircle2, label: t("statusOk") },
    idle: { box: "bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200", Icon: Clock, label: t("statusIdle") },
    low: { box: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200", Icon: AlertTriangle, label: t("statusLow") },
    out: { box: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200", Icon: CircleSlash, label: t("statusOut") },
  }[wallet.status];
  const days = wallet.daysLeft === null ? null : Math.max(0, Math.floor(wallet.daysLeft));
  const message =
    wallet.status === "out"
      ? t(isMe ? "msgOutMe" : "msgOut", { name, owe: money(Math.abs(wallet.left)), pay: money(wallet.suggest) })
      : wallet.status === "low"
        ? t(isMe ? "msgLowMe" : "msgLow", { name, days: fmtNumber(locale, days ?? 0), pay: money(wallet.suggest) })
        : wallet.status === "idle"
          ? t("msgIdle")
          : wallet.runOut
            ? t("msgOk", { date: fmtDate(locale, wallet.runOut, { day: "numeric", month: "long" }) })
            : t("msgOkMonth");

  return (
    <Card title={t("title")} icon={Wallet} className={className}>
      {/* status + the one sentence that matters */}
      <div className={cn("-mt-1 mb-4 flex items-start gap-3 rounded-xl px-3 py-2.5", tone.box)}>
        <tone.Icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-semibold">{tone.label}</div>
          <div className="text-sm opacity-90">{message}</div>
        </div>
      </div>

      {/* the numbers, in order: paid − bills = for meals; left now; pace; days left */}
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">{t("forMeals")}</dt>
          <dd className="font-semibold tabular-nums">{money(wallet.forMeals)}</dd>
          <dd className="text-xs text-slate-500">{t("forMealsHelp", { paid: money(wallet.paid), bills: money(wallet.bills) })}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">{wallet.left < 0 ? t("owesNow") : t("leftNow")}</dt>
          <dd className={cn("text-lg font-bold tabular-nums", wallet.left < 0 ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-400")}>
            {money(Math.abs(wallet.left))}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">{t("perDay")}</dt>
          <dd className="font-semibold tabular-nums">{money(Math.round(wallet.perDay))}</dd>
          <dd className="text-xs text-slate-500">{t("perDayHelp")}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">{t("daysLeft")}</dt>
          {wallet.status === "out" ? (
            <>
              <dd className="font-semibold text-red-600 dark:text-red-400">{t("finished")}</dd>
              {wallet.ranOutOn && (
                <dd className="text-xs text-slate-500">{t("ranOutOn", { date: fmtDate(locale, wallet.ranOutOn, { day: "numeric", month: "short" }) })}</dd>
              )}
            </>
          ) : (
            wallet.lastsMonth ? (
              <>
                <dd className="font-semibold text-brand-700 dark:text-brand-400">{t("wholeMonth")}</dd>
                <dd className="text-xs text-slate-500">
                  {t("endLeft", { amount: money(Math.max(0, Math.round(wallet.endLeft))), date: fmtDate(locale, monthEnd, { day: "numeric", month: "short" }) })}
                </dd>
              </>
            ) : (
              <>
                <dd className="font-semibold tabular-nums">{days === null ? "-" : t("daysValue", { n: fmtNumber(locale, days) })}</dd>
                {wallet.runOut && <dd className="text-xs text-slate-500">{t("until", { date: fmtDate(locale, wallet.runOut, { day: "numeric", month: "short" }) })}</dd>}
              </>
            )
          )}
        </div>
      </dl>

      {wallet.paid === 0 && wallet.bills === 0 && wallet.days.every((d) => Math.abs(d.left) < 0.005) ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">{t("emptyChart")}</p>
      ) : (
      <WalletChart
        label={t("title")}
        words={[t("tipMeals"), t("tipPaid")]}
        monthDays={monthDays}
        days={wallet.days.map((d) => ({ key: d.date, tick: "", title: dayTitle(d.date), left: d.left, mealCost: d.mealCost, paid: d.paid }))}
        forecast={wallet.forecast.map((f) => ({ key: f.date, left: f.left }))}
      />
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--chart-1)" }} />{t("legendLeft")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--chart-neg)" }} />{t("legendOwes")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />{t("legendForecast")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} />{t("legendPaid")}</span>
      </div>
    </Card>
  );
}

export type OverviewRow = {
  id: string;
  name: string;
  photo?: string | null;
  phone: string | null;
  status: WalletData["status"];
  left: number;
  perDay: number;
  daysLeft: number | null;
  runOut: string | null;
  ranOutOn: string | null;
  suggest: number;
  lastsMonth: boolean;
  endLeft: number;
};

/** "01712…" → "8801712…" for wa.me */
const waPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.startsWith("880") ? d : d.startsWith("0") ? `88${d}` : d.length >= 10 ? `880${d}` : "";
};

/** Manager's view: every member's meal money with the same sentence they see, most urgent first. */
export async function MealMoneyOverview({ rows, messName }: { rows: OverviewRow[]; messName: string }) {
  const t = await getTranslations("wallet");
  const locale = await getLocale();
  const money = (n: number) => fmtMoney(locale, n);
  const day = (d: string) => fmtDate(locale, d, { day: "numeric", month: "short" });
  const counts = { out: 0, low: 0, ok: 0, idle: 0 };
  for (const r of rows) counts[r.status]++;

  const look = {
    out: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300", Icon: CircleSlash, label: t("statusOut") },
    low: { dot: "bg-amber-500", text: "text-amber-800 dark:text-amber-300", Icon: AlertTriangle, label: t("statusLow") },
    ok: { dot: "bg-brand-500", text: "text-brand-800 dark:text-brand-300", Icon: CheckCircle2, label: t("statusOk") },
    idle: { dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", Icon: Clock, label: t("statusIdle") },
  };
  const sentence = (r: OverviewRow) => {
    const days = Math.max(0, Math.floor(r.daysLeft ?? 0));
    if (r.status === "out") return t("msgOut", { name: r.name, owe: money(Math.abs(r.left)), pay: money(r.suggest) });
    if (r.status === "low") return t("msgLow", { name: r.name, days: fmtNumber(locale, days), pay: money(r.suggest) });
    if (r.status === "idle") return t("msgIdleOther", { name: r.name });
    return r.runOut ? t("msgOkOther", { name: r.name, date: day(r.runOut) }) : t("msgOkOtherMonth", { name: r.name });
  };
  const nudge = (r: OverviewRow) =>
    `${r.status === "out" ? t("waOut", { name: r.name, owe: money(Math.abs(r.left)), pay: money(r.suggest), mess: messName }) : t("waLow", { name: r.name, days: fmtNumber(locale, Math.max(0, Math.floor(r.daysLeft ?? 0))), pay: money(r.suggest), mess: messName })}`;

  return (
    <Card
      title={t("overviewTitle")}
      icon={Wallet}
      className={counts.out ? "border-red-300 dark:border-red-900" : counts.low ? "border-amber-300 dark:border-amber-800" : undefined}
    >
      {/* summary chips */}
      <div className="-mt-1 mb-3 flex flex-wrap gap-2 text-xs font-medium">
        {(["out", "low", "ok"] as const).map((k) =>
          counts[k] ? (
            <span key={k} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", look[k].text, "border-current/20")}>
              <span className={cn("size-2 rounded-full", look[k].dot)} />
              {t(`count_${k}`, { count: counts[k] })}
            </span>
          ) : null,
        )}
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r) => {
          const L = look[r.status];
          const urgent = r.status === "out" || r.status === "low";
          const phone = waPhone(r.phone);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span className="relative shrink-0">
                <Avatar name={r.name} src={r.photo} className="size-9 text-xs" />
                <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900", L.dot)} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <Link href={`/members/${r.id}`} className="inline-flex min-h-8 items-center font-semibold hover:underline">
                  {r.name}
                </Link>
                <span className={cn("ml-2 text-xs font-medium", L.text)}>{L.label}</span>
                <p className="text-sm text-slate-600 dark:text-slate-300">{sentence(r)}</p>
              </div>
              <div className="text-right text-sm tabular-nums">
                <div className={cn("font-bold", r.left < 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100")}>
                  {r.left < 0 ? `−${money(Math.abs(r.left))}` : money(r.left)}
                </div>
                <div className="text-xs text-slate-500">
                  {r.status === "out" && r.ranOutOn
                    ? t("ranOutOn", { date: day(r.ranOutOn) })
                    : r.lastsMonth
                      ? t("wholeMonth")
                      : r.daysLeft !== null
                      ? t("daysLeftOnly", { n: fmtNumber(locale, Math.max(0, Math.floor(r.daysLeft))) })
                      : t("perDayShort", { amount: money(Math.round(r.perDay)) })}
                </div>
              </div>
              {urgent && (
                <a
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(nudge(r))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btn.small}
                >
                  <MessageCircle className="size-4" /> {t("remind")}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
