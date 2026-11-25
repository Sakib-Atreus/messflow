import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { addMonths, todayDhaka } from "@/lib/dates";
import { MonthPicker } from "./month-picker";
import { btn, cn } from "./ui";

/**
 * Month switcher: "This month · Last month" quick buttons plus ‹ month › arrows.
 * Sets ?month=YYYY-MM on the given path and keeps any other query values (e.g. the sheet tab).
 */
export async function MonthNav({ path, month, query = {} }: { path: string; month: string; query?: Record<string, string> }) {
  const t = await getTranslations("common");
  const thisMonth = `${todayDhaka().slice(0, 7)}-01`;
  const lastMonth = addMonths(thisMonth, -1);
  const link = (m: string) => ({ pathname: path, query: { ...query, month: m.slice(0, 7) } });
  const chip = (m: string, label: string) => (
    <Link
      href={link(m)}
      aria-current={month === m ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition",
        month === m
          ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400"
          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {chip(thisMonth, t("thisMonth"))}
        {chip(lastMonth, t("lastMonth"))}
      </div>
      <div className="flex items-center gap-1">
        <Link href={link(addMonths(month, -1))} className={btn.icon} aria-label={t("prev")}>
          <ChevronLeft className="size-4" />
        </Link>
        <MonthPicker path={path} month={month} thisMonth={thisMonth} query={query} />
        <Link href={link(addMonths(month, 1))} className={btn.icon} aria-label={t("next")}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function parseMonth(param: string | undefined, today: string): string {
  return param && /^\d{4}-\d{2}$/.test(param) ? `${param}-01` : `${today.slice(0, 7)}-01`;
}
